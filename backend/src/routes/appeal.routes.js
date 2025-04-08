const express = require('express');
const { body, param } = require('express-validator');
const { ethers } = require('ethers');
const router = express.Router();
const appealController = require('../controllers/appeal.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
    validate,
    commonValidations,
} = require('../middleware/validation.middleware');

// Submit an appeal
router.post(
    '/submit',
    authMiddleware,
    validate([
        body('address')
            .exists()
            .custom((value) => ethers.isAddress(value))
            .withMessage('Invalid Ethereum address'),
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
    ]),
    appealController.submitAppeal,
);

// Get appeal status
router.get(
    '/status/:address/:appealIndex',
    validate([
        ...commonValidations.addressParam,
        param('appealIndex')
            .isInt({ min: 0 })
            .withMessage('Invalid appeal index'),
    ]),
    appealController.getAppealStatus,
);

// Get appeal history
router.get(
    '/history/:address',
    validate([
        ...commonValidations.addressParam,
        ...commonValidations.pagination,
    ]),
    appealController.getAppealHistory,
);

// Confirm appeal (for recovery contacts)
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
