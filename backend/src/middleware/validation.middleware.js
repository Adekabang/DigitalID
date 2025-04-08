const { validationResult, body, param, query } = require('express-validator');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

// Custom validator for Ethereum addresses
const isEthereumAddress = (value) => {
    return ethers.isAddress(value);
};

// Common validation rules
const commonValidations = {
    // Identity validations
    createIdentity: [
        body('address')
            .exists()
            .custom(isEthereumAddress)
            .withMessage('Invalid Ethereum address'),
        body('did')
            .exists()
            .matches(/^did:[a-zA-Z0-9]+:.+/)
            .withMessage('Invalid DID format'),
    ],

    // Reputation validations
    updateReputation: [
        body('address')
            .exists()
            .custom(isEthereumAddress)
            .withMessage('Invalid Ethereum address'),
        body('points')
            .exists()
            .isInt()
            .withMessage('Points must be an integer'),
    ],

    // Moderation validations
    createCase: [
        body('address')
            .exists()
            .custom(isEthereumAddress)
            .withMessage('Invalid Ethereum address'),
        body('actionType')
            .exists()
            .isInt({ min: 0, max: 4 })
            .withMessage('Invalid action type'),
        body('reason')
            .exists()
            .isString()
            .trim()
            .isLength({ min: 3, max: 500 })
            .withMessage('Reason must be between 3 and 500 characters'),
    ],

    // Pagination validations
    pagination: [
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100'),
    ],

    // Address parameter validation
    addressParam: [
        param('address')
            .exists()
            .custom(isEthereumAddress)
            .withMessage('Invalid Ethereum address'),
    ],
};

// Validation middleware
const validate = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map((validation) => validation.run(req)));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn('Validation error:', errors.array());
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        next();
    };
};

module.exports = {
    validate,
    commonValidations,
};
