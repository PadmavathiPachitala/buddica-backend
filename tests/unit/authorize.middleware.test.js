const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const authorizeRoles = require("../../src/middleware/authorize.middleware");

describe("Authorize Middleware - Unit Tests", () => {
    it("should return 401 when req.user is missing (not authenticated)", () => {
        const middleware = authorizeRoles("admin");
        const req = {};
        const res = {};
        let nextErr;

        middleware(req, res, (err) => {
            nextErr = err;
        });

        assert.ok(nextErr);
        assert.equal(nextErr.statusCode, 401);
        assert.match(nextErr.message, /Authentication required/);
    });

    it("should return 403 when no allowedRoles are configured (fail-closed)", () => {
        const middleware = authorizeRoles();
        const req = { user: { role: "admin" } };
        const res = {};
        let nextErr;

        middleware(req, res, (err) => {
            nextErr = err;
        });

        assert.ok(nextErr);
        assert.equal(nextErr.statusCode, 403);
        assert.match(nextErr.message, /No access permissions/);
    });

    it("should return 403 when user role is not allowed", () => {
        const middleware = authorizeRoles("admin");
        const req = { user: { role: "customer" } };
        const res = {};
        let nextErr;

        middleware(req, res, (err) => {
            nextErr = err;
        });

        assert.ok(nextErr);
        assert.equal(nextErr.statusCode, 403);
        assert.match(nextErr.message, /Access denied/);
    });

    it("should return 403 when support user attempts admin-only operation", () => {
        const middleware = authorizeRoles("admin");
        const req = { user: { role: "support" } };
        const res = {};
        let nextErr;

        middleware(req, res, (err) => {
            nextErr = err;
        });

        assert.ok(nextErr);
        assert.equal(nextErr.statusCode, 403);
        assert.match(nextErr.message, /Access denied/);
    });

    it("should return 403 when user role is unrecognized or invalid", () => {
        const middleware = authorizeRoles("admin", "support");
        const req = { user: { role: "super_hacker" } };
        const res = {};
        let nextErr;

        middleware(req, res, (err) => {
            nextErr = err;
        });

        assert.ok(nextErr);
        assert.equal(nextErr.statusCode, 403);
        assert.match(nextErr.message, /Access denied/);
    });

    it("should call next() without error when user has permitted role", () => {
        const middleware = authorizeRoles("admin");
        const req = { user: { role: "admin" } };
        const res = {};
        let nextCalled = false;
        let nextErr;

        middleware(req, res, (err) => {
            nextCalled = true;
            nextErr = err;
        });

        assert.equal(nextCalled, true);
        assert.equal(nextErr, undefined);
    });

    it("should call next() without error when user has one of multiple allowed roles", () => {
        const middleware = authorizeRoles("support", "admin");
        const req = { user: { role: "support" } };
        const res = {};
        let nextCalled = false;
        let nextErr;

        middleware(req, res, (err) => {
            nextCalled = true;
            nextErr = err;
        });

        assert.equal(nextCalled, true);
        assert.equal(nextErr, undefined);
    });
});
