const mongoose = require("mongoose");
const AppError = require("../utils/AppError");
const { TRANSACTION_STATUS } = require("../models/transaction.model");

const VALID_ROLES = ["customer", "support", "admin"];
const VALID_TRANSACTION_STATUSES = TRANSACTION_STATUS;

function validateRoleChangeInput(body) {
    if (!body || typeof body !== "object") {
        throw new AppError("Invalid request body", 400);
    }

    const { role, reason } = body;

    if (!role || typeof role !== "string" || !VALID_ROLES.includes(role.trim())) {
        throw new AppError(`Valid role is required. Allowed roles: ${VALID_ROLES.join(", ")}`, 400);
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
        throw new AppError("A reason (minimum 3 characters) is required for audit trail", 400);
    }

    if (reason.trim().length > 500) {
        throw new AppError("Reason cannot exceed 500 characters", 400);
    }

    return {
        role: role.trim(),
        reason: reason.trim(),
    };
}

function validateTransactionStatusInput(body) {
    if (!body || typeof body !== "object") {
        throw new AppError("Invalid request body", 400);
    }

    const { status, reason } = body;

    if (!status || typeof status !== "string" || !VALID_TRANSACTION_STATUSES.includes(status.trim())) {
        throw new AppError(`Valid status is required. Allowed: ${VALID_TRANSACTION_STATUSES.join(", ")}`, 400);
    }

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
        throw new AppError("A reason (minimum 3 characters) is required for audit trail", 400);
    }

    if (reason.trim().length > 500) {
        throw new AppError("Reason cannot exceed 500 characters", 400);
    }

    return {
        status: status.trim(),
        reason: reason.trim(),
    };
}

module.exports = {
    VALID_ROLES,
    VALID_TRANSACTION_STATUSES,
    validateRoleChangeInput,
    validateTransactionStatusInput,
};
