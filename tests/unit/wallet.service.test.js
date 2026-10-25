const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const walletService = require("../../src/services/wallet.service");
const { User } = require("../../src/models/user.model");
const { Transaction } = require("../../src/models/transaction.model");
const { Wallet } = require("../../src/models/wallet.model");
const AppError = require("../../src/utils/AppError");
const mongoose = require("mongoose");

describe("Wallet Service - Unit Tests (Concurrency & Idempotency)", () => {
    it("should return existing transaction on E11000 duplicate key race condition (K-001)", async () => {
        const senderId = new mongoose.Types.ObjectId();
        const receiverId = new mongoose.Types.ObjectId();
        const idempotencyKey = "concurrent-key-123";

        const originalFindById = User.findById;
        const originalFindOneWallet = Wallet.findOne;
        const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
        const originalStartSession = mongoose.startSession;
        const originalCreateTransaction = Transaction.create;
        const originalFindOneTransaction = Transaction.findOne;

        User.findById = async () => ({
            _id: receiverId,
            role: "customer",
            isActive: true,
        });

        Wallet.findOne = async () => ({
            userId: receiverId,
            balance: 1000,
            toJSON: () => ({ userId: receiverId, balance: 1000 }),
        });

        const committedMockTx = {
            transactionId: "tx-already-committed-456",
            senderId,
            receiverId,
            amount: 500,
            idempotencyKey,
            toJSON: () => ({
                transactionId: "tx-already-committed-456",
                senderId,
                receiverId,
                amount: 500,
                idempotencyKey,
            }),
        };

        const mockSession = {
            startTransaction: () => {},
            commitTransaction: async () => {},
            abortTransaction: async () => {},
            endSession: () => {},
            inTransaction: () => true,
        };
        mongoose.startSession = async () => mockSession;

        Wallet.findOneAndUpdate = async () => ({
            balance: 500,
        });

        // Simulate concurrent insert collision throwing E11000
        Transaction.create = async () => {
            const err = new Error("E11000 duplicate key error");
            err.code = 11000;
            throw err;
        };

        Transaction.findOne = async () => committedMockTx;

        try {
            const result = await walletService.transferFunds({
                senderId,
                receiverId,
                amount: 500,
                idempotencyKey,
            });

            assert.equal(result.isDuplicate, true);
            assert.equal(result.transaction.transactionId, "tx-already-committed-456");
        } finally {
            User.findById = originalFindById;
            Wallet.findOne = originalFindOneWallet;
            Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
            mongoose.startSession = originalStartSession;
            Transaction.create = originalCreateTransaction;
            Transaction.findOne = originalFindOneTransaction;
        }
    });

    it("should fall back gracefully to conditional transfer if deployment lacks replica set (K-002)", async () => {
        const senderId = new mongoose.Types.ObjectId();
        const receiverId = new mongoose.Types.ObjectId();

        const originalFindById = User.findById;
        const originalFindOneWallet = Wallet.findOne;
        const originalFindOneAndUpdateWallet = Wallet.findOneAndUpdate;
        const originalStartSession = mongoose.startSession;
        const originalCreateTransaction = Transaction.create;

        User.findById = async () => ({
            _id: receiverId,
            role: "customer",
            isActive: true,
        });

        Wallet.findOne = async () => ({
            userId: receiverId,
            balance: 1000,
            toJSON: () => ({ userId: receiverId, balance: 1000 }),
        });

        const mockSession = {
            startTransaction: () => {},
            commitTransaction: async () => {},
            abortTransaction: async () => {},
            endSession: () => {},
            inTransaction: () => true,
        };
        mongoose.startSession = async () => mockSession;

        let sessionAttempted = true;
        Wallet.findOneAndUpdate = async (filter, update, options) => {
            if (options && options.session && sessionAttempted) {
                // Simulate standalone MongoDB deployment error
                const err = new Error("This MongoDB deployment does not support retryable writes or transactions");
                err.code = 20;
                sessionAttempted = false;
                throw err;
            }
            return { balance: 9500 };
        };

        Transaction.create = async () => ({
            transactionId: "tx-fallback-789",
            toJSON: () => ({ transactionId: "tx-fallback-789", amount: 500 }),
        });

        try {
            const result = await walletService.transferFunds({
                senderId,
                receiverId,
                amount: 500,
            });

            assert.equal(result.transaction.transactionId, "tx-fallback-789");
            assert.equal(result.newBalance, 9500);
        } finally {
            User.findById = originalFindById;
            Wallet.findOne = originalFindOneWallet;
            Wallet.findOneAndUpdate = originalFindOneAndUpdateWallet;
            mongoose.startSession = originalStartSession;
            Transaction.create = originalCreateTransaction;
        }
    });

    it("should reject transfer when recipient is not a customer", async () => {
        const senderId = new mongoose.Types.ObjectId();
        const receiverId = new mongoose.Types.ObjectId();

        const originalFindById = User.findById;
        User.findById = async () => ({
            _id: receiverId,
            role: "support", // Non-customer
            isActive: true,
        });

        try {
            await assert.rejects(
                async () => {
                    await walletService.transferFunds({
                        senderId,
                        receiverId,
                        amount: 500,
                    });
                },
                (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("customer accounts")
            );
        } finally {
            User.findById = originalFindById;
        }
    });
});
