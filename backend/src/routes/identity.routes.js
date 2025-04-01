const express = require('express');
const router = express.Router();
const identityController = require('../controllers/identity.controller');
const { authMiddleware } = require('../middleware/auth.middleware');


// Protected routes (require authentication)
router.post('/create', authMiddleware, identityController.createIdentity.bind(identityController));
router.post('/verify', authMiddleware, identityController.verifyIdentity);
router.put('/update', authMiddleware, identityController.updateIdentity.bind(identityController));
router.get('/all', authMiddleware, identityController.getAllIdentities.bind(identityController));


// Public routes
router.get('/status/:address', identityController.checkIdentityStatus.bind(identityController));
router.get('/:address', identityController.getIdentity.bind(identityController));

module.exports = router;
