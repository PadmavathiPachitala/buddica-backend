const rateLimit = require("express-rate-limit");
const AppError = require("../utils/AppError");
const env = require("../config/env");

const isTest = env.NODE_ENV === "test";

const loginLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_LOGIN_WINDOW_MS,
    max: isTest ? 1000 : env.RATE_LIMIT_LOGIN_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
        next(new AppError("Too many login attempts. Please try again after 15 minutes.", 429));
    },
});

const registerLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_REGISTER_WINDOW_MS,
    max: isTest ? 1000 : env.RATE_LIMIT_REGISTER_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => {
        next(new AppError("Too many accounts created from this IP. Please try again later.", 429));
    },
});

function createTestLimiter({ windowMs = 60000, max = 3, message = "Too many requests." } = {}) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res, next) => {
            next(new AppError(message, 429));
        },
    });
}

module.exports = {
    loginLimiter,
    registerLimiter,
    createTestLimiter,
};
