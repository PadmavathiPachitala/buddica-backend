const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { verifyTestDatabaseConfig } = require("../helpers/testDbGuard");

describe("Database Isolation Guard - Unit Tests", () => {
    it("should throw error if MONGO_URI_TEST is undefined or empty", () => {
        assert.throws(
            () => verifyTestDatabaseConfig("mongodb://127.0.0.1:27017/dev_test", undefined),
            /require MONGO_URI_TEST to be explicitly set/
        );

        assert.throws(
            () => verifyTestDatabaseConfig("mongodb://127.0.0.1:27017/dev_test", ""),
            /require MONGO_URI_TEST to be explicitly set/
        );

        assert.throws(
            () => verifyTestDatabaseConfig("mongodb://127.0.0.1:27017/dev_test", "   "),
            /require MONGO_URI_TEST to be explicitly set/
        );
    });

    it("should throw error if MONGO_URI is missing or empty (fail closed)", () => {
        assert.throws(
            () => verifyTestDatabaseConfig(undefined, "mongodb://127.0.0.1:27017/my_test"),
            /Development database URI \(MONGO_URI\) must be explicitly configured/
        );

        assert.throws(
            () => verifyTestDatabaseConfig("", "mongodb://127.0.0.1:27017/my_test"),
            /Development database URI \(MONGO_URI\) must be explicitly configured/
        );
    });

    it("should throw error if MONGO_URI_TEST matches MONGO_URI exactly", () => {
        const sameUri = "mongodb://127.0.0.1:27017/shared_test";
        assert.throws(
            () => verifyTestDatabaseConfig(sameUri, sameUri),
            /must not be identical to MONGO_URI/
        );
    });

    it("should throw error if both URIs target the same host and database despite differing query parameters", () => {
        const devUri = "mongodb+srv://user:pass@cluster0.example.net/fintech_db?retryWrites=true";
        const testUri = "mongodb+srv://user:pass@cluster0.example.net/fintech_db?w=majority";

        assert.throws(
            () => verifyTestDatabaseConfig(devUri, testUri),
            /Database collision detected/
        );
    });

    it("should detect collision when host is localhost vs 127.0.0.1 with port", () => {
        const devUri = "mongodb://localhost:27017/isolated_db";
        const testUri = "mongodb://127.0.0.1:27017/isolated_db";

        assert.throws(
            () => verifyTestDatabaseConfig(devUri, testUri),
            /Database collision detected/
        );
    });

    it("should reject test URI pointing to the protected development database name", () => {
        assert.throws(
            () =>
                verifyTestDatabaseConfig(
                    "mongodb://clusterA.example.net/backend-fintech",
                    "mongodb://clusterB.example.net/backend-fintech"
                ),
            /targets a protected development database name/
        );
    });

    it("should reject test URI without 'test' in the database name", () => {
        assert.throws(
            () =>
                verifyTestDatabaseConfig(
                    "mongodb://127.0.0.1:27017/fintech_main",
                    "mongodb://127.0.0.1:27017/fintech_staging"
                ),
            /Insecure test database name.*must explicitly contain 'test'/
        );
    });

    it("should accept valid and distinct MONGO_URI_TEST", () => {
        const result = verifyTestDatabaseConfig(
            "mongodb://127.0.0.1:27017/fintech_dev",
            "mongodb://127.0.0.1:27017/fintech_test"
        );
        assert.equal(result, "mongodb://127.0.0.1:27017/fintech_test");
    });
});
