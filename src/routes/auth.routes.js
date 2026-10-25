const express = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middleware/auth.middleware");
const { registerLimiter, loginLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.post("/register", registerLimiter, (req, res, next) =>
    authController.register(req, res, next)
);

router.post("/login", loginLimiter, (req, res, next) =>
    authController.login(req, res, next)
);

router.get("/me", authenticate, (req, res, next) =>
    authController.getMe(req, res, next)
);

module.exports = router;
