const express = require('express');
const router = express.Router();
const IdentityController = require('../controllers/identity.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

// Create instance of controller
const identityController = new IdentityController();

// Protected routes (require authentication)
router.post('/create', authMiddleware, identityController.createIdentity);
router.post('/verify', authMiddleware, identityController.verifyIdentity);
router.get('/all', authMiddleware, identityController.getAllIdentities);

// Public routes
router.get('/status/:address', identityController.checkIdentityStatus);
router.get('/:address', identityController.getIdentity);

module.exports = router;
