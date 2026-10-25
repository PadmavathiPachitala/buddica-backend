const AppError = require("../utils/AppError");

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        // Must be authenticated first
        if (!req.user) {
            return next(new AppError("Authentication required before authorization.", 401));
        }

        // Fail closed if no roles are defined on the route
        if (!allowedRoles || allowedRoles.length === 0) {
            return next(new AppError("No access permissions configured for this endpoint.", 403));
        }

        // Authoritative role from live server context
        const userRole = req.user.role;

        // Check if role is authorized
        if (!userRole || !allowedRoles.includes(userRole)) {
            return next(
                new AppError("Access denied. You do not have permission to perform this action.", 403)
            );
        }

        next();
    };
}

module.exports = authorizeRoles;
