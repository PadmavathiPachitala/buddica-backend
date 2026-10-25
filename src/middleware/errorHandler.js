const AppError = require("../utils/AppError");

function errorHandler(err, req, res, next) {
    let error = err;

    // Handle body-parser malformed JSON SyntaxError
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        error = new AppError("Malformed JSON in request body", 400);
    }

    // Handle Mongoose duplicate key error (code 11000)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || "field";
        error = new AppError(`An account with this ${field} already exists`, 409);
    }

    // Handle Mongoose validation errors
    if (err.name === "ValidationError") {
        const messages = Object.values(err.errors).map((e) => e.message);
        error = new AppError(messages.join(". "), 400);
    }

    // Handle invalid MongoDB ObjectId CastError
    if (err.name === "CastError") {
        error = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
    }

    // Ensure numeric status code between 400 and 599
    const rawCode = error.statusCode || error.status;
    const statusCode =
        typeof rawCode === "number" && rawCode >= 400 && rawCode < 600 ? rawCode : 500;

    // Ensure status is strictly a string: 'fail' (4xx) or 'error' (5xx)
    const status =
        typeof error.status === "string" && ["fail", "error"].includes(error.status)
            ? error.status
            : `${statusCode}`.startsWith("4")
              ? "fail"
              : "error";

    const isProduction = process.env.NODE_ENV === "production";

    // In production, suppress internal error details for unexpected / non-operational errors
    const message =
        isProduction && !error.isOperational
            ? "Internal server error"
            : error.message || "Something went wrong";

    const response = {
        status,
        message,
    };

    if (!isProduction && error.stack) {
        response.stack = error.stack;
    }

    res.status(statusCode).json(response);
}

module.exports = errorHandler;
