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

describe("Auth API - Integration Tests", () => {
    let server;
    let baseUrl;
    const testTimestamp = Date.now();
    const testEmail1 = `user1_${testTimestamp}@example.com`;
    const testEmail2 = `user2_${testTimestamp}@example.com`;
    const deactivatedEmail = `deactivated_${testTimestamp}@example.com`;
    const disabledJwtEmail = `disabled_jwt_${testTimestamp}@example.com`;
    let user1Token;
    let apiBaseUrl;

    before(async () => {
        // Connect exclusively to the isolated test database
        await mongoose.connect(testUri);

        // Start server on an ephemeral port
        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                apiBaseUrl = `http://127.0.0.1:${port}/api`;
                baseUrl = `${apiBaseUrl}/auth`;
                resolve();
            });
        });
    });

    after(async () => {
        // Safely clean up only the specific accounts and wallets created in this run
        try {
            if (mongoose.connection.readyState === 1) {
                const testUsers = await User.find({
                    email: { $in: [testEmail1, testEmail2, deactivatedEmail, disabledJwtEmail] },
                }).select("_id");
                const userIds = testUsers.map((u) => u._id);

                if (userIds.length > 0) {
                    await Wallet.deleteMany({ userId: { $in: userIds } });
                    await User.deleteMany({ _id: { $in: userIds } });
                }
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

    it("POST /register - should register a new user with customer role and no passwordHash", async () => {
        const res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Alice Smith",
                email: testEmail1,
                password: "SecurePassword123",
            }),
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.equal(data.data.user.email, testEmail1);
        assert.equal(data.data.user.role, "customer");
        assert.equal(data.data.user.isActive, true);
        assert.equal(data.data.user.passwordHash, undefined, "passwordHash must never be returned");
    });

    it("POST /register - should reject duplicate email with 409", async () => {
        const res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Alice Duplicate",
                email: testEmail1,
                password: "AnotherPassword123",
            }),
        });

        assert.equal(res.status, 409);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /already exists/i);
    });

    it("POST /register - should reject attempts to specify privileged role", async () => {
        const res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Admin Attempter",
                email: `admin_attempt_${testTimestamp}@example.com`,
                password: "SecurePassword123",
                role: "admin",
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /Setting 'role' is not allowed/i);
    });

    it("POST /register - should reject invalid password (< 8 chars, no number)", async () => {
        const res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Weak Pass User",
                email: testEmail2,
                password: "short",
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.status, "fail");
    });

    it("POST /register - should reject password exceeding 72 bytes limit", async () => {
        const oversizedPassword = "a".repeat(71) + "A1"; // 73 bytes
        const res = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Oversized User",
                email: `oversized_${testTimestamp}@example.com`,
                password: oversizedPassword,
            }),
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /cannot exceed 72 bytes/i);
    });

    it("POST /login - should log in user and return JWT", async () => {
        const res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testEmail1,
                password: "SecurePassword123",
            }),
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.ok(data.data.token, "JWT token must be present");
        assert.equal(data.data.user.email, testEmail1);
        assert.equal(data.data.user.passwordHash, undefined);

        user1Token = data.data.token;
    });

    it("POST /login - should return 401 with generic message on wrong password", async () => {
        const res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testEmail1,
                password: "IncorrectPassword999",
            }),
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.equal(data.message, "Invalid email or password");
    });

    it("POST /login - should return 401 with generic message on oversized password (> 72 bytes)", async () => {
        const res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: testEmail1,
                password: "a".repeat(73),
            }),
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.equal(data.message, "Invalid email or password");
    });

    it("POST /login - should return 401 with generic message on nonexistent email", async () => {
        const res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: "nonexistent_email_12345@example.com",
                password: "AnyPassword123",
            }),
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.equal(data.message, "Invalid email or password");
    });

    it("POST /login - should return 403 when account is deactivated", async () => {
        // Register and immediately deactivate account
        const regRes = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Deactivated User",
                email: deactivatedEmail,
                password: "ValidPassword123",
            }),
        });
        assert.equal(regRes.status, 201);

        await User.updateOne({ email: deactivatedEmail }, { isActive: false });

        const loginRes = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: deactivatedEmail,
                password: "ValidPassword123",
            }),
        });

        assert.equal(loginRes.status, 403);
        const data = await loginRes.json();
        assert.match(data.message, /inactive/i);
    });

    it("GET /me - should return authenticated user profile with valid Bearer token", async () => {
        const res = await fetch(`${baseUrl}/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${user1Token}`,
            },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.equal(data.data.user.email, testEmail1);
        assert.equal(data.data.user.role, "customer");
        assert.equal(data.data.user.passwordHash, undefined);
    });

    it("Disabled user using existing JWT - should reject access to profile, wallet, and transaction endpoints", async () => {
        // 1. Disable the authenticated user in MongoDB while they still hold the unexpired JWT (user1Token)
        await User.updateOne({ email: testEmail1 }, { isActive: false });

        // 2. Profile access with existing token must be rejected with 403
        const profileRes = await fetch(`${baseUrl}/me`, {
            headers: { Authorization: `Bearer ${user1Token}` },
        });
        assert.equal(profileRes.status, 403);
        const profileData = await profileRes.json();
        assert.equal(profileData.status, "fail");
        assert.match(profileData.message, /inactive/i);

        // 3. Wallet balance access with existing token must be rejected with 403
        const walletRes = await fetch(`${apiBaseUrl}/wallet`, {
            headers: { Authorization: `Bearer ${user1Token}` },
        });
        assert.equal(walletRes.status, 403);
        const walletData = await walletRes.json();
        assert.equal(walletData.status, "fail");
        assert.match(walletData.message, /inactive/i);

        // 4. Wallet transfer with existing token must be rejected with 403 and never perform transfer
        const transferRes = await fetch(`${apiBaseUrl}/wallet/transfer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${user1Token}`,
                "Idempotency-Key": `idem-disabled-${Date.now()}`,
            },
            body: JSON.stringify({
                receiverId: new mongoose.Types.ObjectId().toString(),
                amount: 500,
            }),
        });
        assert.equal(transferRes.status, 403);
        const transferData = await transferRes.json();
        assert.equal(transferData.status, "fail");
        assert.match(transferData.message, /inactive/i);

        // 5. Transaction history access with existing token must be rejected with 403
        const txRes = await fetch(`${apiBaseUrl}/wallet/transactions`, {
            headers: { Authorization: `Bearer ${user1Token}` },
        });
        assert.equal(txRes.status, 403);
        const txData = await txRes.json();
        assert.equal(txData.status, "fail");
        assert.match(txData.message, /inactive/i);
    });

    it("GET /me - should reject with 401 when Authorization header is missing", async () => {
        const res = await fetch(`${baseUrl}/me`, {
            method: "GET",
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /Bearer token/i);
    });

    it("GET /me - should reject with 401 when token is malformed", async () => {
        const res = await fetch(`${baseUrl}/me`, {
            method: "GET",
            headers: {
                Authorization: "Bearer invalid.jwt.token",
            },
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
    });

    it("GET /me - should reject with 401 when token is expired", async () => {
        const expiredToken = jwt.sign(
            { sub: new mongoose.Types.ObjectId().toString() },
            env.JWT_SECRET,
            { algorithm: env.JWT_ALGORITHM, expiresIn: "0s" }
        );

        const res = await fetch(`${baseUrl}/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${expiredToken}`,
            },
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /expired/i);
    });

    it("GET /me - should reject with 401 (not 400 CastError) when token sub is not a valid ObjectId", async () => {
        const invalidSubToken = jwt.sign(
            { sub: "not-a-valid-mongodb-object-id" },
            env.JWT_SECRET,
            { algorithm: env.JWT_ALGORITHM, expiresIn: "1h" }
        );

        const res = await fetch(`${baseUrl}/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${invalidSubToken}`,
            },
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.equal(data.message, "Invalid authentication token.");
    });

    it("GET /me - should reject with 401 when user in token has been deleted from MongoDB", async () => {
        const nonExistentUserId = new mongoose.Types.ObjectId().toString();
        const orphanToken = jwt.sign(
            { sub: nonExistentUserId },
            env.JWT_SECRET,
            { algorithm: env.JWT_ALGORITHM, expiresIn: "1h" }
        );

        const res = await fetch(`${baseUrl}/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${orphanToken}`,
            },
        });

        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /no longer exists/i);
    });

    it("Error Handling - should return 400 fail on malformed JSON payload", async () => {
        const res = await fetch(`${baseUrl}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{ broken json string: ",
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.equal(data.message, "Malformed JSON in request body");
    });
});
