const express = require('express');
const router = express.Router();
const IdentityController = require('../controllers/identity.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const {
    validate,
    commonValidations,
} = require('../middleware/validation.middleware');

const identityController = new IdentityController();

// Protected routes with validation
router.post(
    '/create',
    authMiddleware,
    validate(commonValidations.createIdentity),
    identityController.createIdentity,
);

router.post(
    '/verify',
    authMiddleware,
    validate(commonValidations.addressParam),
    identityController.verifyIdentity,
);

router.get(
    '/all',
    authMiddleware,
    validate(commonValidations.pagination),
    identityController.getAllIdentities,
);

// Public routes with validation
router.get(
    '/status/:address',
    validate(commonValidations.addressParam),
    identityController.checkIdentityStatus,
);

router.get(
    '/:address',
    validate(commonValidations.addressParam),
    identityController.getIdentity,
);

module.exports = router;
