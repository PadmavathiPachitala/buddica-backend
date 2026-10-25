const mongoose = require("mongoose");
const AppError = require("../utils/AppError");

function validateTransferInput(body, senderId) {
    if (!body || typeof body !== "object") {
        throw new AppError("Invalid request body", 400);
    }

    const { receiverId, amount, description } = body;

    if (!receiverId || typeof receiverId !== "string" || !mongoose.Types.ObjectId.isValid(receiverId)) {
        throw new AppError("A valid receiverId is required", 400);
    }

    if (senderId && senderId.toString() === receiverId.toString()) {
        throw new AppError("Cannot transfer funds to yourself", 400);
    }

    if (amount === undefined || amount === null || typeof amount !== "number") {
        throw new AppError("Amount is required and must be a number", 400);
    }

    if (!Number.isInteger(amount) || amount <= 0) {
        throw new AppError("Amount must be a positive integer in paise (e.g. 100 for 1 INR)", 400);
    }

    // Upper limit safeguard: max 100,00,000 paise (1 lakh INR) per single transfer
    if (amount > 10000000) {
        throw new AppError("Transfer amount exceeds maximum allowed limit per transaction", 400);
    }

    let sanitizedDescription = "";
    if (description) {
        if (typeof description !== "string") {
            throw new AppError("Description must be a string", 400);
        }
        sanitizedDescription = description.trim().slice(0, 200);
    }

    return {
        receiverId: receiverId.trim(),
        amount,
        description: sanitizedDescription,
    };
}

module.exports = {
    validateTransferInput,
};
