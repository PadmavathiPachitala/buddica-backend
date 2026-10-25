const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
    validateRegistrationInput,
    validateLoginInput,
} = require("../../src/validators/auth.validators");

describe("Auth Validators - Unit Tests", () => {
    describe("validateRegistrationInput", () => {
        it("should accept valid registration input and normalize email", () => {
            const input = {
                name: "  Jane Doe  ",
                email: "  Jane.Doe@Example.COM ",
                password: "Password123",
            };

            const result = validateRegistrationInput(input);
            assert.equal(result.name, "Jane Doe");
            assert.equal(result.email, "jane.doe@example.com");
            assert.equal(result.password, "Password123");
        });

        it("should accept password at the exact 72-byte limit", () => {
            // 72 bytes ASCII: 70 'a's plus '1' and 'A'
            const pass72 = "a".repeat(70) + "A1";
            assert.equal(Buffer.byteLength(pass72, "utf8"), 72);

            const input = {
                name: "Boundary User",
                email: "boundary@example.com",
                password: pass72,
            };

            const result = validateRegistrationInput(input);
            assert.equal(result.password, pass72);
        });

        it("should reject password exceeding 72-byte limit", () => {
            const pass73 = "a".repeat(71) + "A1";
            assert.equal(Buffer.byteLength(pass73, "utf8"), 73);

            const input = {
                name: "Oversized User",
                email: "oversized@example.com",
                password: pass73,
            };

            assert.throws(
                () => validateRegistrationInput(input),
                /Password cannot exceed 72 bytes in length/
            );
        });

        it("should reject multibyte Unicode password exceeding 72 bytes despite fewer characters", () => {
            // Euro symbol '€' is 3 bytes in UTF-8. 25 '€' = 75 bytes, even though string.length is 25!
            const multibytePass = "€".repeat(24) + "A1"; // 24*3 + 2 = 74 bytes, length = 26
            assert.ok(multibytePass.length < 72);
            assert.ok(Buffer.byteLength(multibytePass, "utf8") > 72);

            const input = {
                name: "Unicode User",
                email: "unicode@example.com",
                password: multibytePass,
            };

            assert.throws(
                () => validateRegistrationInput(input),
                /Password cannot exceed 72 bytes in length/
            );
        });

        it("should reject when role is supplied in registration", () => {
            const input = {
                name: "Hacker",
                email: "hacker@example.com",
                password: "Password123",
                role: "admin",
            };

            assert.throws(
                () => validateRegistrationInput(input),
                /Setting 'role' is not allowed during registration/
            );
        });

        it("should reject when isActive is supplied in registration", () => {
            const input = {
                name: "User",
                email: "user@example.com",
                password: "Password123",
                isActive: true,
            };

            assert.throws(
                () => validateRegistrationInput(input),
                /Setting 'isActive' is not allowed during registration/
            );
        });

        it("should reject when passwordHash is supplied in registration", () => {
            const input = {
                name: "User",
                email: "user@example.com",
                password: "Password123",
                passwordHash: "fakehash",
            };

            assert.throws(
                () => validateRegistrationInput(input),
                /Setting 'passwordHash' is not allowed during registration/
            );
        });

        it("should reject invalid email format", () => {
            const input = {
                name: "User",
                email: "invalid-email-format",
                password: "Password123",
            };

            assert.throws(
                () => validateRegistrationInput(input),
                /A valid email address is required/
            );
        });

        it("should reject passwords shorter than 8 characters", () => {
            const input = {
                name: "User",
                email: "user@example.com",
                password: "Pass1",
            };

            assert.throws(
                () => validateRegistrationInput(input),
                /Password must be at least 8 characters long/
            );
        });

        it("should reject passwords without numbers or letters", () => {
            const inputNoNum = {
                name: "User",
                email: "user@example.com",
                password: "PasswordOnly",
            };

            assert.throws(
                () => validateRegistrationInput(inputNoNum),
                /Password must contain at least one letter and one number/
            );
        });
    });

    describe("validateLoginInput", () => {
        it("should accept valid login input and normalize email", () => {
            const input = {
                email: "  User@Example.COM ",
                password: "MyPassword123",
            };

            const result = validateLoginInput(input);
            assert.equal(result.email, "user@example.com");
            assert.equal(result.password, "MyPassword123");
        });

        it("should reject missing email", () => {
            assert.throws(
                () => validateLoginInput({ password: "Password123" }),
                /Email is required/
            );
        });

        it("should reject missing password", () => {
            assert.throws(
                () => validateLoginInput({ email: "user@example.com" }),
                /Password is required/
            );
        });

        it("should reject oversized login passwords (> 72 bytes) with generic 401", () => {
            const pass73 = "a".repeat(73);
            assert.throws(
                () => validateLoginInput({ email: "user@example.com", password: pass73 }),
                (err) => {
                    assert.equal(err.statusCode, 401);
                    assert.equal(err.message, "Invalid email or password");
                    return true;
                }
            );
        });
    });
});
