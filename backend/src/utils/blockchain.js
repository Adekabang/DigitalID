const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Load contract artifacts and addresses
const contractAddresses = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../deployed-addresses.json'))
);

const DigitalIdentityNFT = require('../../../artifacts/contracts/DigitalIdentityNFT.sol/DigitalIdentityNFT.json');
const ReputationSystem = require('../../../artifacts/contracts/ReputationSystem.sol/ReputationSystem.json');
const ModeratorControl = require('../../../artifacts/contracts/ModeratorControl.sol/ModeratorControl.json');

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
            // Initialize contract instances
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

    async verifyContractState() {
        try {
            const nftCode = await this.provider.getCode(contractAddresses.digitalIdentityNFT);
            const repCode = await this.provider.getCode(contractAddresses.reputationSystem);
            const modCode = await this.provider.getCode(contractAddresses.moderatorControl);

            return {
                digitalIdentityNFT: nftCode !== '0x',
                reputationSystem: repCode !== '0x',
                moderatorControl: modCode !== '0x'
            };
        } catch (error) {
            logger.error('Contract state verification failed:', error);
            throw new Error(`Contract verification failed: ${error.message}`);
        }
    }

    // Identity Management Methods
    async createIdentity(userAddress, did) {
        try {
            logger.info(`Creating identity for address: ${userAddress}`);

            // Check if identity exists
            const hasIdentity = await this.digitalIdentityNFT.hasIdentity(userAddress);
            if (hasIdentity) {
                throw new Error('Identity already exists for this address');
            }

            // Create identity
            const tx = await this.moderatorControl.createIdentity(userAddress, did);
            logger.info(`Identity creation transaction sent: ${tx.hash}`);

            // Wait for confirmation
            const receipt = await tx.wait();
            logger.info(`Transaction confirmed in block: ${receipt.blockNumber}`);

            // Verify creation
            const verifyHasIdentity = await this.digitalIdentityNFT.hasIdentity(userAddress);
            if (!verifyHasIdentity) {
                throw new Error('Identity creation failed verification');
            }

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


  async getIdentity(userAddress) {
    try {
        // Check existence first
        const hasIdentity = await this.digitalIdentityNFT.hasIdentity(userAddress);
        if (!hasIdentity) {
            throw new Error('Identity does not exist for this address');
        }

        // Get token ID first
        const tokenId = await this.digitalIdentityNFT.getTokenId(userAddress);
        console.log('Token ID for address:', tokenId.toString());

        // Get identity details
        const identity = await this.digitalIdentityNFT.identities(tokenId);
        return {
            did: identity.did,
            isVerified: identity.isVerified,
            creationDate: identity.creationDate.toString(),
            tokenId: tokenId.toString()
        };
    } catch (error) {
        console.error('Get identity error:', error);
        throw new Error(`Failed to get identity: ${error.message}`);
    }
}

    // Reputation Management Methods
    async updateReputation(userAddress, points) {
        try {
            logger.info(`Updating reputation for address: ${userAddress}`);

            const tx = await this.reputationSystem.updateScore(userAddress, points);
            logger.info(`Reputation update transaction sent: ${tx.hash}`);

            const receipt = await tx.wait();
            
            const updatedScore = await this.getUserReputation(userAddress);

            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                updatedScore
            };
        } catch (error) {
            logger.error('Update reputation error:', error);
            throw new Error(`Failed to update reputation: ${error.message}`);
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

    // Moderation Methods
    async createModerationCase(userAddress, actionType, reason) {
        try {
            logger.info(`Creating moderation case for address: ${userAddress}`);

            const tx = await this.moderatorControl.createModerationCase(
                userAddress,
                actionType,
                reason
            );
            logger.info(`Moderation case creation transaction sent: ${tx.hash}`);

            const receipt = await tx.wait();

            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            logger.error('Create moderation case error:', error);
            throw new Error(`Failed to create moderation case: ${error.message}`);
        }
    }

    async getModerationCases() {
        try {
            const totalCases = await this.moderatorControl.getTotalCases();
            const cases = [];

            for (let i = 0; i < totalCases; i++) {
                const caseDetails = await this.moderatorControl.getCaseDetails(i);
                cases.push({
                    id: i,
                    user: caseDetails[0],
                    actionType: caseDetails[1],
                    reason: caseDetails[2],
                    timestamp: caseDetails[3].toString(),
                    moderator: caseDetails[4],
                    isResolved: caseDetails[5]
                });
            }

            return cases;
        } catch (error) {
            logger.error('Get moderation cases error:', error);
            throw new Error(`Failed to get moderation cases: ${error.message}`);
        }
    }

    async getModerationCase(caseId) {
        try {
            const caseDetails = await this.moderatorControl.getCaseDetails(caseId);
            return {
                id: parseInt(caseId),
                user: caseDetails[0],
                actionType: caseDetails[1],
                reason: caseDetails[2],
                timestamp: caseDetails[3].toString(),
                moderator: caseDetails[4],
                isResolved: caseDetails[5]
            };
        } catch (error) {
            logger.error(`Get moderation case error for ID ${caseId}:`, error);
            throw new Error(`Failed to get moderation case: ${error.message}`);
        }
    }

    // Utility Methods
    async getBlockchainInfo() {
        try {
            const [blockNumber, network] = await Promise.all([
                this.provider.getBlockNumber(),
                this.provider.getNetwork()
            ]);

            return {
                currentBlock: blockNumber,
                network: {
                    name: network.name,
                    chainId: network.chainId
                },
                contracts: contractAddresses
            };
        } catch (error) {
            logger.error('Get blockchain info error:', error);
            throw new Error(`Failed to get blockchain info: ${error.message}`);
        }
    }

    async isContractOwner(address) {
        try {
            const owner = await this.moderatorControl.owner();
            return owner.toLowerCase() === address.toLowerCase();
        } catch (error) {
            logger.error('Check contract owner error:', error);
            throw new Error(`Failed to check contract owner: ${error.message}`);
        }
    }
 async verifyIdentity(userAddress) {
        try {
            // Check if identity exists
            const hasIdentity = await this.digitalIdentityNFT.hasIdentity(userAddress);
            if (!hasIdentity) {
                throw new Error('Identity does not exist for this address');
            }

            // Call verify function
            const tx = await this.moderatorControl.verifyIdentity(userAddress);
            console.log('Verification transaction sent:', tx.hash);

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log('Verification confirmed in block:', receipt.blockNumber);

            // Get updated identity to confirm verification
            const identity = await this.getIdentity(userAddress);
            if (!identity.isVerified) {
                throw new Error('Verification failed to update');
            }

            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            console.error('Verify identity error:', error);
            throw new Error(`Failed to verify identity: ${error.message}`);
        }
    }

}

// Export a singleton instance
module.exports = new BlockchainService();
