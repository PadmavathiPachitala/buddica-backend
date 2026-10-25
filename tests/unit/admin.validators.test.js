const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
    validateRoleChangeInput,
    validateTransactionStatusInput,
} = require("../../src/validators/admin.validators");
const AppError = require("../../src/utils/AppError");

describe("Admin Validators - Unit Tests", () => {
    describe("validateRoleChangeInput", () => {
        it("should accept valid role and reason", () => {
            const res = validateRoleChangeInput({
                role: "support",
                reason: "Promoted to support tier 1",
            });
            assert.equal(res.role, "support");
            assert.equal(res.reason, "Promoted to support tier 1");
        });

        it("should reject invalid role", () => {
            assert.throws(
                () => validateRoleChangeInput({ role: "superadmin", reason: "Testing" }),
                (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("Valid role is required")
            );
        });

        it("should reject missing role", () => {
            assert.throws(
                () => validateRoleChangeInput({ reason: "Testing" }),
                (err) => err instanceof AppError && err.statusCode === 400
            );
        });

        it("should reject missing or short reason (< 3 chars)", () => {
            assert.throws(
                () => validateRoleChangeInput({ role: "customer", reason: "ab" }),
                (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("reason")
            );
        });

        it("should reject oversized reason (> 500 chars)", () => {
            const longReason = "a".repeat(501);
            assert.throws(
                () => validateRoleChangeInput({ role: "customer", reason: longReason }),
                (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("exceed 500")
            );
        });
    });

    describe("validateTransactionStatusInput", () => {
        it("should accept valid status and reason", () => {
            const res = validateTransactionStatusInput({
                status: "failed",
                reason: "Marked failed due to compliance investigation",
            });
            assert.equal(res.status, "failed");
            assert.equal(res.reason, "Marked failed due to compliance investigation");
        });

        it("should reject invalid status", () => {
            assert.throws(
                () => validateTransactionStatusInput({ status: "in_progress", reason: "Testing" }),
                (err) => err instanceof AppError && err.statusCode === 400 && err.message.includes("Valid status is required")
            );
        });

        it("should accept reversed and cancelled as valid statuses", () => {
            const resReversed = validateTransactionStatusInput({
                status: "reversed",
                reason: "Dispute resolution reversal",
            });
            assert.equal(resReversed.status, "reversed");

            const resCancelled = validateTransactionStatusInput({
                status: "cancelled",
                reason: "Pre-processing cancellation",
            });
            assert.equal(resCancelled.status, "cancelled");
        });

        it("should reject missing reason", () => {
            assert.throws(
                () => validateTransactionStatusInput({ status: "cancelled", reason: "" }),
                (err) => err instanceof AppError && err.statusCode === 400
            );
        });
    });
});
