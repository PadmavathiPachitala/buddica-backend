const AppError = require("../utils/AppError");

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function validateRegistrationInput(body) {
    if (!body || typeof body !== "object") {
        throw new AppError("Invalid request body", 400);
    }

    const forbiddenFields = ["role", "isActive", "passwordHash", "_id", "createdAt", "updatedAt"];
    for (const field of forbiddenFields) {
        if (field in body) {
            throw new AppError(`Setting '${field}' is not allowed during registration`, 400);
        }
    }

    const { name, email, password } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 50) {
        throw new AppError("Name is required and must be between 2 and 50 characters", 400);
    }

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim().toLowerCase())) {
        throw new AppError("A valid email address is required", 400);
    }

    if (!password || typeof password !== "string") {
        throw new AppError("Password is required", 400);
    }

    if (password.length < 8) {
        throw new AppError("Password must be at least 8 characters long", 400);
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
        throw new AppError("Password cannot exceed 72 bytes in length", 400);
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        throw new AppError("Password must contain at least one letter and one number", 400);
    }

    return {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
    };
}

function validateLoginInput(body) {
    if (!body || typeof body !== "object") {
        throw new AppError("Invalid request body", 400);
    }

    const { email, password } = body;

    if (!email || typeof email !== "string" || !email.trim()) {
        throw new AppError("Email is required", 400);
    }

    if (!password || typeof password !== "string" || !password) {
        throw new AppError("Password is required", 400);
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
        throw new AppError("Invalid email or password", 401);
    }

    return {
        email: email.trim().toLowerCase(),
        password,
    };
}

module.exports = {
    validateRegistrationInput,
    validateLoginInput,
};
