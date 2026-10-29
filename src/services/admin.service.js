const mongoose = require("mongoose");
const { User } = require("../models/user.model");
const { Wallet } = require("../models/wallet.model");
const { Transaction } = require("../models/transaction.model");
const { AuditLog } = require("../models/auditLog.model");
const AppError = require("../utils/AppError");

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class AdminService {
    async listUsers({ search, role, isActive, page = 1, limit = 10 }) {
        const query = {};

        if (role) {
            query.role = role;
        }

        if (isActive !== undefined && isActive !== "") {
            query.isActive = isActive === "true" || isActive === true;
        }

        if (search && typeof search === "string" && search.trim()) {
            const escaped = escapeRegex(search.trim());
            const regex = new RegExp(escaped, "i");
            query.$or = [{ name: regex }, { email: regex }];
        }

        const numericPage = Math.max(parseInt(page, 10) || 1, 1);
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const skip = (numericPage - 1) * numericLimit;

        const [users, total] = await Promise.all([
            User.find(query).sort({ createdAt: -1 }).skip(skip).limit(numericLimit),
            User.countDocuments(query),
        ]);

        return {
            users: users.map((u) => u.toJSON()),
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                totalPages: Math.ceil(total / numericLimit) || 1,
            },
        };
    }

    async updateUserRole({ adminId, targetUserId, newRole, reason, ipAddress, userAgent }) {
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            throw new AppError("Invalid user ID", 400);
        }

        const user = await User.findById(targetUserId);
        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Prevent self-demotion: an admin cannot demote their own account away from admin
        if (adminId.toString() === targetUserId.toString() && newRole !== "admin") {
            throw new AppError("Administrators cannot demote their own account", 400);
        }

        // Prevent demoting the last active administrator (K-004)
        if (user.role === "admin" && newRole !== "admin") {
            const activeAdminCount = await User.countDocuments({ role: "admin", isActive: true });
            if (activeAdminCount <= 1) {
                throw new AppError("Cannot demote the last active administrator", 400);
            }
        }

        const previousRole = user.role;
        user.role = newRole;
        await user.save();

        // Write immutable audit log
        await AuditLog.create({
            administrator: adminId,
            action: "ROLE_CHANGE",
            targetResource: `User:${targetUserId}`,
            details: {
                previousRole,
                newRole,
                userEmail: user.email,
            },
            reason,
            ipAddress,
            userAgent,
        });

        return user.toJSON();
    }

    async listTransactions({ status, senderId, receiverId, userId, startDate, endDate, page = 1, limit = 10 }) {
        const query = {};

        if (status) {
            query.status = status;
        }

        if (userId && mongoose.Types.ObjectId.isValid(userId)) {
            query.$or = [{ senderId: userId }, { receiverId: userId }];
        }

        if (senderId && mongoose.Types.ObjectId.isValid(senderId)) {
            query.senderId = senderId;
        }

        if (receiverId && mongoose.Types.ObjectId.isValid(receiverId)) {
            query.receiverId = receiverId;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                const parsedStart = new Date(startDate);
                if (!isNaN(parsedStart.getTime())) {
                    query.createdAt.$gte = parsedStart;
                }
            }
            if (endDate) {
                const parsedEnd = new Date(endDate);
                if (!isNaN(parsedEnd.getTime())) {
                    query.createdAt.$lte = parsedEnd;
                }
            }
        }

        const numericPage = Math.max(parseInt(page, 10) || 1, 1);
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
        const skip = (numericPage - 1) * numericLimit;

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(numericLimit)
                .populate("senderId", "name email role")
                .populate("receiverId", "name email role"),
            Transaction.countDocuments(query),
        ]);

        return {
            transactions: transactions.map((t) => t.toJSON()),
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                totalPages: Math.ceil(total / numericLimit) || 1,
            },
        };
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

    async updateTransactionStatus({ adminId, transactionId, newStatus, reason, ipAddress, userAgent }) {
        // Query by transactionId (UUID string) or by MongoDB ObjectId if provided
        const isObjectId = mongoose.Types.ObjectId.isValid(transactionId);
        const query = isObjectId
            ? { $or: [{ _id: transactionId }, { transactionId }] }
            : { transactionId };

        const transaction = await Transaction.findOne(query);
        if (!transaction) {
            throw new AppError("Transaction not found", 404);
        }

        if (transaction.status === newStatus) {
            throw new AppError(`Transaction is already in status '${newStatus}'`, 400);
        }

        const previousStatus = transaction.status;

        // Terminal states cannot be changed
        if (["failed", "cancelled", "reversed"].includes(previousStatus)) {
            throw new AppError(`Transactions in status '${previousStatus}' are terminal and cannot be modified`, 400);
        }

        // State Machine validation
        if (previousStatus === "pending") {
            if (!["success", "failed", "cancelled"].includes(newStatus)) {
                throw new AppError(`Cannot transition pending transaction to '${newStatus}'`, 400);
            }
        } else if (previousStatus === "success") {
            // Completed transfer: prevent arbitrary changes, permit only reversal (K-003)
            if (newStatus !== "reversed") {
                throw new AppError(
                    `Arbitrary changes to completed transfers are not permitted. Completed transfers can only be transitioned to 'reversed'`,
                    400
                );
            }
        }

        // Financial reversal branch
        if (newStatus === "reversed") {
            return this._executeTransactionReversal({
                adminId,
                transaction,
                reason,
                ipAddress,
                userAgent,
            });
        }

        // Non-reversal status transition (pending -> success / failed / cancelled)
        transaction.status = newStatus;
        await transaction.save();

        // Write immutable audit log
        await AuditLog.create({
            administrator: adminId,
            action: "TRANSACTION_STATUS_UPDATE",
            targetResource: `Transaction:${transaction.transactionId}`,
            details: {
                previousStatus,
                newStatus,
                amount: transaction.amount,
                senderId: transaction.senderId,
                receiverId: transaction.receiverId,
            },
            reason,
            ipAddress,
            userAgent,
        });

        return transaction.toJSON ? transaction.toJSON() : transaction;
    }

    async _executeTransactionReversal({ adminId, transaction, reason, ipAddress, userAgent }) {
        // Preliminary check: recipient wallet must exist and have sufficient funds
        const receiverWallet = await Wallet.findOne({ userId: transaction.receiverId });
        if (!receiverWallet || receiverWallet.balance < transaction.amount) {
            throw new AppError("Cannot reverse transaction: recipient has insufficient wallet balance", 400);
        }

        const senderWallet = await Wallet.findOne({ userId: transaction.senderId });
        if (!senderWallet) {
            throw new AppError("Cannot reverse transaction: sender wallet not found", 400);
        }

        let session = null;
        try {
            session = await mongoose.startSession();
        } catch (sessionErr) {
            if (this._isUnsupportedTransactionError(sessionErr)) {
                throw new AppError(
                    "Transaction reversal requires a MongoDB replica set for multi-document ACID atomicity. Standalone deployments cannot safely guarantee balance reversal.",
                    500
                );
            }
            throw sessionErr;
        }

        if (!session || typeof session.withTransaction !== "function") {
            if (session && typeof session.endSession === "function") {
                await session.endSession();
            }
            throw new AppError(
                "Transaction reversal requires a MongoDB replica set with session.withTransaction() support. Standalone deployments cannot safely guarantee balance reversal.",
                500
            );
        }

        try {
            let reversedTx = null;

            const executeReversalOperations = async (sess) => {
                // 1. Atomic Compare-And-Swap on transaction status to prevent duplicate / concurrent reversal
                const lockedTx = await Transaction.findOneAndUpdate(
                    { _id: transaction._id, status: "success" },
                    { $set: { status: "reversed" } },
                    { returnDocument: "after", session: sess }
                );

                if (!lockedTx) {
                    throw new AppError(
                        "Transaction is already in status 'reversed' or has been modified concurrently",
                        400
                    );
                }

                // 2. Conditional recipient debit: verify recipient wallet has sufficient balance
                const debitedWallet = await Wallet.findOneAndUpdate(
                    { userId: transaction.receiverId, balance: { $gte: transaction.amount } },
                    { $inc: { balance: -transaction.amount } },
                    { returnDocument: "after", session: sess }
                );

                if (!debitedWallet) {
                    throw new AppError("Cannot reverse transaction: recipient has insufficient wallet balance", 400);
                }

                // 3. Sender credit: ensure sender wallet exists and is updated
                const creditedWallet = await Wallet.findOneAndUpdate(
                    { userId: transaction.senderId },
                    { $inc: { balance: transaction.amount } },
                    { returnDocument: "after", session: sess }
                );

                if (!creditedWallet) {
                    throw new AppError("Failed to credit sender wallet during reversal", 500);
                }

                // 4. Record audit log within the same session boundary
                await AuditLog.create(
                    [
                        {
                            administrator: adminId,
                            action: "TRANSACTION_REVERSAL",
                            targetResource: `Transaction:${transaction.transactionId}`,
                            details: {
                                previousStatus: "success",
                                newStatus: "reversed",
                                amount: transaction.amount,
                                senderId: transaction.senderId,
                                receiverId: transaction.receiverId,
                            },
                            reason,
                            ipAddress,
                            userAgent,
                        },
                    ],
                    { session: sess }
                );

                reversedTx = lockedTx;
            };

            await session.withTransaction(() => executeReversalOperations(session));

            return reversedTx.toJSON ? reversedTx.toJSON() : reversedTx;
        } catch (err) {
            if (this._isUnsupportedTransactionError(err)) {
                throw new AppError(
                    "Transaction reversal requires a MongoDB replica set for multi-document ACID atomicity. Standalone deployments cannot safely guarantee balance reversal.",
                    500
                );
            }
            throw err;
        } finally {
            if (session && typeof session.endSession === "function") {
                await session.endSession();
            }
        }
    }

    async getAuditLogs({ action, administrator, page = 1, limit = 20 }) {
        const query = {};
        if (action) {
            query.action = action;
        }
        if (administrator && mongoose.Types.ObjectId.isValid(administrator)) {
            query.administrator = administrator;
        }

        const numericPage = Math.max(parseInt(page, 10) || 1, 1);
        const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
        const skip = (numericPage - 1) * numericLimit;

        const [logs, total] = await Promise.all([
            AuditLog.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(numericLimit)
                .populate("administrator", "name email role"),
            AuditLog.countDocuments(query),
        ]);

        return {
            auditLogs: logs,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                totalPages: Math.ceil(total / numericLimit) || 1,
            },
        };
    }
}

module.exports = new AdminService();
