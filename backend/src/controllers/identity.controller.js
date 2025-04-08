// backend/src/controllers/identity.controller.js

const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ethers } = require('ethers');
const {
    ValidationError,
    NotFoundError,
    AppError,
} = require('../middleware/error.middleware'); // Import custom errors

class IdentityController {
    constructor() {
        // Bind methods to the instance
        this.createIdentity = this.createIdentity.bind(this);
        this.getIdentity = this.getIdentity.bind(this);
        // Rename verifyIdentity to match the service method if needed
        this.approveIdentityVerification =
            this.approveIdentityVerification.bind(this);
        this.getAllIdentities = this.getAllIdentities.bind(this);
        this.checkIdentityStatus = this.checkIdentityStatus.bind(this);
        this.isValidDID = this.isValidDID.bind(this);
    }

    isValidDID(did) {
        // Basic DID format check, can be enhanced
        const didRegex = /^did:[a-z0-9]+:.+/i;
        return didRegex.test(did);
    }

    async createIdentity(req, res, next) {
        // Add next for error handling
        try {
            const { address, did } = req.body;

            // Use ValidationError for input issues
            if (!address || !did) {
                throw new ValidationError('Address and DID are required');
            }
            if (!ethers.isAddress(address)) {
                throw new ValidationError('Invalid Ethereum address format');
            }
            if (!this.isValidDID(did)) {
                throw new ValidationError('Invalid DID format');
            }

            // --- FIX: Call the correct method ---
            const identityExists = await blockchainService.hasIdentity(address);
            // --- End Fix ---

            if (identityExists) {
                // Use a specific AppError for conflicts
                throw new AppError(
                    'Identity already exists for this address',
                    409,
                    'IDENTITY_CONFLICT',
                );
            }

            logger.info(
                `Attempting identity creation for address: ${address} with DID: ${did}`,
            );

            // blockchainService.createIdentity now returns the result of executeTransaction
            const result = await blockchainService.createIdentity(address, did);

            logger.info(
                `Identity created successfully via ModeratorControl: Tx ${result.transactionHash}`,
            );

            res.status(201).json({
                success: true,
                message: 'Identity creation initiated successfully.',
                data: {
                    address,
                    did,
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber,
                },
            });
        } catch (error) {
            // Pass error to the central error handler
            logger.error(`Create identity controller error: ${error.message}`);
            next(error); // Let error.middleware.js handle the response format
        }
    }

    async getIdentity(req, res, next) {
        // Add next
        try {
            const { address } = req.params;

            if (!address || !ethers.isAddress(address)) {
                throw new ValidationError(
                    'Invalid Ethereum address format in URL parameter',
                );
            }

            // getIdentity in service now throws if not found
            const identity = await blockchainService.getIdentity(address);

            res.json({
                success: true,
                data: identity,
            });
        } catch (error) {
            logger.error(`Get identity controller error: ${error.message}`);
            // Check if it's the specific "not found" error from the service
            if (error.message.includes('Identity does not exist')) {
                next(
                    new NotFoundError(
                        `Identity not found for address ${req.params.address}`,
                    ),
                );
            } else {
                next(error); // Pass other errors to central handler
            }
        }
    }

    // Renamed to match service method for clarity
    async approveIdentityVerification(req, res, next) {
        // Add next
        try {
            // Assuming address and level come from request body
            const { address, level } = req.body;

            if (!address || !ethers.isAddress(address)) {
                throw new ValidationError('Invalid Ethereum address format');
            }
            // Add validation for 'level' enum index
            if (
                level === undefined ||
                typeof level !== 'number' ||
                level < 0 ||
                level > 3
            ) {
                throw new ValidationError(
                    'Invalid or missing verification level (must be 0-3)',
                );
            }

            // Check if identity exists first (optional but good practice)
            const identityExists = await blockchainService.hasIdentity(address);
            if (!identityExists) {
                throw new NotFoundError(
                    `Cannot verify: Identity not found for address ${address}`,
                );
            }

            logger.info(
                `Attempting identity verification approval for ${address} to level ${level}`,
            );
            const result = await blockchainService.approveIdentityVerification(
                address,
                level,
            );

            res.json({
                success: true,
                message: `Identity verification approval initiated for level ${level}.`,
                data: {
                    address,
                    level,
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber,
                },
            });
        } catch (error) {
            logger.error(
                `Approve identity verification controller error: ${error.message}`,
            );
            next(error);
        }
    }

    async getAllIdentities(req, res, next) {
        // Add next
        try {
            // Ensure page and limit are positive integers
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.max(
                1,
                Math.min(100, parseInt(req.query.limit) || 10),
            ); // Add upper bound

            const result = await blockchainService.getAllIdentities(
                page,
                limit,
            );

            res.json({
                success: true,
                data: result.identities,
                pagination: result.pagination,
            });
        } catch (error) {
            logger.error(
                `Get all identities controller error: ${error.message}`,
            );
            next(error);
        }
    }

    async checkIdentityStatus(req, res, next) {
        // Add next
        try {
            const { address } = req.params;

            if (!address || !ethers.isAddress(address)) {
                throw new ValidationError(
                    'Invalid Ethereum address format in URL parameter',
                );
            }

            const exists = await blockchainService.hasIdentity(address);
            if (!exists) {
                return res.json({
                    success: true,
                    data: {
                        exists: false,
                        status: 'NOT_FOUND',
                        verificationLevel: null, // Consistent null value
                        creationDate: null,
                    },
                });
            }

            // If it exists, get full details (already converted by the service)
            const identity = await blockchainService.getIdentity(address);

            // --- FIX: Use the already converted fields from the service ---
            res.json({
                success: true,
                data: {
                    exists: true,
                    // Determine status based on verification level (now a Number)
                    status:
                        identity.verificationLevel > 0
                            ? 'VERIFIED'
                            : 'UNVERIFIED',
                    verificationLevel: identity.verificationLevel, // Use the Number
                    creationDate: identity.creationDate, // Use the String from service
                },
            });
            // --- End Fix ---
        } catch (error) {
            logger.error(
                `Check identity status controller error: ${error.message}`,
            );
            // Handle potential IDENTITY_NOT_FOUND from getIdentity if hasIdentity check fails somehow
            if (error.code === 'IDENTITY_NOT_FOUND') {
                next(new NotFoundError(error.message));
            } else {
                next(error);
            }
        }
    }
}

// Export the class itself if using dependency injection or the instance if not
module.exports = new IdentityController(); // Export instance for direct use in routes
