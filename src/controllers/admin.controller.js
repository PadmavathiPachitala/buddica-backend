const adminService = require("../services/admin.service");
const {
    validateRoleChangeInput,
    validateTransactionStatusInput,
} = require("../validators/admin.validators");

class AdminController {
    async getUsers(req, res, next) {
        try {
            const { search, role, isActive, page, limit } = req.query;
            const result = await adminService.listUsers({
                search,
                role,
                isActive,
                page,
                limit,
            });

            res.status(200).json({
                status: "success",
                data: result,
            });
        } catch (err) {
            next(err);
        }
    }

    async updateUserRole(req, res, next) {
        try {
            const validated = validateRoleChangeInput(req.body);
            const user = await adminService.updateUserRole({
                adminId: req.user._id,
                targetUserId: req.params.userId,
                newRole: validated.role,
                reason: validated.reason,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
            });

            res.status(200).json({
                status: "success",
                data: {
                    user,
                },
            });
        } catch (err) {
            next(err);
        }
    }

    async getTransactions(req, res, next) {
        try {
            const { status, senderId, receiverId, userId, user, startDate, endDate, page, limit } = req.query;
            const targetUserId = userId || user;
            const result = await adminService.listTransactions({
                status,
                senderId,
                receiverId,
                userId: targetUserId,
                startDate,
                endDate,
                page,
                limit,
            });

            res.status(200).json({
                status: "success",
                data: result,
            });
        } catch (err) {
            next(err);
        }
    }

    async updateTransactionStatus(req, res, next) {
        try {
            const validated = validateTransactionStatusInput(req.body);
            const transaction = await adminService.updateTransactionStatus({
                adminId: req.user._id,
                transactionId: req.params.transactionId,
                newStatus: validated.status,
                reason: validated.reason,
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
            });

            res.status(200).json({
                status: "success",
                data: {
                    transaction,
                },
            });
        } catch (err) {
            next(err);
        }
    }

    async getAuditLogs(req, res, next) {
        try {
            const { action, administrator, page, limit } = req.query;
            const result = await adminService.getAuditLogs({
                action,
                administrator,
                page,
                limit,
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

module.exports = new AdminController();
