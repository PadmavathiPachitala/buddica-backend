require("dotenv").config();

function getEnvConfig() {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET || JWT_SECRET.trim().length < 32) {
        throw new Error(
            "FATAL CONFIG ERROR: JWT_SECRET must be set in environment variables and be at least 32 characters long."
        );
    }

    return {
        NODE_ENV: process.env.NODE_ENV || "development",
        PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
        MONGO_URI: process.env.MONGO_URI,
        MONGO_URI_TEST: process.env.MONGO_URI_TEST,
        JWT_SECRET: JWT_SECRET.trim(),
        JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
        JWT_ALGORITHM: "HS256",
        RATE_LIMIT_LOGIN_WINDOW_MS: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 10) || 15 * 60 * 1000,
        RATE_LIMIT_LOGIN_MAX: parseInt(process.env.RATE_LIMIT_LOGIN_MAX, 10) || 5,
        RATE_LIMIT_REGISTER_WINDOW_MS: parseInt(process.env.RATE_LIMIT_REGISTER_WINDOW_MS, 10) || 60 * 60 * 1000,
        RATE_LIMIT_REGISTER_MAX: parseInt(process.env.RATE_LIMIT_REGISTER_MAX, 10) || 10,
    };
}

module.exports = getEnvConfig();
