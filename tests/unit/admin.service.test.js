const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const adminService = require("../../src/services/admin.service");
const { User } = require("../../src/models/user.model");
const { Transaction } = require("../../src/models/transaction.model");
const { Wallet } = require("../../src/models/wallet.model");
const { AuditLog } = require("../../src/models/auditLog.model");
const AppError = require("../../src/utils/AppError");
const mongoose = require("mongoose");

describe("Admin Service - Unit Tests (Safeguards & State Machine)", () => {
    describe("updateUserRole safeguards", () => {
        it("should reject admin self-demotion with 400", async () => {
            const adminId = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;
            User.findById = async () => ({ _id: adminId, role: "admin", email: "admin@example.com" });

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateUserRole({
                            adminId,
                            targetUserId: adminId.toString(),
                            newRole: "customer",
                            reason: "Accidental demotion",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("cannot demote their own account")
                );
            } finally {
                User.findById = originalFindById;
            }
        });

        it("should reject demoting the last active administrator with 400 (K-004)", async () => {
            const adminId1 = new mongoose.Types.ObjectId();
            const adminId2 = new mongoose.Types.ObjectId();
            const originalFindById = User.findById;
            const originalCountDocuments = User.countDocuments;

            User.findById = async () => ({ _id: adminId2, role: "admin", email: "admin2@example.com" });
            User.countDocuments = async () => 1; // Only 1 active admin in the system

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateUserRole({
                            adminId: adminId1,
                            targetUserId: adminId2.toString(),
                            newRole: "support",
                            reason: "Demoting sole remaining admin",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("last active administrator")
                );
            } finally {
                User.findById = originalFindById;
                User.countDocuments = originalCountDocuments;
            }
        });
    });

    describe("updateTransactionStatus state machine", () => {
        it("should reject arbitrary status change on completed (success) transfer (K-003)", async () => {
            const originalFindOne = Transaction.findOne;
            Transaction.findOne = async () => ({
                transactionId: "tx-completed-123",
                status: "success",
                amount: 5000,
            });

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: "tx-completed-123",
                            newStatus: "failed",
                            reason: "Arbitrary status change attempt",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("Arbitrary changes to completed transfers are not permitted")
                );
            } finally {
                Transaction.findOne = originalFindOne;
            }
        });

        it("should reject modifying terminal failed transaction", async () => {
            const originalFindOne = Transaction.findOne;
            Transaction.findOne = async () => ({
                transactionId: "tx-failed-123",
                status: "failed",
            });

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: "tx-failed-123",
                            newStatus: "success",
                            reason: "Attempting resurrection of failed tx",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("terminal")
                );
            } finally {
                Transaction.findOne = originalFindOne;
            }
        });

        it("should reject setting the same status repeatedly", async () => {
            const originalFindOne = Transaction.findOne;
            Transaction.findOne = async () => ({
                transactionId: "tx-pending-123",
                status: "pending",
            });

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: "tx-pending-123",
                            newStatus: "pending",
                            reason: "No-op transition",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("already in status")
                );
            } finally {
                Transaction.findOne = originalFindOne;
            }
        });

        it("should reject reversing when recipient has insufficient balance", async () => {
            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;

            Transaction.findOne = async () => ({
                _id: new mongoose.Types.ObjectId(),
                transactionId: "tx-rev-123",
                status: "success",
                amount: 10000,
                receiverId: new mongoose.Types.ObjectId(),
                senderId: new mongoose.Types.ObjectId(),
            });

            Wallet.findOne = async () => ({
                balance: 2000, // Insufficient: needs 10000
            });

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: "tx-rev-123",
                            newStatus: "reversed",
                            reason: "Dispute reversal",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("recipient has insufficient wallet balance")
                );
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
            }
        });
    });

    describe("Transaction Reversal Consistency & Regression Tests", () => {
        function createMockSession() {
            let aborted = false;
            let committed = false;
            const session = {
                withTransaction: async (fn) => {
                    try {
                        const result = await fn(session);
                        committed = true;
                        return result;
                    } catch (err) {
                        aborted = true;
                        throw err;
                    }
                },
                startTransaction: () => {},
                commitTransaction: async () => { committed = true; },
                abortTransaction: async () => { aborted = true; },
                endSession: async () => {},
                inTransaction: () => !aborted && !committed,
                get isAborted() { return aborted; },
                get isCommitted() { return committed; },
            };
            return session;
        }

        it("Scenario 1: Successful reversal debits the recipient and credits the sender exactly once inside session", async () => {
            const txId = new mongoose.Types.ObjectId();
            const senderId = new mongoose.Types.ObjectId();
            const receiverId = new mongoose.Types.ObjectId();
            const adminId = new mongoose.Types.ObjectId();

            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateTx = Transaction.findOneAndUpdate;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            const originalAuditCreate = AuditLog.create;
            const originalStartSession = mongoose.startSession;

            const mockSession = createMockSession();
            let walletDebited = null;
            let walletCredited = null;
            let auditCreated = null;

            Transaction.findOne = async () => ({
                _id: txId,
                transactionId: "tx-success-001",
                status: "success",
                amount: 3000,
                senderId,
                receiverId,
                toJSON: () => ({ _id: txId, transactionId: "tx-success-001", status: "success" }),
            });

            Wallet.findOne = async ({ userId }) => {
                if (userId.toString() === receiverId.toString()) return { balance: 5000 };
                if (userId.toString() === senderId.toString()) return { balance: 1000 };
                return null;
            };

            mongoose.startSession = async () => mockSession;

            Transaction.findOneAndUpdate = async (filter, update) => {
                assert.equal(filter._id.toString(), txId.toString());
                assert.equal(filter.status, "success");
                assert.equal(update.$set.status, "reversed");
                return {
                    _id: txId,
                    transactionId: "tx-success-001",
                    status: "reversed",
                    amount: 3000,
                    senderId,
                    receiverId,
                    toJSON: () => ({ transactionId: "tx-success-001", status: "reversed" }),
                };
            };

            Wallet.findOneAndUpdate = async (filter, update) => {
                if (filter.userId.toString() === receiverId.toString()) {
                    assert.equal(filter.balance.$gte, 3000);
                    assert.equal(update.$inc.balance, -3000);
                    walletDebited = { userId: receiverId, debited: 3000 };
                    return { userId: receiverId, balance: 2000 };
                }
                if (filter.userId.toString() === senderId.toString()) {
                    assert.equal(update.$inc.balance, 3000);
                    walletCredited = { userId: senderId, credited: 3000 };
                    return { userId: senderId, balance: 4000 };
                }
                return null;
            };

            AuditLog.create = async (records) => {
                auditCreated = records[0];
                return records;
            };

            try {
                const result = await adminService.updateTransactionStatus({
                    adminId,
                    transactionId: txId.toString(),
                    newStatus: "reversed",
                    reason: "Verified customer dispute reversal",
                    ipAddress: "127.0.0.1",
                    userAgent: "TestAgent/1.0",
                });

                assert.equal(result.status, "reversed");
                assert.ok(walletDebited, "Recipient must be debited");
                assert.ok(walletCredited, "Sender must be credited");
                assert.ok(auditCreated, "Audit log must be created");
                assert.equal(auditCreated.action, "TRANSACTION_REVERSAL");
                assert.ok(mockSession.isCommitted, "Session must be committed");
                assert.equal(mockSession.isAborted, false);
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Transaction.findOneAndUpdate = originalFindOneAndUpdateTx;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
                AuditLog.create = originalAuditCreate;
                mongoose.startSession = originalStartSession;
            }
        });

        it("Scenario 2: Repeating a reversal does not refund again and touches no wallets", async () => {
            const originalFindOneTx = Transaction.findOne;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            let walletTouchCount = 0;

            Transaction.findOne = async () => ({
                _id: new mongoose.Types.ObjectId(),
                transactionId: "tx-already-rev",
                status: "reversed", // Already terminal reversed status
            });

            Wallet.findOneAndUpdate = async () => {
                walletTouchCount++;
                return {};
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: "tx-already-rev",
                            newStatus: "reversed",
                            reason: "Repeated reversal attempt",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("already in status 'reversed'")
                );
                assert.equal(walletTouchCount, 0, "No wallets should be touched on repeated reversal");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
            }
        });

        it("Scenario 3: Concurrent reversal requests cannot refund twice (Atomic CAS check)", async () => {
            const txId = new mongoose.Types.ObjectId();
            const senderId = new mongoose.Types.ObjectId();
            const receiverId = new mongoose.Types.ObjectId();

            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateTx = Transaction.findOneAndUpdate;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            const originalStartSession = mongoose.startSession;

            const mockSession = createMockSession();
            let walletCallCount = 0;

            Transaction.findOne = async () => ({
                _id: txId,
                transactionId: "tx-concurrent-01",
                status: "success",
                amount: 2000,
                senderId,
                receiverId,
            });

            Wallet.findOne = async () => ({ balance: 5000 });
            mongoose.startSession = async () => mockSession;

            // Simulate race: another request already updated status away from 'success'
            Transaction.findOneAndUpdate = async () => null;

            Wallet.findOneAndUpdate = async () => {
                walletCallCount++;
                return {};
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: txId.toString(),
                            newStatus: "reversed",
                            reason: "Concurrent dispute update",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("already in status 'reversed' or has been modified concurrently")
                );

                assert.equal(walletCallCount, 0, "Wallets must NOT be updated when CAS status update fails");
                assert.ok(mockSession.isAborted, "Session must abort on CAS race loss");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Transaction.findOneAndUpdate = originalFindOneAndUpdateTx;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
                mongoose.startSession = originalStartSession;
            }
        });

        it("Scenario 4: Insufficient recipient balance on preliminary check prevents sender credit", async () => {
            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            let senderCredited = false;

            Transaction.findOne = async () => ({
                _id: new mongoose.Types.ObjectId(),
                transactionId: "tx-insufficient-01",
                status: "success",
                amount: 8000,
                senderId: new mongoose.Types.ObjectId(),
                receiverId: new mongoose.Types.ObjectId(),
            });

            Wallet.findOne = async () => ({
                balance: 1000, // Insufficient: needs 8000
            });

            Wallet.findOneAndUpdate = async () => {
                senderCredited = true;
                return {};
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: "tx-insufficient-01",
                            newStatus: "reversed",
                            reason: "Overdraft reversal prevention",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("recipient has insufficient wallet balance")
                );

                assert.equal(senderCredited, false, "Sender must NEVER be credited when recipient balance is insufficient");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
            }
        });

        it("Scenario 5: Failed recipient debit inside transaction aborts and prevents sender credit", async () => {
            const txId = new mongoose.Types.ObjectId();
            const senderId = new mongoose.Types.ObjectId();
            const receiverId = new mongoose.Types.ObjectId();

            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateTx = Transaction.findOneAndUpdate;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            const originalStartSession = mongoose.startSession;

            const mockSession = createMockSession();
            let senderCredited = false;

            Transaction.findOne = async () => ({
                _id: txId,
                transactionId: "tx-race-debit-01",
                status: "success",
                amount: 4000,
                senderId,
                receiverId,
            });

            // Preliminary check passes
            Wallet.findOne = async () => ({ balance: 5000 });
            mongoose.startSession = async () => mockSession;

            Transaction.findOneAndUpdate = async () => ({
                _id: txId,
                status: "reversed",
            });

            // During transaction, recipient debit fails (e.g. concurrent spend)
            Wallet.findOneAndUpdate = async (filter) => {
                if (filter.userId.toString() === receiverId.toString()) {
                    return null; // Debit failed!
                }
                if (filter.userId.toString() === senderId.toString()) {
                    senderCredited = true;
                    return {};
                }
                return null;
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: txId.toString(),
                            newStatus: "reversed",
                            reason: "Mid-transaction balance exhaustion",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("recipient has insufficient wallet balance")
                );

                assert.equal(senderCredited, false, "Sender credit must NOT be executed when recipient debit returns null");
                assert.ok(mockSession.isAborted, "Session must abort when recipient debit fails");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Transaction.findOneAndUpdate = originalFindOneAndUpdateTx;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
                mongoose.startSession = originalStartSession;
            }
        });

        it("Scenario 6: AuditLog failure rolls back the entire transaction", async () => {
            const txId = new mongoose.Types.ObjectId();
            const senderId = new mongoose.Types.ObjectId();
            const receiverId = new mongoose.Types.ObjectId();

            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateTx = Transaction.findOneAndUpdate;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            const originalAuditCreate = AuditLog.create;
            const originalStartSession = mongoose.startSession;

            const mockSession = createMockSession();

            Transaction.findOne = async () => ({
                _id: txId,
                transactionId: "tx-audit-fail-01",
                status: "success",
                amount: 2500,
                senderId,
                receiverId,
            });

            Wallet.findOne = async () => ({ balance: 5000 });
            mongoose.startSession = async () => mockSession;

            Transaction.findOneAndUpdate = async () => ({
                _id: txId,
                status: "reversed",
            });

            Wallet.findOneAndUpdate = async () => ({ balance: 1000 });

            // AuditLog creation throws an unexpected error
            AuditLog.create = async () => {
                throw new Error("Audit log database disk failure");
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: txId.toString(),
                            newStatus: "reversed",
                            reason: "Audit failure test",
                        });
                    },
                    (err) => err.message.includes("Audit log database disk failure")
                );

                assert.ok(mockSession.isAborted, "Session must abort when audit log creation fails");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Transaction.findOneAndUpdate = originalFindOneAndUpdateTx;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
                AuditLog.create = originalAuditCreate;
                mongoose.startSession = originalStartSession;
            }
        });

        it("Scenario 7: Transaction record update failure does not leave inconsistent balances", async () => {
            const txId = new mongoose.Types.ObjectId();
            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateTx = Transaction.findOneAndUpdate;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            const originalStartSession = mongoose.startSession;

            const mockSession = createMockSession();
            let walletTouched = false;

            Transaction.findOne = async () => ({
                _id: txId,
                transactionId: "tx-update-fail-01",
                status: "success",
                amount: 3000,
                senderId: new mongoose.Types.ObjectId(),
                receiverId: new mongoose.Types.ObjectId(),
            });

            Wallet.findOne = async () => ({ balance: 6000 });
            mongoose.startSession = async () => mockSession;

            // Transaction update throws database exception
            Transaction.findOneAndUpdate = async () => {
                throw new Error("Simulated connection timeout during status CAS");
            };

            Wallet.findOneAndUpdate = async () => {
                walletTouched = true;
                return {};
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: txId.toString(),
                            newStatus: "reversed",
                            reason: "DB error test",
                        });
                    },
                    (err) => err.message.includes("Simulated connection timeout during status CAS")
                );

                assert.equal(walletTouched, false, "Wallets must never be touched if status CAS update throws");
                assert.ok(mockSession.isAborted, "Session must abort on transaction update failure");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Transaction.findOneAndUpdate = originalFindOneAndUpdateTx;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
                mongoose.startSession = originalStartSession;
            }
        });

        it("Scenario 8: Standalone MongoDB deployment fails safely and explicitly without mutating wallets", async () => {
            const txId = new mongoose.Types.ObjectId();
            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            const originalStartSession = mongoose.startSession;

            let walletModified = false;

            Transaction.findOne = async () => ({
                _id: txId,
                transactionId: "tx-standalone-01",
                status: "success",
                amount: 1500,
                senderId: new mongoose.Types.ObjectId(),
                receiverId: new mongoose.Types.ObjectId(),
            });

            Wallet.findOne = async () => ({ balance: 4000 });

            // Simulate standalone MongoDB error (code 20 / IllegalOperation)
            mongoose.startSession = async () => {
                const err = new Error("transaction numbers are only allowed on a replica set member or mongos");
                err.code = 20;
                err.codeName = "IllegalOperation";
                throw err;
            };

            Wallet.findOneAndUpdate = async () => {
                walletModified = true;
                return {};
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: txId.toString(),
                            newStatus: "reversed",
                            reason: "Testing standalone handling",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 500 && err.message.includes("Transaction reversal requires a MongoDB replica set")
                );

                assert.equal(walletModified, false, "Wallets must NOT be modified in unsafe standalone mode");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
                mongoose.startSession = originalStartSession;
            }
        });

        it("Scenario 9: Missing session.withTransaction fails clearly before executing any financial writes", async () => {
            const txId = new mongoose.Types.ObjectId();
            const originalFindOneTx = Transaction.findOne;
            const originalFindOneWallet = Wallet.findOne;
            const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
            const originalStartSession = mongoose.startSession;

            let walletModified = false;
            let sessionEnded = false;

            Transaction.findOne = async () => ({
                _id: txId,
                transactionId: "tx-no-with-tx-01",
                status: "success",
                amount: 1500,
                senderId: new mongoose.Types.ObjectId(),
                receiverId: new mongoose.Types.ObjectId(),
            });

            Wallet.findOne = async () => ({ balance: 4000 });

            // Mock session without withTransaction method
            mongoose.startSession = async () => ({
                endSession: async () => { sessionEnded = true; },
            });

            Wallet.findOneAndUpdate = async () => {
                walletModified = true;
                return {};
            };

            try {
                await assert.rejects(
                    async () => {
                        await adminService.updateTransactionStatus({
                            adminId: new mongoose.Types.ObjectId(),
                            transactionId: txId.toString(),
                            newStatus: "reversed",
                            reason: "Testing missing withTransaction",
                        });
                    },
                    (err) => err instanceof AppError && err.statusCode === 500 && err.message.includes("requires a MongoDB replica set with session.withTransaction() support")
                );

                assert.equal(walletModified, false, "Wallets must NOT be modified when withTransaction is missing");
                assert.equal(sessionEnded, true, "Session must be closed cleanly");
            } finally {
                Transaction.findOne = originalFindOneTx;
                Wallet.findOne = originalFindOneWallet;
                Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
                mongoose.startSession = originalStartSession;
            }
        });
    });
});
