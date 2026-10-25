const mongoose = require("mongoose");
const crypto = require("crypto");

const TRANSACTION_STATUS = ["pending", "success", "failed", "reversed", "cancelled"];
const TRANSACTION_TYPES = ["transfer"];

const transactionSchema = new mongoose.Schema(
    {
        transactionId: {
            type: String,
            required: [true, "Transaction ID is required"],
            unique: true,
            default: () => crypto.randomUUID(),
            index: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Sender ID is required"],
            index: true,
        },
        receiverId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Receiver ID is required"],
            index: true,
        },
        // Amount stored as integer minor units (paise)
        amount: {
            type: Number,
            required: [true, "Amount is required"],
            min: [1, "Transfer amount must be at least 1 paisa"],
            validate: {
                validator: Number.isInteger,
                message: "Transfer amount must be an integer (in paise)",
            },
        },
        type: {
            type: String,
            enum: TRANSACTION_TYPES,
            default: "transfer",
        },
        status: {
            type: String,
            enum: TRANSACTION_STATUS,
            default: "success",
            index: true,
        },
        idempotencyKey: {
            type: String,
            index: true,
            sparse: true,
        },
        description: {
            type: String,
            trim: true,
            maxlength: [200, "Description cannot exceed 200 characters"],
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for querying user's transaction history sorted by newest first
transactionSchema.index({ senderId: 1, createdAt: -1 });
transactionSchema.index({ receiverId: 1, createdAt: -1 });

// Unique compound index on idempotencyKey scoped to senderId to guarantee uniqueness at the database engine level (K-001)
transactionSchema.index({ idempotencyKey: 1, senderId: 1 }, { unique: true, sparse: true });

transactionSchema.set("toJSON", {
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret.__v;
        return ret;
    },
});

const Transaction = mongoose.model("Transaction", transactionSchema);

module.exports = {
    Transaction,
    TRANSACTION_STATUS,
    TRANSACTION_TYPES,
};
