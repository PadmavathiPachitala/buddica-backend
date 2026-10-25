const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const authenticate = require("../../src/middleware/auth.middleware");
const authorizeRoles = require("../../src/middleware/authorize.middleware");
const errorHandler = require("../../src/middleware/errorHandler");
const { User } = require("../../src/models/user.model");
const { verifyTestDatabaseConfig } = require("../helpers/testDbGuard");
const env = require("../../src/config/env");

const testUri = verifyTestDatabaseConfig(process.env.MONGO_URI, process.env.MONGO_URI_TEST);

describe("RBAC End-to-End API - Integration Tests", () => {
    let server;
    let baseUrl;
    const testTimestamp = Date.now();
    const customerEmail = `customer_${testTimestamp}@example.com`;
    const supportEmail = `support_${testTimestamp}@example.com`;
    const adminEmail = `admin_${testTimestamp}@example.com`;

    let customerUser;
    let supportUser;
    let adminUser;

    let customerToken;
    let supportToken;
    let adminToken;

    let adminHandlerExecuted = false;

    before(async () => {
        await mongoose.connect(testUri);

        // Create test users with distinct roles
        customerUser = await User.create({
            name: "Customer User",
            email: customerEmail,
            passwordHash: "dummyHash123",
            role: "customer",
            isActive: true,
        });

        supportUser = await User.create({
            name: "Support User",
            email: supportEmail,
            passwordHash: "dummyHash123",
            role: "support",
            isActive: true,
        });

        adminUser = await User.create({
            name: "Admin User",
            email: adminEmail,
            passwordHash: "dummyHash123",
            role: "admin",
            isActive: true,
        });

        // Issue tokens
        customerToken = jwt.sign({ sub: customerUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        supportToken = jwt.sign({ sub: supportUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        adminToken = jwt.sign({ sub: adminUser._id.toString() }, env.JWT_SECRET, {
            algorithm: env.JWT_ALGORITHM,
            expiresIn: "1h",
        });

        // Set up test Express application testing RBAC middleware combinations
        const testApp = express();
        testApp.use(express.json());

        // Admin-only route
        testApp.get("/api/admin-only", authenticate, authorizeRoles("admin"), (req, res) => {
            adminHandlerExecuted = true;
            res.status(200).json({ status: "success", message: "Admin access granted" });
        });

        // Cross-user Support and Admin route
        testApp.get("/api/support-ops", authenticate, authorizeRoles("support", "admin"), (req, res) => {
            res.status(200).json({ status: "success", message: "Support access granted" });
        });

        // Customer-facing route (customer and admin)
        testApp.get("/api/customer-ops", authenticate, authorizeRoles("customer", "admin"), (req, res) => {
            res.status(200).json({ status: "success", message: "Customer access granted" });
        });

        testApp.use(errorHandler);

        server = http.createServer(testApp);
        await new Promise((resolve) => {
            server.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}/api`;
                resolve();
            });
        });
    });

    after(async () => {
        try {
            if (mongoose.connection.readyState === 1) {
                await User.deleteMany({
                    email: { $in: [customerEmail, supportEmail, adminEmail] },
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

    it("should reject unauthenticated request with 401", async () => {
        const res = await fetch(`${baseUrl}/admin-only`);
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.equal(data.status, "fail");
    });

    it("should reject customer accessing admin-only endpoint with 403 and NOT execute handler", async () => {
        adminHandlerExecuted = false;

        const res = await fetch(`${baseUrl}/admin-only`, {
            headers: { Authorization: `Bearer ${customerToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /Access denied/);
        assert.equal(adminHandlerExecuted, false, "Protected controller must never execute on 403");
    });

    it("should reject support accessing admin-only endpoint with 403", async () => {
        const res = await fetch(`${baseUrl}/admin-only`, {
            headers: { Authorization: `Bearer ${supportToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.status, "fail");
        assert.match(data.message, /Access denied/);
    });

    it("should permit admin accessing admin-only endpoint with 200", async () => {
        adminHandlerExecuted = false;

        const res = await fetch(`${baseUrl}/admin-only`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.status, "success");
        assert.equal(adminHandlerExecuted, true);
    });

    it("should permit support and admin to access cross-user support operations", async () => {
        // Support access
        const resSupport = await fetch(`${baseUrl}/support-ops`, {
            headers: { Authorization: `Bearer ${supportToken}` },
        });
        assert.equal(resSupport.status, 200);

        // Admin access
        const resAdmin = await fetch(`${baseUrl}/support-ops`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        assert.equal(resAdmin.status, 200);

        // Customer denied (403)
        const resCustomer = await fetch(`${baseUrl}/support-ops`, {
            headers: { Authorization: `Bearer ${customerToken}` },
        });
        assert.equal(resCustomer.status, 403);
    });

    it("should permit customer to access customer-facing operations and reject support", async () => {
        // Customer access
        const resCustomer = await fetch(`${baseUrl}/customer-ops`, {
            headers: { Authorization: `Bearer ${customerToken}` },
        });
        assert.equal(resCustomer.status, 200);

        // Support denied (403)
        const resSupport = await fetch(`${baseUrl}/customer-ops`, {
            headers: { Authorization: `Bearer ${supportToken}` },
        });
        assert.equal(resSupport.status, 403);
    });

    it("should immediately grant admin access when role is updated in MongoDB without token re-issuance", async () => {
        // Initially customer cannot access admin-only
        const resInitial = await fetch(`${baseUrl}/admin-only`, {
            headers: { Authorization: `Bearer ${customerToken}` },
        });
        assert.equal(resInitial.status, 403);

        // Elevate user role in MongoDB
        await User.updateOne({ _id: customerUser._id }, { role: "admin" });

        // Using the EXACT SAME customerToken issued earlier
        const resAfterPromotion = await fetch(`${baseUrl}/admin-only`, {
            headers: { Authorization: `Bearer ${customerToken}` },
        });

        assert.equal(resAfterPromotion.status, 200);
        const data = await resAfterPromotion.json();
        assert.equal(data.status, "success");

        // Revert role back to customer
        await User.updateOne({ _id: customerUser._id }, { role: "customer" });
    });
});
