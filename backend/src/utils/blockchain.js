const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class BlockchainService {
    constructor() {
        this.initializeProvider();
        this.initializeContracts();
    }

    initializeProvider() {
        try {
            this.provider = new ethers.JsonRpcProvider(
                process.env.RPC_URL || 'http://localhost:8545'
            );
            
            if (!process.env.PRIVATE_KEY) {
                throw new Error('PRIVATE_KEY not found in environment variables');
            }

            this.signer = new ethers.Wallet(
                process.env.PRIVATE_KEY,
                this.provider
            );

            logger.info('Blockchain provider initialized');
            logger.info(`Connected to network: ${this.provider.network}`);
        } catch (error) {
            logger.error('Failed to initialize blockchain provider:', error);
            throw new Error(`Provider initialization failed: ${error.message}`);
        }
    }

    initializeContracts() {
        try {
            const contractAddresses = JSON.parse(
                fs.readFileSync(path.join(__dirname, '../../../deployed-addresses.json'))
            );

            const DigitalIdentityNFT = require('../../../artifacts/contracts/DigitalIdentityNFT.sol/DigitalIdentityNFT.json');
            const ReputationSystem = require('../../../artifacts/contracts/ReputationSystem.sol/ReputationSystem.json');
            const ModeratorControl = require('../../../artifacts/contracts/ModeratorControl.sol/ModeratorControl.json');

            this.digitalIdentityNFT = new ethers.Contract(
                contractAddresses.digitalIdentityNFT,
                DigitalIdentityNFT.abi,
                this.signer
            );

            this.reputationSystem = new ethers.Contract(
                contractAddresses.reputationSystem,
                ReputationSystem.abi,
                this.signer
            );

            this.moderatorControl = new ethers.Contract(
                contractAddresses.moderatorControl,
                ModeratorControl.abi,
                this.signer
            );

            logger.info('Smart contracts initialized');
            logger.info('Contract addresses:', contractAddresses);
        } catch (error) {
            logger.error('Failed to initialize contracts:', error);
            throw new Error(`Contract initialization failed: ${error.message}`);
        }
    }

    async checkIdentityExists(address) {
        try {
            return await this.digitalIdentityNFT.checkIdentityExists(address);
        } catch (error) {
            logger.error('Check identity exists error:', error);
            throw new Error(`Failed to check identity existence: ${error.message}`);
        }
    }

    async createIdentity(address, did) {
        try {
            const hasIdentity = await this.checkIdentityExists(address);
            if (hasIdentity) {
                throw new Error('Identity already exists for this address');
            }

            const tx = await this.moderatorControl.createIdentity(address, did);
            const receipt = await tx.wait();

            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            logger.error('Create identity error:', error);
            throw new Error(`Failed to create identity: ${error.message}`);
        }
    }

    async getIdentity(address) {
        try {
            const hasIdentity = await this.checkIdentityExists(address);
            if (!hasIdentity) {
                throw new Error('Identity does not exist');
            }

            const tokenId = await this.digitalIdentityNFT.getTokenId(address);
            const identity = await this.digitalIdentityNFT.identities(tokenId);

            return {
                did: identity.did,
                isVerified: identity.isVerified,
                creationDate: identity.creationDate.toString(),
                tokenId: tokenId.toString()
            };
        } catch (error) {
            logger.error('Get identity error:', error);
            throw new Error(`Failed to get identity: ${error.message}`);
        }
    }

    async verifyIdentity(address) {
        try {
            const tx = await this.moderatorControl.verifyIdentity(address);
            const receipt = await tx.wait();

            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            logger.error('Verify identity error:', error);
            throw new Error(`Failed to verify identity: ${error.message}`);
        }
    }

    async getAllIdentities(page, limit) {
        try {
            const totalSupply = await this.digitalIdentityNFT.totalSupply();
            const startIndex = (page - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalSupply);
            
            const identities = [];
            for (let i = startIndex; i < endIndex; i++) {
                const tokenId = i + 1; // Assuming token IDs start from 1
                const identity = await this.digitalIdentityNFT.identities(tokenId);
                const owner = await this.digitalIdentityNFT.ownerOf(tokenId);
                
                identities.push({
                    tokenId: tokenId.toString(),
                    owner,
                    did: identity.did,
                    isVerified: identity.isVerified,
                    creationDate: identity.creationDate.toString()
                });
            }

            return {
                identities,
                total: totalSupply.toString(),
                page,
                limit,
                pages: Math.ceil(totalSupply / limit)
            };
        } catch (error) {
            logger.error('Get all identities error:', error);
            throw new Error(`Failed to get all identities: ${error.message}`);
        }
    }

        async getUserReputation(userAddress) {
        try {
            logger.info(`Getting reputation for address: ${userAddress}`);

            const status = await this.moderatorControl.getUserReputationStatus(userAddress);
            return {
                score: status[0].toString(),
                isBanned: status[1],
                lastUpdate: status[2].toString()
            };
        } catch (error) {
            logger.error('Get reputation error:', error);
            throw new Error(`Failed to get reputation: ${error.message}`);
        }
    }
}

module.exports = new BlockchainService();
