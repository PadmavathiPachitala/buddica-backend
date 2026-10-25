const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models/user.model");
const { Wallet } = require("../models/wallet.model");
const AppError = require("../utils/AppError");
const env = require("../config/env");

class AuthService {
    async registerUser({ name, email, password }) {
        // Preliminary duplicate check
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new AppError("An account with this email already exists", 409);
        }

        // Hash password with strong cost factor
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        let user;
        try {
            // Role is strictly hardcoded to 'customer' on the server; public registration cannot escalate privileges
            user = await User.create({
                name,
                email,
                passwordHash,
                role: "customer",
                isActive: true,
            });

            // Automatically create customer wallet initialized to 0 balance (in paise)
            try {
                await Wallet.create({
                    userId: user._id,
                    balance: 0,
                    currency: "INR",
                });
            } catch (walletErr) {
                // Compensating rollback to prevent orphaned user without a wallet (K-007)
                await User.findByIdAndDelete(user._id);
                throw walletErr;
            }

            // Issue JWT containing only essential identity claims (subject claim 'sub')
            const token = jwt.sign(
                { sub: user._id.toString() },
                env.JWT_SECRET,
                {
                    algorithm: env.JWT_ALGORITHM,
                    expiresIn: env.JWT_EXPIRES_IN,
                }
            );

            return {
                user: user.toJSON(),
                token,
            };
        } catch (err) {
            // Cleanly catch concurrent race condition duplicate key errors from MongoDB
            if (err.code === 11000) {
                throw new AppError("An account with this email already exists", 409);
            }
            throw err;
        }
    }

    async loginUser({ email, password }) {
        // Query user explicitly selecting passwordHash
        const user = await User.findOne({ email }).select("+passwordHash");

        // Use generic message to prevent account enumeration
        if (!user) {
            throw new AppError("Invalid email or password", 401);
        }

        // Check if account has been deactivated
        if (!user.isActive) {
            throw new AppError("Account is inactive. Please contact support.", 403);
        }

        // Compare password with stored hash
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            throw new AppError("Invalid email or password", 401);
        }

        // Issue JWT containing only essential identity claims (subject claim 'sub')
        const token = jwt.sign(
            { sub: user._id.toString() },
            env.JWT_SECRET,
            {
                algorithm: env.JWT_ALGORITHM,
                expiresIn: env.JWT_EXPIRES_IN,
            }
        );

        return {
            user: user.toJSON(),
            token,
        };
    }

    async getUserProfile(userId) {
        const user = await User.findById(userId);
        if (!user || !user.isActive) {
            throw new AppError("User account not found or is inactive", 404);
        }
        return user.toJSON();
    }
}

module.exports = new AuthService();
