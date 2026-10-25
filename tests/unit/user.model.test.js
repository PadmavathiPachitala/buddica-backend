const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { User } = require("../../src/models/user.model");

describe("User Model - Unit Tests", () => {
    it("should strip passwordHash and __v when serialized to JSON", async () => {
        const dummyHash = await bcrypt.hash("SecurePass123", 10);
        const user = new User({
            name: "Test User",
            email: "test.serialize@example.com",
            passwordHash: dummyHash,
            role: "customer",
            isActive: true,
        });

        const json = user.toJSON();

        assert.equal(json.name, "Test User");
        assert.equal(json.email, "test.serialize@example.com");
        assert.equal(json.role, "customer");
        assert.equal(json.isActive, true);
        assert.equal(json.passwordHash, undefined, "passwordHash must not be present in JSON");
        assert.equal(json.__v, undefined, "__v must not be present in JSON");
    });

    it("should compare passwords correctly using comparePassword()", async () => {
        const password = "ValidPassword123";
        const passwordHash = await bcrypt.hash(password, 10);

        const user = new User({
            name: "Comparison User",
            email: "compare@example.com",
            passwordHash,
        });

        const isMatch = await user.comparePassword(password);
        assert.equal(isMatch, true);

        const isWrongMatch = await user.comparePassword("WrongPassword999");
        assert.equal(isWrongMatch, false);
    });
});
