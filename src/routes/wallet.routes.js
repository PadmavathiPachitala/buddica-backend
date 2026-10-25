const express = require("express");
const walletController = require("../controllers/wallet.controller");
const authenticate = require("../middleware/auth.middleware");
const authorizeRoles = require("../middleware/authorize.middleware");

const router = express.Router();

// GET /api/wallet - Return authenticated customer's wallet balance
router.get("/", authenticate, authorizeRoles("customer"), (req, res, next) =>
    walletController.getBalance(req, res, next)
);

// POST /api/wallet/transfer - Transfer funds between customer accounts
router.post("/transfer", authenticate, authorizeRoles("customer"), (req, res, next) =>
    walletController.transfer(req, res, next)
);

// GET /api/wallet/transactions - View customer's own transaction history (debits & credits)
router.get("/transactions", authenticate, authorizeRoles("customer"), (req, res, next) =>
    walletController.getTransactions(req, res, next)
);

module.exports = router;
