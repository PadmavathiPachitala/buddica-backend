const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { User } = require("../models/user.model");
const AppError = require("../utils/AppError");
const env = require("../config/env");

async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return next(
                new AppError("Authentication required. Please provide a valid Bearer token.", 401)
            );
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return next(new AppError("Authentication token is missing.", 401));
        }

        let decoded;
        try {
            decoded = jwt.verify(token, env.JWT_SECRET, {
                algorithms: [env.JWT_ALGORITHM],
            });
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return next(new AppError("Authentication token has expired. Please log in again.", 401));
            }
            if (err.name === "JsonWebTokenError") {
                return next(new AppError("Invalid authentication token.", 401));
            }
            return next(new AppError("Authentication failed.", 401));
        }

        if (
            !decoded ||
            !decoded.sub ||
            typeof decoded.sub !== "string" ||
            !mongoose.Types.ObjectId.isValid(decoded.sub)
        ) {
            return next(new AppError("Invalid authentication token.", 401));
        }

        // Load authoritative user from database to ensure account was not deleted or deactivated
        const user = await User.findById(decoded.sub);

        if (!user) {
            return next(new AppError("The user belonging to this token no longer exists.", 401));
        }

        if (!user.isActive) {
            return next(new AppError("Account is inactive. Access denied.", 403));
        }

        // Attach verified user instance
        req.user = user;
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = authenticate;
