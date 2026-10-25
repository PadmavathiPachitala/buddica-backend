const mongoose = require("mongoose");
const { Wallet } = require("../models/wallet.model");
const { Transaction } = require("../models/transaction.model");
const { User } = require("../models/user.model");
const AppError = require("../utils/AppError");

class WalletService {
    async getOrCreateWallet(userId) {
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = await Wallet.create({
                userId,
                balance: 0,
                currency: "INR",
            });
        }
        return wallet.toJSON();
    }

    async getWalletBalance(userId) {
        const wallet = await this.getOrCreateWallet(userId);
        return {
            walletId: wallet._id,
            balance: wallet.balance,
            currency: wallet.currency,
            updatedAt: wallet.updatedAt,
        };
    }

    async transferFunds({ senderId, receiverId, amount, description, idempotencyKey }) {
        // 1. Idempotency Check: if key provided, prevent duplicate execution
        if (idempotencyKey) {
            const existingTx = await Transaction.findOne({ idempotencyKey, senderId });
            if (existingTx) {
                return {
                    transaction: existingTx.toJSON(),
                    isDuplicate: true,
                };
            }
        }

        // 2. Validate Recipient
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            throw new AppError("Recipient account does not exist", 404);
        }

        if (!receiver.isActive) {
            throw new AppError("Recipient account is deactivated", 400);
        }

        if (receiver.role !== "customer") {
            throw new AppError("Funds can only be transferred to customer accounts", 400);
        }

        // 3. Ensure recipient has a wallet initialized
        await this.getOrCreateWallet(receiver._id);

        // 4. Atomic Double-Entry Balance Transfer
        let session = null;
        let useTransaction = false;

        try {
            session = await mongoose.startSession();
            useTransaction = true;
        } catch {
            // Standalone MongoDB instances do not support replica set sessions; fallback to atomic conditional updates
            useTransaction = false;
        }

        if (useTransaction) {
            let resultTransaction = null;
            let resultBalance = null;
            let isDuplicateResult = false;

            const executeTransferOperations = async (sess) => {
                // Check if transaction was already completed concurrently under this idempotency key
                if (idempotencyKey) {
                    const existingTx = await Transaction.findOne({ idempotencyKey, senderId }).session(sess);
                    if (existingTx) {
                        resultTransaction = existingTx.toJSON();
                        isDuplicateResult = true;
                        return;
                    }
                }

                // Check and debit sender wallet atomically inside session
                const senderWallet = await Wallet.findOneAndUpdate(
                    { userId: senderId, balance: { $gte: amount } },
                    { $inc: { balance: -amount } },
                    { returnDocument: "after", session: sess }
                );

                if (!senderWallet) {
                    throw new AppError("Insufficient wallet balance for this transfer", 400);
                }

                // Credit receiver wallet
                const receiverWallet = await Wallet.findOneAndUpdate(
                    { userId: receiverId },
                    { $inc: { balance: amount } },
                    { returnDocument: "after", session: sess }
                );

                if (!receiverWallet) {
                    throw new AppError("Failed to credit recipient wallet", 500);
                }

                // Record transaction record
                const [transaction] = await Transaction.create(
                    [
                        {
                            senderId,
                            receiverId,
                            amount,
                            type: "transfer",
                            status: "success",
                            idempotencyKey: idempotencyKey || undefined,
                            description: description || undefined,
                        },
                    ],
                    { session: sess }
                );

                resultTransaction = transaction.toJSON();
                resultBalance = senderWallet.balance;
            };

            try {
                if (typeof session.withTransaction === "function") {
                    await session.withTransaction(() => executeTransferOperations(session));
                } else {
                    if (typeof session.startTransaction === "function") {
                        session.startTransaction();
                    }
                    await executeTransferOperations(session);
                    if (typeof session.commitTransaction === "function") {
                        await session.commitTransaction();
                    }
                }

                if (isDuplicateResult) {
                    return {
                        transaction: resultTransaction,
                        isDuplicate: true,
                    };
                }

                return {
                    transaction: resultTransaction,
                    newBalance: resultBalance,
                };
            } catch (err) {
                if (session && typeof session.inTransaction === "function" && session.inTransaction()) {
                    if (typeof session.abortTransaction === "function") {
                        await session.abortTransaction();
                    }
                }

                // Concurrent Idempotency Key collision (K-001)
                if (err.code === 11000 && idempotencyKey) {
                    const committed = await Transaction.findOne({ idempotencyKey, senderId });
                    if (committed) {
                        return {
                            transaction: committed.toJSON(),
                            isDuplicate: true,
                        };
                    }
                }

                // Standalone MongoDB fallback if deployment does not support replica set transactions (K-002)
                if (this._isUnsupportedTransactionError(err)) {
                    return this._executeConditionalTransfer({
                        senderId,
                        receiverId,
                        amount,
                        description,
                        idempotencyKey,
                    });
                }

                throw err;
            } finally {
                if (session && typeof session.endSession === "function") {
                    await session.endSession();
                }
            }
        } else {
            return this._executeConditionalTransfer({
                senderId,
                receiverId,
                amount,
                description,
                idempotencyKey,
            });
        }
    }

    _isUnsupportedTransactionError(err) {
        if (!err) return false;
        const msg = (err.message || "").toLowerCase();
        return (
            err.code === 20 ||
            err.codeName === "IllegalOperation" ||
            msg.includes("does not support retryable writes") ||
            msg.includes("transaction numbers are only allowed on a replica set") ||
            msg.includes("transactions are not supported")
        );
    }

    async _executeConditionalTransfer({ senderId, receiverId, amount, description, idempotencyKey }) {
        // Fallback atomic conditional operation (prevents negative balance via $gte condition)
        const senderWallet = await Wallet.findOneAndUpdate(
            { userId: senderId, balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { returnDocument: "after" }
        );

        if (!senderWallet) {
            throw new AppError("Insufficient wallet balance for this transfer", 400);
        }

        try {
            const receiverWallet = await Wallet.findOneAndUpdate(
                { userId: receiverId },
                { $inc: { balance: amount } },
                { returnDocument: "after" }
            );

            if (!receiverWallet) {
                // Rollback debit
                await Wallet.updateOne({ userId: senderId }, { $inc: { balance: amount } });
                throw new AppError("Failed to credit recipient wallet", 500);
            }
        } catch (err) {
            if (err instanceof AppError) throw err;
            await Wallet.updateOne({ userId: senderId }, { $inc: { balance: amount } });
            throw err;
        }

        try {
            const transaction = await Transaction.create({
                senderId,
                receiverId,
                amount,
                type: "transfer",
                status: "success",
                idempotencyKey: idempotencyKey || undefined,
                description: description || undefined,
            });

            return {
                transaction: transaction.toJSON(),
                newBalance: senderWallet.balance,
            };
        } catch (createErr) {
            // Compensating balance rollback
            await Wallet.updateOne({ userId: receiverId }, { $inc: { balance: -amount } });
            await Wallet.updateOne({ userId: senderId }, { $inc: { balance: amount } });

            if (createErr.code === 11000 && idempotencyKey) {
                const committed = await Transaction.findOne({ idempotencyKey, senderId });
                if (committed) {
                    return {
                        transaction: committed.toJSON(),
                        isDuplicate: true,
                    };
                }
            }
            throw createErr;
        }
    }

    async getCustomerTransactions({ userId, page = 1, limit = 10, status }) {
        const query = {
            $or: [{ senderId: userId }, { receiverId: userId }],
        };

        if (status) {
            query.status = status;
        }

        const numericPage = Math.max(parseInt(page, 10) || 1, 1);
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
        const skip = (numericPage - 1) * numericLimit;

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(numericLimit)
                .populate("senderId", "name email")
                .populate("receiverId", "name email"),
            Transaction.countDocuments(query),
        ]);

        // Enrich with directional metadata (debit vs credit from perspective of the authenticated customer)
        const enriched = transactions.map((tx) => {
            const raw = tx.toJSON();
            const isSender = raw.senderId && raw.senderId._id ? raw.senderId._id.toString() === userId.toString() : raw.senderId.toString() === userId.toString();
            return {
                ...raw,
                direction: isSender ? "debit" : "credit",
            };
        });

        return {
            transactions: enriched,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                totalPages: Math.ceil(total / numericLimit) || 1,
            },
        };
    }
}

module.exports = new WalletService();
