const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const { User } = require("../../src/models/user.model");
const { Wallet } = require("../../src/models/wallet.model");
const { Transaction } = require("../../src/models/transaction.model");
const { verifyTestDatabaseConfig } = require("../helpers/testDbGuard");
const env = require("../../src/config/env");

const testUri = verifyTestDatabaseConfig(process.env.MONGO_URI, process.env.MONGO_URI_TEST);

describe("Transfer & Transactions API - Integration Tests", () => {
    let server;
    let baseUrl;
    const testTimestamp = Date.now();
    const senderEmail = `sender_${testTimestamp}@example.com`;
    const receiverEmail = `receiver_${testTimestamp}@example.com`;
    const deactivatedEmail = `deactivated_${testTimestamp}@example.com`;
    const supportEmail = `supp_staff_${testTimestamp}@example.com`;

    let senderUser;
    let receiverUser;
    let deactivatedUser;
    let supportUser;

    let senderToken;
    let receiverToken;

    before(async () => {
        await mongoose.connect(testUri);

        // 1. Create sender (with 50000 paise = 500 INR balance)
        senderUser = await User.create({
            name: "Sender Customer",
            email: senderEmail,
            passwordHash: "dummyHash123",
            role: "customer",
            isActive: true,
        });

        await Wallet.create({
            userId: senderUser._id,
            balance: 50000,
            currency: "INR",
        });

        // 2. Create receiver (with 0 paise balance)
        receiverUser = await User.create({
            name: "Receiver Customer",
            email: receiverEmail,
            passwordHash: "dummyHash123",
            role: "customer",
            isActive: true,
        });

        await Wallet.create({
            userId: receiverUser._id,
            balance: 0,
            currency: "INR",
        });

        // 3. Create deactivated user
        deactivatedUser = await User.create({
            name: "Deactivated Customer",
            email: deactivatedEmail,
            passwordHash: "dummyHash123",
            role: "customer",
            isActive: false,
        });

        // 4. Create support user
        supportUser = await User.create({
            name: "Support Staff",
            email: supportEmail,
            passwordHash: "dummyHash123",
            role: "support",
            isActive: true,
        });

        senderToken = jwt.sign({ sub: senderUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        receiverToken = jwt.sign({ sub: receiverUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}/api/wallet`;
                resolve();
            });
        });
    });

    after(async () => {
        try {
            if (mongoose.connection.readyState === 1) {
                await User.deleteMany({
                    email: { $in: [senderEmail, receiverEmail, deactivatedEmail, supportEmail] },
                });
                await Wallet.deleteMany({
                    userId: { $in: [senderUser._id, receiverUser._id, deactivatedUser._id, supportUser._id] },
                });
                await Transaction.deleteMany({
                    $or: [{ senderId: senderUser._id }, { receiverId: senderUser._id }],
                });
            }
        } finally {
            if (server) {
                await new Promise((resolve) => server.close(resolve));
            }
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
            }
        }
    });

    it("POST /transfer - should reject self-transfers with 400", async () => {
        const res = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
            },
            body: JSON.stringify({
                receiverId: senderUser._id.toString(),
                amount: 1000,
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /Cannot transfer funds to yourself/);
    });

    it("POST /transfer - should reject non-positive amount with 400", async () => {
        const res = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
            },
            body: JSON.stringify({
                receiverId: receiverUser._id.toString(),
                amount: -500,
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.message, /positive integer/);
    });

    it("POST /transfer - should reject floating point paise amounts with 400", async () => {
        const res = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
            },
            body: JSON.stringify({
                receiverId: receiverUser._id.toString(),
                amount: 100.5,
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.message, /positive integer/);
    });

    it("POST /transfer - should reject transfers to deactivated accounts with 400", async () => {
        const res = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
            },
            body: JSON.stringify({
                receiverId: deactivatedUser._id.toString(),
                amount: 1000,
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.message, /deactivated/);
    });

    it("POST /transfer - should reject transfers to non-customer accounts with 400", async () => {
        const res = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
            },
            body: JSON.stringify({
                receiverId: supportUser._id.toString(),
                amount: 1000,
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.message, /customer accounts/);
    });

    it("POST /transfer - should reject transfers exceeding balance with 400", async () => {
        const res = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
            },
            body: JSON.stringify({
                receiverId: receiverUser._id.toString(),
                amount: 999999, // Exceeds 50000 paise balance
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.match(data.message, /Insufficient wallet balance/);
    });

    it("POST /transfer - should successfully transfer funds and update both balances", async () => {
        const idempotencyKey = `idem-${Date.now()}-1`;
        const res = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
                receiverId: receiverUser._id.toString(),
                amount: 15000, // 150 INR
                description: "Payment for dinner",
            }),
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.equal(data.data.newBalance, 35000); // 50000 - 15000
        assert.equal(data.data.transaction.amount, 15000);
        assert.equal(data.data.transaction.status, "success");

        // Verify receiver wallet in database
        const receiverWallet = await Wallet.findOne({ userId: receiverUser._id });
        assert.equal(receiverWallet.balance, 15000);
    });

    it("POST /transfer - should be idempotent when same Idempotency-Key is reused", async () => {
        const idempotencyKey = `idem-repeat-test`;

        // First transfer
        const firstRes = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
                receiverId: receiverUser._id.toString(),
                amount: 5000,
            }),
        });

        assert.equal(firstRes.status, 201);
        const firstData = await firstRes.json();
        const txId = firstData.data.transaction._id;

        // Second transfer with same idempotency key
        const secondRes = await fetch(`${baseUrl}/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${senderToken}`,
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify({
                receiverId: receiverUser._id.toString(),
                amount: 5000,
            }),
        });

        assert.equal(secondRes.status, 200);
        const secondData = await secondRes.json();
        assert.equal(secondData.data.isDuplicate, true);
        assert.equal(secondData.data.transaction._id, txId);

        // Sender balance should only have decreased once (35000 - 5000 = 30000)
        const senderWallet = await Wallet.findOne({ userId: senderUser._id });
        assert.equal(senderWallet.balance, 30000);
    });

    it("GET /transactions - should return sender transaction history with direction 'debit'", async () => {
        const res = await fetch(`${baseUrl}/transactions`, {
            headers: {
                Authorization: `Bearer ${senderToken}`,
            },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.ok(Array.isArray(data.data.transactions));
        assert.ok(data.data.transactions.length >= 2);
        assert.equal(data.data.transactions[0].direction, "debit");
        assert.ok(data.data.pagination);
        assert.equal(data.data.pagination.page, 1);
    });

    it("GET /transactions - should return receiver transaction history with direction 'credit'", async () => {
        const res = await fetch(`${baseUrl}/transactions`, {
            headers: {
                Authorization: `Bearer ${receiverToken}`,
            },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.ok(Array.isArray(data.data.transactions));
        assert.ok(data.data.transactions.length >= 2);
        assert.equal(data.data.transactions[0].direction, "credit");
    });

    it("POST /transfer - concurrent transfers racing for balance must never result in negative balance", async () => {
        // Current sender balance after previous tests is 30000 paise (300 INR).
        // Fire two simultaneous transfers of 20000 paise each (total 40000 > 30000).
        const [res1, res2] = await Promise.all([
            fetch(`${baseUrl}/transfer`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${senderToken}`,
                },
                body: JSON.stringify({
                    receiverId: receiverUser._id.toString(),
                    amount: 20000,
                    description: "Concurrent transfer attempt 1",
                }),
            }),
            fetch(`${baseUrl}/transfer`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${senderToken}`,
                },
                body: JSON.stringify({
                    receiverId: receiverUser._id.toString(),
                    amount: 20000,
                    description: "Concurrent transfer attempt 2",
                }),
            }),
        ]);

        const statuses = [res1.status, res2.status].sort();
        // Exactly one must succeed (201) and one must be rejected (400)
        assert.deepEqual(statuses, [201, 400]);

        // Verify sender balance is exactly 10000 (30000 - 20000) and NEVER negative
        const senderWallet = await Wallet.findOne({ userId: senderUser._id });
        assert.equal(senderWallet.balance, 10000);
        assert.ok(senderWallet.balance >= 0, "Balance must never drop below 0 paise");
    });

    it("POST /transfer - concurrent requests with same Idempotency-Key must execute only one debit", async () => {
        const concurrentKey = `concurrent-idem-${Date.now()}`;

        // Fire two simultaneous requests with the exact same Idempotency-Key
        const [res1, res2] = await Promise.all([
            fetch(`${baseUrl}/transfer`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${senderToken}`,
                    "Idempotency-Key": concurrentKey,
                },
                body: JSON.stringify({
                    receiverId: receiverUser._id.toString(),
                    amount: 5000,
                    description: "Concurrent idempotency test 1",
                }),
            }),
            fetch(`${baseUrl}/transfer`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${senderToken}`,
                    "Idempotency-Key": concurrentKey,
                },
                body: JSON.stringify({
                    receiverId: receiverUser._id.toString(),
                    amount: 5000,
                    description: "Concurrent idempotency test 2",
                }),
            }),
        ]);

        // Both requests must return successful HTTP status (200 or 201)
        assert.ok([200, 201].includes(res1.status));
        assert.ok([200, 201].includes(res2.status));

        const data1 = await res1.json();
        const data2 = await res2.json();

        // One of them is the primary creation (201) and one is marked duplicate (200)
        const isOneDuplicate = data1.data.isDuplicate === true || data2.data.isDuplicate === true;
        assert.equal(isOneDuplicate, true);

        // Both must return the identical transaction ID
        const id1 = data1.data.transaction._id || data1.data.transaction.id;
        const id2 = data2.data.transaction._id || data2.data.transaction.id;
        assert.equal(id1, id2);

        // Sender balance should only decrease by 5000 once (10000 - 5000 = 5000)
        const senderWallet = await Wallet.findOne({ userId: senderUser._id });
        assert.equal(senderWallet.balance, 5000);
    });
});
