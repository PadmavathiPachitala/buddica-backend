const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../../src/app");
const { User } = require("../../src/models/user.model");
const { Transaction } = require("../../src/models/transaction.model");
const { AuditLog } = require("../../src/models/auditLog.model");
const { verifyTestDatabaseConfig } = require("../helpers/testDbGuard");
const env = require("../../src/config/env");

const testUri = verifyTestDatabaseConfig(process.env.MONGO_URI, process.env.MONGO_URI_TEST);

describe("Admin & Support API - Integration Tests", () => {
    let server;
    let baseUrl;
    const testTimestamp = Date.now();
    const adminEmail = `admin_${testTimestamp}@example.com`;
    const supportEmail = `support_${testTimestamp}@example.com`;
    const customerEmail = `customer_${testTimestamp}@example.com`;
    const pureCustomerEmail = `pure_cust_${testTimestamp}@example.com`;

    let adminUser;
    let supportUser;
    let customerUser;
    let pureCustomerUser;
    let sampleTransaction;

    let adminToken;
    let supportToken;
    let customerToken;
    let pureCustomerToken;

    before(async () => {
        await mongoose.connect(testUri);

        adminUser = await User.create({
            name: "Admin User",
            email: adminEmail,
            passwordHash: "dummyHash123",
            role: "admin",
            isActive: true,
        });

        supportUser = await User.create({
            name: "Support User",
            email: supportEmail,
            passwordHash: "dummyHash123",
            role: "support",
            isActive: true,
        });

        customerUser = await User.create({
            name: "Customer User",
            email: customerEmail,
            passwordHash: "dummyHash123",
            role: "customer",
            isActive: true,
        });

        pureCustomerUser = await User.create({
            name: "Pure Customer",
            email: pureCustomerEmail,
            passwordHash: "dummyHash123",
            role: "customer",
            isActive: true,
        });

        sampleTransaction = await Transaction.create({
            senderId: customerUser._id,
            receiverId: adminUser._id,
            amount: 2500,
            type: "transfer",
            status: "pending",
            description: "Test transaction for admin audit",
        });

        adminToken = jwt.sign({ sub: adminUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        supportToken = jwt.sign({ sub: supportUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        customerToken = jwt.sign({ sub: customerUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        pureCustomerToken = jwt.sign({ sub: pureCustomerUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        server = http.createServer(app);
        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}/api/admin`;
                resolve();
            });
        });
    });

    after(async () => {
        try {
            if (mongoose.connection.readyState === 1) {
                await User.deleteMany({
                    email: { $in: [adminEmail, supportEmail, customerEmail, pureCustomerEmail] },
                });
                await Transaction.deleteMany({
                    _id: sampleTransaction._id,
                });
                await AuditLog.deleteMany({
                    administrator: adminUser._id,
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

    describe("GET /api/admin/users", () => {
        it("should allow admin to list users and exclude passwordHash", async () => {
            const res = await fetch(`${baseUrl}/users`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.ok(Array.isArray(data.data.users));
            assert.ok(data.data.users.length >= 3);
            assert.equal(data.data.users[0].passwordHash, undefined);
            assert.ok(data.data.pagination);
        });

        it("should reject support staff from listing users with 403", async () => {
            const res = await fetch(`${baseUrl}/users`, {
                headers: { Authorization: `Bearer ${supportToken}` },
            });

            assert.equal(res.status, 403);
            const data = await res.json();
            assert.equal(data.status, "fail");
        });

        it("should reject customer from listing users with 403", async () => {
            const res = await fetch(`${baseUrl}/users`, {
                headers: { Authorization: `Bearer ${customerToken}` },
            });

            assert.equal(res.status, 403);
        });

        it("should safely handle search text with special regex characters without throwing", async () => {
            const res = await fetch(`${baseUrl}/users?search=${encodeURIComponent("[admin]+?.*$()^")}`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.ok(Array.isArray(data.data.users));
        });
    });

    describe("PATCH /api/admin/users/:userId/role", () => {
        it("should prevent admin self-demotion with 400", async () => {
            const res = await fetch(`${baseUrl}/users/${adminUser._id}/role`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    role: "customer",
                    reason: "Accidental self demotion attempt",
                }),
            });

            assert.equal(res.status, 400);
            const data = await res.json();
            assert.match(data.message, /cannot demote their own account/);
        });

        it("should allow admin to change customer role to support and record AuditLog", async () => {
            const res = await fetch(`${baseUrl}/users/${customerUser._id}/role`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    role: "support",
                    reason: "Promoting verified customer to support agent",
                }),
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.equal(data.data.user.role, "support");

            // Verify role persisted in MongoDB
            const updated = await User.findById(customerUser._id);
            assert.equal(updated.role, "support");

            // Verify AuditLog record was created
            const audit = await AuditLog.findOne({
                administrator: adminUser._id,
                action: "ROLE_CHANGE",
                targetResource: `User:${customerUser._id}`,
            });
            assert.ok(audit);
            assert.equal(audit.details.previousRole, "customer");
            assert.equal(audit.details.newRole, "support");
            assert.equal(audit.reason, "Promoting verified customer to support agent");
        });

        it("should reject support staff from changing roles with 403", async () => {
            const res = await fetch(`${baseUrl}/users/${customerUser._id}/role`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supportToken}`,
                },
                body: JSON.stringify({
                    role: "admin",
                    reason: "Unauthorized role change",
                }),
            });

            assert.equal(res.status, 403);
        });
    });

    describe("GET /api/admin/transactions", () => {
        it("should permit support staff to view transactions across all users", async () => {
            const res = await fetch(`${baseUrl}/transactions`, {
                headers: { Authorization: `Bearer ${supportToken}` },
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.ok(Array.isArray(data.data.transactions));
            assert.ok(data.data.pagination);
        });

        it("should permit admin to view transactions across all users", async () => {
            const res = await fetch(`${baseUrl}/transactions`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.ok(Array.isArray(data.data.transactions));
        });

        it("should filter transactions by userId (matching as either sender or receiver)", async () => {
            const res = await fetch(`${baseUrl}/transactions?userId=${customerUser._id}`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.ok(Array.isArray(data.data.transactions));
            for (const tx of data.data.transactions) {
                const sId = (tx.senderId && tx.senderId._id) ? tx.senderId._id.toString() : tx.senderId.toString();
                const rId = (tx.receiverId && tx.receiverId._id) ? tx.receiverId._id.toString() : tx.receiverId.toString();
                assert.ok(sId === customerUser._id.toString() || rId === customerUser._id.toString());
            }
        });

        it("should reject customer from viewing administrative transactions list with 403", async () => {
            const res = await fetch(`${baseUrl}/transactions`, {
                headers: { Authorization: `Bearer ${pureCustomerToken}` },
            });

            assert.equal(res.status, 403);
        });
    });

    describe("PATCH /api/admin/transactions/:transactionId/status", () => {
        it("should allow admin to update transaction status and record AuditLog", async () => {
            const res = await fetch(`${baseUrl}/transactions/${sampleTransaction.transactionId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminToken}`,
                },
                body: JSON.stringify({
                    status: "failed",
                    reason: "Customer requested cancellation before processing",
                }),
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.equal(data.data.transaction.status, "failed");

            // Verify status persisted in DB
            const updatedTx = await Transaction.findById(sampleTransaction._id);
            assert.equal(updatedTx.status, "failed");

            // Verify AuditLog record was created
            const audit = await AuditLog.findOne({
                administrator: adminUser._id,
                action: "TRANSACTION_STATUS_UPDATE",
                targetResource: `Transaction:${sampleTransaction.transactionId}`,
            });
            assert.ok(audit);
            assert.equal(audit.details.previousStatus, "pending");
            assert.equal(audit.details.newStatus, "failed");
        });

        it("should reject support staff from modifying transaction status with 403", async () => {
            const res = await fetch(`${baseUrl}/transactions/${sampleTransaction.transactionId}/status`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${supportToken}`,
                },
                body: JSON.stringify({
                    status: "success",
                    reason: "Attempt by support staff",
                }),
            });

            assert.equal(res.status, 403);
        });
    });

    describe("GET /api/admin/audit-logs", () => {
        it("should allow admin to view immutable audit logs", async () => {
            const res = await fetch(`${baseUrl}/audit-logs`, {
                headers: { Authorization: `Bearer ${adminToken}` },
            });

            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.status, "success");
            assert.ok(Array.isArray(data.data.auditLogs));
            assert.ok(data.data.auditLogs.length >= 2);
            assert.ok(data.data.pagination);
        });

        it("should reject support staff from viewing audit logs with 403", async () => {
            const res = await fetch(`${baseUrl}/audit-logs`, {
                headers: { Authorization: `Bearer ${supportToken}` },
            });

            assert.equal(res.status, 403);
        });
    });
});
