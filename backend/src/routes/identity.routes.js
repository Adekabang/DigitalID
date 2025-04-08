const express = require('express');
const router = express.Router();
// Import the instance exported from the controller file
const identityController = require('../controllers/identity.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
    validate,
    commonValidations,
    isEthereumAddress,
} = require('../middleware/validation.middleware');
const { body } = require('express-validator'); // Import body for verification route validation

// Protected routes with validation
router.post(
    '/create',
    authMiddleware,
    validate(commonValidations.createIdentity), // Assuming this validation exists
    identityController.createIdentity, // Use the imported instance's method
);

// Route for approving verification - use POST or PUT
router.post(
    '/verify',
    authMiddleware,
    validate([
        body('address')
            .exists()
            .custom(isEthereumAddress) // <-- Use the imported function directly
            .withMessage('Invalid Ethereum address format'), // Keep message for clarity
        body('level')
            .exists()
            .isInt({ min: 0, max: 3 })
            .withMessage('Invalid or missing verification level (must be 0-3)'),
    ]),
    identityController.approveIdentityVerification,
);

router.get(
    '/all',
    authMiddleware,
    validate(commonValidations.pagination), // Assuming this validation exists
    identityController.getAllIdentities, // Use the imported instance's method
);

// Public routes with validation
router.get(
    '/status/:address',
    validate(commonValidations.addressParam), // Assuming this validation exists
    identityController.checkIdentityStatus, // Use the imported instance's method
);

router.get(
    '/:address',
    validate(commonValidations.addressParam), // Assuming this validation exists
    identityController.getIdentity, // Use the imported instance's method
);

module.exports = router;
