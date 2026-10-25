const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        administrator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Administrator ID is required"],
            index: true,
        },
        action: {
            type: String,
            required: [true, "Action is required"],
            trim: true,
            index: true,
        },
        targetResource: {
            type: String,
            required: [true, "Target resource is required"],
            trim: true,
            index: true,
        },
        details: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
        reason: {
            type: String,
            required: [true, "Audit reason is required"],
            trim: true,
            minlength: [3, "Reason must be at least 3 characters"],
            maxlength: [500, "Reason cannot exceed 500 characters"],
        },
        ipAddress: {
            type: String,
            default: null,
        },
        userAgent: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false },
        versionKey: false,
    }
);

auditLogSchema.index({ administrator: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = {
    AuditLog,
};
