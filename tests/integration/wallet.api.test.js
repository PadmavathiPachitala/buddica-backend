const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const { User } = require("../../src/models/user.model");
const { Wallet } = require("../../src/models/wallet.model");
const { verifyTestDatabaseConfig } = require("../helpers/testDbGuard");
const env = require("../../src/config/env");

const testUri = verifyTestDatabaseConfig(process.env.MONGO_URI, process.env.MONGO_URI_TEST);

describe("Wallet API - Integration Tests", () => {
    let server;
    let baseUrl;
    const testTimestamp = Date.now();
    const customerEmail = `wallet_cust_${testTimestamp}@example.com`;
    const supportEmail = `wallet_supp_${testTimestamp}@example.com`;

    let customerUser;
    let supportUser;
    let customerToken;
    let supportToken;

    before(async () => {
        await mongoose.connect(testUri);

        customerUser = await User.create({
            name: "Wallet Customer",
            email: customerEmail,
            passwordHash: "dummyHash123",
            role: "customer",
            isActive: true,
        });

        supportUser = await User.create({
            name: "Wallet Support",
            email: supportEmail,
            passwordHash: "dummyHash123",
            role: "support",
            isActive: true,
        });

        customerToken = jwt.sign({ sub: customerUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        supportToken = jwt.sign({ sub: supportUser._id.toString() }, env.JWT_SECRET, {
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
                await User.deleteMany({ email: { $in: [customerEmail, supportEmail] } });
                await Wallet.deleteMany({ userId: { $in: [customerUser._id, supportUser._id] } });
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

    it("GET /api/wallet - should reject unauthenticated request with 401", async () => {
        const res = await fetch(baseUrl);
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
    });

    it("GET /api/wallet - should return 200 with wallet balance for customer", async () => {
        const res = await fetch(baseUrl, {
            headers: { Authorization: `Bearer ${customerToken}` },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.ok(data.data.wallet);
        assert.equal(typeof data.data.wallet.balance, "number");
        assert.equal(data.data.wallet.currency, "INR");
    });

    it("GET /api/wallet - should reject support staff with 403 as per mail permissions", async () => {
        const res = await fetch(baseUrl, {
            headers: { Authorization: `Bearer ${supportToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /Access denied/);
    });
});
