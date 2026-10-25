const express = require("express");
const adminController = require("../controllers/admin.controller");
const authenticate = require("../middleware/auth.middleware");
const authorizeRoles = require("../middleware/authorize.middleware");

const router = express.Router();

// Apply authentication middleware to all admin endpoints
router.use(authenticate);

// GET /api/admin/users - Admin only: view and filter users
router.get("/users", authorizeRoles("admin"), (req, res, next) =>
    adminController.getUsers(req, res, next)
);

// PATCH /api/admin/users/:userId/role - Admin only: change user role with audit log
router.patch("/users/:userId/role", authorizeRoles("admin"), (req, res, next) =>
    adminController.updateUserRole(req, res, next)
);

// GET /api/admin/transactions - Support & Admin: search and view all system transactions
router.get("/transactions", authorizeRoles("support", "admin"), (req, res, next) =>
    adminController.getTransactions(req, res, next)
);

// PATCH /api/admin/transactions/:transactionId/status - Admin only: alter transaction status with audit log
router.patch("/transactions/:transactionId/status", authorizeRoles("admin"), (req, res, next) =>
    adminController.updateTransactionStatus(req, res, next)
);

// GET /api/admin/audit-logs - Admin only: view immutable audit trail
router.get("/audit-logs", authorizeRoles("admin"), (req, res, next) =>
    adminController.getAuditLogs(req, res, next)
);

module.exports = router;
