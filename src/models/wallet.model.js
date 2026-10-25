const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Wallet must belong to a user"],
            unique: true,
            index: true,
        },
        // Balance stored as integer minor units (paise, 1 INR = 100 paise)
        balance: {
            type: Number,
            required: [true, "Wallet balance is required"],
            default: 0,
            validate: {
                validator: Number.isInteger,
                message: "Wallet balance must be an integer (in minor currency units/paise)",
            },
            min: [0, "Wallet balance cannot be negative"],
        },
        currency: {
            type: String,
            required: [true, "Wallet currency is required"],
            default: "INR",
            uppercase: true,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

walletSchema.set("toJSON", {
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret.__v;
        return ret;
    },
});

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = {
    Wallet,
};
