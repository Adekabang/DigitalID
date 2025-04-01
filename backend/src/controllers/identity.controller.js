const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

class IdentityController {
    constructor() {
        // Bind methods to the instance
        this.createIdentity = this.createIdentity.bind(this);
        this.getIdentity = this.getIdentity.bind(this);
        this.verifyIdentity = this.verifyIdentity.bind(this);
        this.getAllIdentities = this.getAllIdentities.bind(this);
        this.checkIdentityStatus = this.checkIdentityStatus.bind(this);
        this.isValidDID = this.isValidDID.bind(this);
    }

    isValidDID(did) {
        const didRegex = /^did:[a-zA-Z0-9]+:.+/;
        return didRegex.test(did);
    }

    async createIdentity(req, res) {
        try {
            const { address, did } = req.body;

            if (!address || !did) {
                return res.status(400).json({
                    success: false,
                    error: 'Address and DID are required'
                });
            }

            if (!ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Ethereum address'
                });
            }

            if (!this.isValidDID(did)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid DID format'
                });
            }

            const hasIdentity = await blockchainService.checkIdentityExists(address);
            if (hasIdentity) {
                return res.status(409).json({
                    success: false,
                    error: 'Identity already exists for this address'
                });
            }

            logger.info(`Creating identity for address: ${address} with DID: ${did}`);

            const result = await blockchainService.createIdentity(address, did);

            logger.info(`Identity created successfully: ${JSON.stringify(result)}`);

            res.status(201).json({
                success: true,
                data: {
                    address,
                    did,
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber
                }
            });

        } catch (error) {
            logger.error('Create identity error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create identity',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async getIdentity(req, res) {
        try {
            const { address } = req.params;

            if (!address || !ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Ethereum address'
                });
            }

            const identity = await blockchainService.getIdentity(address);

            res.json({
                success: true,
                data: identity
            });

        } catch (error) {
            logger.error('Get identity error:', error);
            
            if (error.message.includes('Identity does not exist')) {
                return res.status(404).json({
                    success: false,
                    error: 'Identity not found'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to retrieve identity',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async verifyIdentity(req, res) {
        try {
            const { address } = req.body;
            
            if (!address || !ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Ethereum address'
                });
            }

            const hasIdentity = await blockchainService.checkIdentityExists(address);
            if (!hasIdentity) {
                return res.status(404).json({
                    success: false,
                    error: 'Identity not found'
                });
            }

            const result = await blockchainService.verifyIdentity(address);

            res.json({
                success: true,
                data: {
                    address,
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber
                }
            });

        } catch (error) {
            logger.error('Verify identity error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify identity',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async getAllIdentities(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;

            const result = await blockchainService.getAllIdentities(page, limit);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Get all identities error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve identities',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async checkIdentityStatus(req, res) {
        try {
            const { address } = req.params;

            if (!address || !ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Ethereum address'
                });
            }

            const exists = await blockchainService.checkIdentityExists(address);
            if (!exists) {
                return res.json({
                    success: true,
                    data: {
                        exists: false,
                        status: 'NOT_FOUND'
                    }
                });
            }

            const identity = await blockchainService.getIdentity(address);

            res.json({
                success: true,
                data: {
                    exists: true,
                    status: identity.isVerified ? 'VERIFIED' : 'UNVERIFIED',
                    creationDate: identity.creationDate
                }
            });

        } catch (error) {
            logger.error('Check identity status error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to check identity status',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = IdentityController;
