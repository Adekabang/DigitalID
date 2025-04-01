const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ethers } = require('ethers');

class IdentityController {
    /**
     * Create a new digital identity
     */
    async createIdentity(req, res) {
        try {
            const { address, did } = req.body;

            // Input validation
            if (!address || !did) {
                return res.status(400).json({
                    success: false,
                    error: 'Address and DID are required'
                });
            }

            // Validate Ethereum address
            if (!ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Ethereum address'
                });
            }

            // Validate DID format
            if (!this.isValidDID(did)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid DID format'
                });
            }

            // Check if identity already exists
            const hasIdentity = await blockchainService.digitalIdentityNFT.hasIdentity(address);
            if (hasIdentity) {
                return res.status(409).json({
                    success: false,
                    error: 'Identity already exists for this address'
                });
            }

            logger.info(`Creating identity for address: ${address} with DID: ${did}`);

            // Create identity
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

    /**
     * Get identity information
     */
    async getIdentity(req, res) {
        try {
            const { address } = req.params;

            // Validate address
            if (!address || !ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Ethereum address'
                });
            }

            logger.info(`Retrieving identity for address: ${address}`);

            // Get identity details
            const identity = await blockchainService.getIdentity(address);

            res.json({
                success: true,
                data: identity
            });

        } catch (error) {
            logger.error('Get identity error:', error);
            
            // Handle specific error cases
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

    /**
     * Verify an identity
     */
    async verifyIdentity(req, res) {
        try {
        const { address } = req.body;
        
        if (!address) {
            return res.status(400).json({ 
                error: 'Address is required' 
            });
        }

        // Check if identity exists first
        const hasIdentity = await blockchainService.digitalIdentityNFT.hasIdentity(address);
        if (!hasIdentity) {
            return res.status(404).json({ 
                error: 'Identity not found for this address' 
            });
        }

        // Get current verification status
        const identity = await blockchainService.getIdentity(address);
        if (identity.isVerified) {
            return res.status(400).json({ 
                error: 'Identity is already verified' 
            });
        }

        // Verify the identity
        const result = await blockchainService.verifyIdentity(address);
        
        res.json({
            success: true,
            transactionHash: result.transactionHash,
            address: address,
            message: 'Identity verified successfully'
        });
    } catch (error) {
        console.error('Verify Identity Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to verify identity',
            details: error.message 
        });
    }
    }

    /**
     * Update identity information
     */
    async updateIdentity(req, res) {
        try {
            const { address, newDID } = req.body;

            // Validate inputs
            if (!address || !newDID || !ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid input parameters'
                });
            }

            // Validate DID format
            if (!this.isValidDID(newDID)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid DID format'
                });
            }

            // Check ownership
            const identity = await blockchainService.getIdentity(address);
            if (!identity.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Identity not found'
                });
            }

            logger.info(`Updating identity for address: ${address} with new DID: ${newDID}`);

            // Update identity (implement this method in your smart contract)
            const tx = await blockchainService.digitalIdentityNFT.updateIdentity(address, newDID);
            const receipt = await tx.wait();

            logger.info(`Identity updated successfully: ${tx.hash}`);

            res.json({
                success: true,
                data: {
                    address,
                    newDID,
                    transactionHash: tx.hash,
                    blockNumber: receipt.blockNumber
                }
            });

        } catch (error) {
            logger.error('Update identity error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update identity',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    /**
     * Get all identities (paginated)
     */
    async getAllIdentities(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;

            logger.info(`Retrieving identities - page: ${page}, limit: ${limit}`);

            const totalIdentities = await blockchainService.digitalIdentityNFT.totalSupply();
            const startIndex = (page - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalIdentities);

            const identities = [];
            for (let i = startIndex; i < endIndex; i++) {
                const tokenId = await blockchainService.digitalIdentityNFT.tokenByIndex(i);
                const owner = await blockchainService.digitalIdentityNFT.ownerOf(tokenId);
                const identity = await blockchainService.getIdentity(owner);
                identities.push({ ...identity, owner });
            }

            res.json({
                success: true,
                data: {
                    identities,
                    pagination: {
                        total: totalIdentities.toString(),
                        page,
                        limit,
                        pages: Math.ceil(totalIdentities / limit)
                    }
                }
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

    /**
     * Validate DID format
     */
    isValidDID(did) {
        // Basic DID format validation
        const didRegex = /^did:[a-zA-Z0-9]+:.+/;
        return didRegex.test(did);
    }

    /**
     * Check identity status
     */
    async checkIdentityStatus(req, res) {
        try {
            const { address } = req.params;

            if (!address || !ethers.isAddress(address)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Ethereum address'
                });
            }

            const hasIdentity = await blockchainService.digitalIdentityNFT.hasIdentity(address);
            if (!hasIdentity) {
                return res.json({
                    success: true,
                    data: {
                        exists: false,
                        status: 'NOT_FOUND'
                    }
                });
            }

            const identity = await blockchainService.getIdentity(address);
            const reputation = await blockchainService.getUserReputation(address);

            res.json({
                success: true,
                data: {
                    exists: true,
                    status: identity.isVerified ? 'VERIFIED' : 'UNVERIFIED',
                    reputation: {
                        score: reputation.score,
                        isBanned: reputation.isBanned
                    },
                    lastUpdate: identity.creationDate
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

// Export a singleton instance
module.exports = new IdentityController();
