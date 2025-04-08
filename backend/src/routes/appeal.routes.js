// backend/src/routes/appeal.routes.js

const express = require('express');
const { body, param } = require('express-validator');
const { ethers } = require('ethers');
const router = express.Router();
const appealController = require('../controllers/appeal.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
    validate,
    commonValidations,
    isEthereumAddress,
} = require('../middleware/validation.middleware');

// Submit a signed appeal
router.post(
    // Consider renaming to /submit-signed for clarity
    '/submit',
    authMiddleware, // Ensures user is logged in via JWT
    validate([
        // --- UPDATED Validation Rules ---
        body('userAddress') // Expect user's address in body
            .exists()
            .custom(isEthereumAddress)
            .withMessage('Invalid or missing userAddress'),
        body('reason')
            .exists()
            .isString()
            .trim()
            .isLength({ min: 3, max: 500 })
            .withMessage('Reason must be between 3 and 500 characters'),
        body('evidence')
            .exists()
            .isString()
            .trim()
            .notEmpty()
            .withMessage('Evidence is required'),
        body('caseId')
            .exists()
            .isInt({ min: 0 })
            .withMessage('Valid case ID is required'),
        body('signature') // Expect signature in body
            .exists()
            .isString()
            .matches(/^0x[a-fA-F0-9]+$/) // Basic hex check
            .isLength({ min: 132, max: 132 }) // 65 bytes hex = 130 chars + 0x prefix
            .withMessage('Invalid or missing signature format'),
        // --- End UPDATED Validation Rules ---
    ]),
    appealController.submitAppeal, // Controller needs to handle these fields
);

// Get appeal status (no change needed here)
router.get(
    '/status/:address/:appealIndex',
    validate([
        param('address')
            .custom(isEthereumAddress)
            .withMessage('Invalid Ethereum address format in URL'),
        param('appealIndex')
            .isInt({ min: 0 })
            .withMessage('Invalid appeal index'),
    ]),
    appealController.getAppealStatus,
);

// Get appeal history (no change needed here)
router.get(
    '/history/:address',
    validate([
        param('address')
            .custom(isEthereumAddress)
            .withMessage('Invalid Ethereum address format in URL'),
        ...commonValidations.pagination,
    ]),
    appealController.getAppealHistory,
);

// Confirm appeal (for recovery contacts) - NOTE: This relates to VerificationRegistry
// No change needed here based on AppealSystem modifications
router.post(
    '/confirm/:requestId',
    authMiddleware,
    validate([
        param('requestId')
            .isString()
            .matches(/^0x[a-fA-F0-9]{64}$/)
            .withMessage('Invalid request ID format'),
    ]),
    appealController.confirmAppeal,
);

module.exports = router;
