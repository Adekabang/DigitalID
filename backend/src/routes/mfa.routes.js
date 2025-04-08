const express = require('express');
const { body, param } = require('express-validator');
const { ethers } = require('ethers');
const router = express.Router();
const mfaController = require('../controllers/mfa.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
    validate,
    commonValidations,
} = require('../middleware/validation.middleware');

// Enable MFA
router.post(
    '/enable',
    authMiddleware,
    validate([
        body('factors')
            .isArray()
            .withMessage('Factors must be an array')
            .notEmpty()
            .withMessage('At least one factor is required'),
    ]),
    mfaController.enableMFA,
);

// Start authentication session
router.post('/session/start', authMiddleware, mfaController.startAuthSession);

// Verify factor
router.post(
    '/verify',
    authMiddleware,
    validate([
        body('factor').isInt().withMessage('Invalid factor type'),
        body('challenge')
            .isString()
            .matches(/^0x[a-fA-F0-9]{64}$/)
            .withMessage('Invalid challenge format'),
        body('signature')
            .isString()
            .matches(/^0x[a-fA-F0-9]{130}$/)
            .withMessage('Invalid signature format'),
    ]),
    mfaController.verifyFactor,
);

// Get MFA status
router.get(
    '/status/:address',
    validate([...commonValidations.addressParam]),
    mfaController.getMFAStatus,
);

// Add factor
router.post(
    '/factor/add',
    authMiddleware,
    validate([body('factor').isInt().withMessage('Invalid factor type')]),
    mfaController.manageFactor,
);

// Remove factor
router.post(
    '/factor/remove',
    authMiddleware,
    validate([body('factor').isInt().withMessage('Invalid factor type')]),
    mfaController.manageFactor,
);

// Disable MFA
router.post('/disable', authMiddleware, mfaController.disableMFA);

module.exports = router;
