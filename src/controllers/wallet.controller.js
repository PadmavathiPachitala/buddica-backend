const walletService = require("../services/wallet.service");
const { validateTransferInput } = require("../validators/wallet.validators");

class WalletController {
    async getBalance(req, res, next) {
        try {
            // Read userId from authenticated server context, preventing customer from viewing another's wallet
            const walletData = await walletService.getWalletBalance(req.user._id);

            res.status(200).json({
                status: "success",
                data: {
                    wallet: walletData,
                },
            });
        } catch (err) {
            next(err);
        }
    }

    async transfer(req, res, next) {
        try {
            const validated = validateTransferInput(req.body, req.user._id);
            const idempotencyKey = req.headers["idempotency-key"] || req.body.idempotencyKey;

            const result = await walletService.transferFunds({
                senderId: req.user._id,
                receiverId: validated.receiverId,
                amount: validated.amount,
                description: validated.description,
                idempotencyKey,
            });

            res.status(result.isDuplicate ? 200 : 201).json({
                status: "success",
                data: result,
            });
        } catch (err) {
            next(err);
        }
    }

    async getTransactions(req, res, next) {
        try {
            const { page, limit, status } = req.query;
            const result = await walletService.getCustomerTransactions({
                userId: req.user._id,
                page,
                limit,
                status,
            });

            res.status(200).json({
                status: "success",
                data: result,
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new WalletController();
