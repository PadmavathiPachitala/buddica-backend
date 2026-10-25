const authService = require("../services/auth.service");
const {
    validateRegistrationInput,
    validateLoginInput,
} = require("../validators/auth.validators");

class AuthController {
    async register(req, res, next) {
        try {
            const validatedInput = validateRegistrationInput(req.body);
            const { user, token } = await authService.registerUser(validatedInput);

            res.status(201).json({
                status: "success",
                message: "User registered successfully",
                data: {
                    user,
                    token,
                },
            });
        } catch (err) {
            next(err);
        }
    }

    async login(req, res, next) {
        try {
            const validatedInput = validateLoginInput(req.body);
            const { user, token } = await authService.loginUser(validatedInput);

            res.status(200).json({
                status: "success",
                message: "Login successful",
                data: {
                    token,
                    user,
                },
            });
        } catch (err) {
            next(err);
        }
    }

    async getMe(req, res, next) {
        try {
            // Read from server-verified request context set by auth middleware
            const safeUser = req.user.toJSON ? req.user.toJSON() : req.user;

            res.status(200).json({
                status: "success",
                data: {
                    user: safeUser,
                },
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AuthController();
