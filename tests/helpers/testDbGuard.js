const BANNED_DEV_DB_NAMES = ["backend-fintech", "fintech_dev"];

function parseMongoTarget(uri) {
    if (!uri || typeof uri !== "string" || !uri.trim()) return null;
    const clean = uri.trim();
    const match = clean.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]+@)?([^/?#]+)(?:\/([^?#]*))?/i);
    if (!match) return null;

    const rawHost = match[1].toLowerCase().trim();
    const hosts = rawHost
        .split(",")
        .map((h) => {
            const trimmed = h.trim();
            return trimmed.replace(/^localhost(:[0-9]+)?$/, (m, port) => `127.0.0.1${port || ":27017"}`);
        })
        .sort()
        .join(",");

    const dbName = (match[2] || "").trim() || "test";
    return { hosts, dbName };
}

function verifyTestDatabaseConfig(devUri, testUri) {
    // 1. Enforce presence of test URI
    if (!testUri || typeof testUri !== "string" || !testUri.trim()) {
        throw new Error(
            "FATAL: Integration tests require MONGO_URI_TEST to be explicitly set. Aborting to protect development database."
        );
    }

    // 2. Enforce presence of development URI (Fail closed)
    if (!devUri || typeof devUri !== "string" || !devUri.trim()) {
        throw new Error(
            "FATAL: Development database URI (MONGO_URI) must be explicitly configured to verify database isolation."
        );
    }

    // 3. String equality check
    if (devUri.trim() === testUri.trim()) {
        throw new Error(
            "FATAL: MONGO_URI_TEST must not be identical to MONGO_URI. Tests must run in an isolated database."
        );
    }

    // 4. Parse host and database components
    const devTarget = parseMongoTarget(devUri);
    const testTarget = parseMongoTarget(testUri);

    if (!devTarget || !testTarget) {
        throw new Error(
            "FATAL: Could not verify database isolation between development and test connection strings."
        );
    }

    // 5. Host and DB name collision check
    if (devTarget.hosts === testTarget.hosts && devTarget.dbName === testTarget.dbName) {
        throw new Error(
            "FATAL: Database collision detected. MONGO_URI_TEST targets the same database instance as MONGO_URI."
        );
    }

    // 6. Explicit development DB name blacklist
    if (BANNED_DEV_DB_NAMES.includes(testTarget.dbName)) {
        throw new Error(
            "FATAL: Database collision detected. MONGO_URI_TEST targets a protected development database name."
        );
    }

    // 7. Test naming convention enforcement
    if (!testTarget.dbName.toLowerCase().includes("test")) {
        throw new Error(
            "FATAL: Insecure test database name. MONGO_URI_TEST database name must explicitly contain 'test'."
        );
    }

    return testUri.trim();
}

module.exports = {
    parseMongoTarget,
    verifyTestDatabaseConfig,
};
