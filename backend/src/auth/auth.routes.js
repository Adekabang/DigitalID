const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rate-limit.middleware');

// Public routes
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authLimiter, authController.refresh);

// Protected routes
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;
