// backend/src/utils/blockchain.js

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Helper function to load ABI safely
function loadABI(contractName) {
    try {
        const abiPath = path.join(
            __dirname,
            `../../../artifacts/contracts/${contractName}.sol/${contractName}.json`,
        );
        if (!fs.existsSync(abiPath)) {
            throw new Error(`ABI file not found at ${abiPath}`);
        }
        const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
        if (!artifact.abi) {
            throw new Error(
                `ABI not found in artifact file for ${contractName}`,
            );
        }
        return artifact.abi;
    } catch (error) {
        logger.error(`Failed to load ABI for ${contractName}:`, error);
        throw new Error(
            `Could not load ABI for ${contractName}: ${error.message}`,
        );
    }
}

class BlockchainService {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contracts = {}; // Store all contract instances here
        // Initialization order matters: Provider first, then contracts
        this.initializeProvider();
        this.initializeContracts();
    }

    initializeProvider() {
        try {
            const rpcUrl = process.env.RPC_URL;
            const privateKey = process.env.PRIVATE_KEY;

            if (!rpcUrl) {
                throw new Error('RPC_URL not found in environment variables');
            }
            if (!privateKey) {
                throw new Error(
                    'PRIVATE_KEY not found in environment variables',
                );
            }

            this.provider = new ethers.JsonRpcProvider(rpcUrl);
            this.signer = new ethers.Wallet(privateKey, this.provider);

            logger.info(
                `Blockchain provider initialized. Connected to: ${rpcUrl}`,
            );
            // --- ADDED DEBUG LOG ---
            logger.info(
                `>>> Blockchain Service Signer Address: ${this.signer.address}`,
            );
            // --- END DEBUG LOG ---
        } catch (error) {
            logger.error(
                'FATAL: Failed to initialize blockchain provider:',
                error,
            );
            // Prevent application startup if provider fails
            process.exit(1);
        }
    }

    initializeContracts() {
        try {
            const addressesPath = path.join(
                __dirname,
                '../../../deployed-addresses.json',
            );
            if (!fs.existsSync(addressesPath)) {
                throw new Error(
                    `deployed-addresses.json not found at ${addressesPath}. Please deploy contracts first.`,
                );
            }
            const contractAddresses = JSON.parse(
                fs.readFileSync(addressesPath, 'utf8'),
            );

            // --- ADDED DEBUG LOG ---
            logger.info(
                `>>> Read deployed addresses: ${JSON.stringify(
                    contractAddresses,
                )}`,
            );
            // --- END DEBUG LOG ---

            const contractConfigs = [
                {
                    name: 'DigitalIdentityNFT',
                    addressKey: 'digitalIdentityNFT',
                },
                { name: 'ReputationSystem', addressKey: 'reputationSystem' },
                { name: 'ModeratorControl', addressKey: 'moderatorControl' },
                {
                    name: 'VerificationRegistry',
                    addressKey: 'verificationRegistry',
                },
                { name: 'MultiFactorAuth', addressKey: 'multiFactorAuth' },
                { name: 'AppealSystem', addressKey: 'appealSystem' },
            ];

            for (const config of contractConfigs) {
                const address = contractAddresses[config.addressKey];
                if (!address) {
                    // Log warning but maybe don't exit immediately unless critical?
                    logger.warn(
                        `Address for ${config.name} not found in deployed-addresses.json. Skipping initialization.`,
                    );
                    continue; // Skip this contract if address is missing
                }
                if (!ethers.isAddress(address)) {
                    logger.warn(
                        `Invalid address format for ${config.name} ('${address}') in deployed-addresses.json. Skipping initialization.`,
                    );
                    continue;
                }

                const abi = loadABI(config.name);
                this.contracts[config.name] = new ethers.Contract(
                    address,
                    abi,
                    this.signer,
                );
                logger.info(
                    `${config.name} contract initialized at address: ${address}`,
                );
            }

            // --- ADDED DEBUG LOGS ---
            if (this.contracts.ModeratorControl) {
                logger.info(
                    `>>> Initialized ModeratorControl at address: ${this.contracts.ModeratorControl.address}`,
                );
            } else {
                logger.error(
                    '>>> ModeratorControl contract instance NOT created! Check address and ABI.',
                );
            }
            if (this.contracts.DigitalIdentityNFT) {
                logger.info(
                    `>>> Initialized DigitalIdentityNFT at address: ${this.contracts.DigitalIdentityNFT.address}`,
                );
            } else {
                logger.error(
                    '>>> DigitalIdentityNFT contract instance NOT created! Check address and ABI.',
                );
            }
            // --- END DEBUG LOGS ---

            logger.info('Smart contracts initialization attempt finished.');

            // Add a check for critical contracts
            if (
                !this.contracts.ModeratorControl ||
                !this.contracts.DigitalIdentityNFT
            ) {
                throw new Error(
                    'Critical contracts (ModeratorControl, DigitalIdentityNFT) failed to initialize.',
                );
            }
        } catch (error) {
            logger.error('FATAL: Failed to initialize contracts:', error);
            // Prevent application startup if contracts fail to initialize
            process.exit(1);
        }
    }

    // --- Helper to get contract instance ---
    getContract(name) {
        const contract = this.contracts[name];
        if (!contract) {
            // This should ideally not happen if initialization checks pass
            logger.error(`Attempted to access uninitialized contract: ${name}`);
            throw new Error(
                `Contract ${name} is not initialized or failed to initialize.`,
            );
        }
        return contract;
    }

    // --- Transaction Execution Helper ---
    async executeTransaction(
        contractName,
        methodName,
        args = [],
        txOptions = {},
    ) {
        const contract = this.getContract(contractName); // Ensure contract exists first
        try {
            logger.info(
                `Executing ${contractName}.${methodName} with args: ${JSON.stringify(
                    args,
                )} from signer ${this.signer.address}`, // Log signer address
            );
            // Estimate gas before sending if needed (can help debug certain issues)
            // const gasEstimate = await contract.estimateGas[methodName](...args, txOptions);
            // logger.info(`Estimated gas: ${gasEstimate.toString()}`);
            // txOptions.gasLimit = gasEstimate.mul(12).div(10); // Add 20% buffer

            const tx = await contract[methodName](...args, txOptions);
            logger.info(`Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait(); // Wait for 1 confirmation by default
            logger.info(
                `Transaction confirmed: ${tx.hash} in block ${receipt.blockNumber}`,
            );
            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                events: receipt.events || [], // Ensure events array exists
            };
        } catch (error) {
            // Log the detailed error object from ethers
            logger.error(
                `Error executing ${contractName}.${methodName}:`,
                error,
            );
            const reason =
                error.reason ||
                (error.error ? error.error.message : error.message);
            // Rethrow a more specific error or a generic one
            throw new Error(
                `Blockchain transaction failed for ${contractName}.${methodName}: ${reason}`,
            );
        }
    }

    // --- Identity Methods ---

    async hasIdentity(address) {
        try {
            // Ensure address is valid before calling contract
            if (!ethers.isAddress(address)) {
                throw new Error(
                    `Invalid address format provided to hasIdentity: ${address}`,
                );
            }
            return await this.getContract('DigitalIdentityNFT').hasIdentity(
                address,
            );
        } catch (error) {
            logger.error(`hasIdentity check error for ${address}:`, error);
            // Avoid throwing generic error, let caller handle contract errors
            throw error;
        }
    }

    async createIdentity(address, did) {
        // ModeratorControl handles identity creation and score initialization
        return this.executeTransaction('ModeratorControl', 'createIdentity', [
            address,
            did,
        ]);
    }

    async getIdentity(address) {
        try {
            if (!ethers.isAddress(address)) {
                throw new Error(
                    `Invalid address format provided to getIdentity: ${address}`,
                );
            }
            if (!(await this.hasIdentity(address))) {
                const notFoundError = new Error(
                    `Identity does not exist for address ${address}`,
                );
                notFoundError.code = 'IDENTITY_NOT_FOUND';
                throw notFoundError;
            }
            const nftContract = this.getContract('DigitalIdentityNFT');
            const tokenId = await nftContract.addressToTokenId(address);
            if (!tokenId || tokenId.toString() === '0') {
                throw new Error(
                    `Token ID not found for user ${address} despite hasIdentity being true.`,
                );
            }
            const identity = await nftContract.identities(tokenId); // The struct from contract
            const owner = await nftContract.ownerOf(tokenId);

            if (owner.toLowerCase() !== address.toLowerCase()) {
                logger.warn(
                    `Owner mismatch for token ${tokenId}. Expected ${address}, got ${owner}`,
                );
                throw new Error(`Identity owner mismatch for token ${tokenId}`);
            }

            // --- FIX: Convert potential BigInts in the returned object ---
            return {
                tokenId: tokenId.toString(), // String
                owner: owner, // String (address)
                did: identity.did, // String
                creationDate: identity.creationDate.toString(), // String
                lastUpdate: identity.lastUpdate.toString(), // String
                // Explicitly convert enum index to Number
                verificationLevel: Number(identity.verificationLevel),
                isRecoverable: identity.isRecoverable, // Boolean
                recoveryAddress: identity.recoveryAddress, // String (address)
                // Convert timestamp to String (or Number if safe)
                lastVerificationDate: identity.lastVerificationDate.toString(),
            };
            // --- End Fix ---
        } catch (error) {
            logger.error(`Get identity error for ${address}:`, error);
            throw error;
        }
    }

    /**
     * Retrieves the token URI for a given address's NFT
     * @param {string} address - Ethereum address
     * @returns {Promise<string>} The token URI
     */
    async getTokenURI(address) {
        try {
            if (!ethers.isAddress(address)) {
                throw new Error(
                    `Invalid address format provided to getTokenURI: ${address}`,
                );
            }

            if (!(await this.hasIdentity(address))) {
                const notFoundError = new Error(
                    `Identity does not exist for address ${address}`,
                );
                notFoundError.code = 'IDENTITY_NOT_FOUND';
                throw notFoundError;
            }

            const nftContract = this.getContract('DigitalIdentityNFT');
            const tokenId = await nftContract.addressToTokenId(address);

            if (!tokenId || tokenId.toString() === '0') {
                throw new Error(
                    `Token ID not found for user ${address} despite hasIdentity being true.`,
                );
            }

            // Call the tokenURI function
            logger.info(`Fetching tokenURI for token ID ${tokenId.toString()}`);
            const tokenURI = await nftContract.tokenURI(tokenId);

            // Validate the tokenURI format
            if (!tokenURI) {
                throw new Error(
                    `Empty tokenURI returned for token ID ${tokenId.toString()}`,
                );
            }

            if (!tokenURI.startsWith('data:application/json;base64,')) {
                logger.warn(
                    `TokenURI for ${address} has unexpected format: ${tokenURI.substring(
                        0,
                        50,
                    )}...`,
                );
            }

            // Generate a fallback URI if needed
            if (!tokenURI.startsWith('data:application/json;base64,')) {
                // Get basic identity info to construct a minimal valid tokenURI
                const identity = await this.getIdentity(address);
                const fallbackJson = {
                    name: `Digital Identity #${tokenId}`,
                    description: 'Blockchain-based Digital Identity NFT',
                    image: `data:image/svg+xml,${encodeURIComponent(
                        `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">
                            <rect width="100%" height="100%" fill="#f9f9f9" />
                            <rect x="20" y="20" width="310" height="310" rx="15" fill="white" stroke="#333333" stroke-width="2" />
                            <text x="175" y="100" font-family="Arial" font-size="20" fill="#333333" text-anchor="middle">
                                Digital Identity
                            </text>
                            <text x="175" y="150" font-family="Arial" font-size="14" fill="#666666" text-anchor="middle">
                                ID: ${tokenId}
                            </text>
                            <text x="175" y="180" font-family="Arial" font-size="14" fill="#666666" text-anchor="middle">
                                DID: ${identity.did}
                            </text>
                            <text x="175" y="250" font-family="Arial" font-size="12" fill="#333333" text-anchor="middle">
                                Owner: ${identity.owner}
                            </text>
                        </svg>`,
                    )}`,
                    attributes: [
                        { trait_type: 'DID', value: identity.did },
                        { trait_type: 'Token ID', value: tokenId.toString() },
                        { trait_type: 'Owner', value: identity.owner },
                    ],
                };

                return `data:application/json;base64,${Buffer.from(
                    JSON.stringify(fallbackJson),
                ).toString('base64')}`;
            }

            return tokenURI;
        } catch (error) {
            logger.error(
                `Get token URI error for ${address}: ${error.message}`,
            );
            throw error;
        }
    }

    async approveIdentityVerification(address, level) {
        // ModeratorControl handles calling the NFT contract's verification
        return this.executeTransaction(
            'ModeratorControl',
            'approveIdentityVerification',
            [address, level], // level should be the enum index (0-3)
        );
    }

    async getAllIdentities(page = 1, limit = 10) {
        try {
            const nftContract = this.getContract('DigitalIdentityNFT');
            const currentTokenIdBigNum = await nftContract.getCurrentTokenId();
            const totalItems = parseInt(currentTokenIdBigNum.toString());

            if (totalItems === 0) {
                return {
                    identities: [],
                    pagination: {
                        totalItems: 0,
                        totalPages: 0,
                        currentPage: 1,
                        pageSize: limit,
                    },
                };
            }

            const totalPages = Math.ceil(totalItems / limit);
            const currentPage = Math.max(1, Math.min(page, totalPages));
            const startIndex = (currentPage - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalItems);

            const identities = [];
            for (let i = startIndex; i < endIndex; i++) {
                const tokenId = i + 1;
                try {
                    const owner = await nftContract.ownerOf(tokenId);
                    const identity = await nftContract.identities(tokenId); // identity struct

                    // --- FIX: Explicitly convert potential BigInts ---
                    identities.push({
                        tokenId: tokenId.toString(), // Already string
                        owner: owner, // Already string (address)
                        did: identity.did, // Already string
                        // Convert enum index (potentially BigInt) to Number
                        verificationLevel: Number(identity.verificationLevel),
                        creationDate: identity.creationDate.toString(), // Already string
                        lastUpdate: identity.lastUpdate.toString(), // Already string
                    });
                    // --- End Fix ---
                } catch (err) {
                    logger.warn(
                        `Could not fetch details for token ID ${tokenId}: ${err.message}`,
                    );
                }
            }

            // The pagination object uses standard numbers, which are fine for JSON
            return {
                identities, // Array of objects with converted values
                pagination: {
                    totalItems,
                    totalPages,
                    currentPage: currentPage,
                    pageSize: limit,
                },
            };
        } catch (error) {
            logger.error('Get all identities error:', error);
            throw new Error(`Failed to get all identities: ${error.message}`);
        }
    }

    // --- Reputation Methods ---

    async getUserReputation(userAddress) {
        try {
            if (!ethers.isAddress(userAddress)) {
                throw new Error(
                    `Invalid address format provided to getUserReputation: ${userAddress}`,
                );
            }
            // ModeratorControl provides a view function for this
            const status = await this.getContract(
                'ModeratorControl',
            ).getUserReputationStatus(userAddress);
            return {
                score: status[0].toString(),
                isBanned: status[1],
                lastUpdate: status[2].toString(),
            };
        } catch (error) {
            logger.error(`Get reputation error for ${userAddress}:`, error);
            throw error;
        }
    }

    async updateUserReputation(address, points) {
        // ModeratorControl handles reputation updates initiated by moderators
        return this.executeTransaction(
            'ModeratorControl',
            'updateUserReputation',
            [address, points],
        );
    }

    // --- Moderation Methods ---

    async createModerationCase(address, actionType, reason) {
        return this.executeTransaction(
            'ModeratorControl',
            'createModerationCase',
            [address, actionType, reason],
        );
    }

    async getModerationCaseDetails(caseId) {
        try {
            // Validate caseId format if necessary (e.g., ensure it's a non-negative integer string/number)
            const details = await this.getContract(
                'ModeratorControl',
            ).getCaseDetails(caseId);
            return {
                user: details[0],
                actionType: details[1], // Returns enum index
                reason: details[2],
                timestamp: details[3].toString(),
                moderator: details[4],
                isResolved: details[5],
            };
        } catch (error) {
            logger.error(`Get case details error for ID ${caseId}:`, error);
            throw error; // Let controller handle (e.g., case not found)
        }
    }

    async getUserModerationCases(userAddress) {
        try {
            if (!ethers.isAddress(userAddress)) {
                throw new Error(
                    `Invalid address format provided to getUserModerationCases: ${userAddress}`,
                );
            }
            const caseIds = await this.getContract(
                'ModeratorControl',
            ).getUserCases(userAddress);
            // Convert BigNumbers to strings/numbers if necessary
            return caseIds.map((id) => id.toString());
        } catch (error) {
            logger.error(`Get user cases error for ${userAddress}:`, error);
            throw error;
        }
    }

    async getTotalModerationCases() {
        try {
            const count = await this.getContract(
                'ModeratorControl',
            ).getTotalCases();
            return count.toString();
        } catch (error) {
            logger.error('Get total cases error:', error);
            throw error;
        }
    }

    // --- Verification Registry Methods ---

    async verifyWithRegistry(user, verificationType, metadata, signature) {
        // Requires VERIFIER_ROLE on VerificationRegistry
        return this.executeTransaction('VerificationRegistry', 'verify', [
            user,
            verificationType,
            metadata,
            signature,
        ]);
    }

    async setupRecovery(recoveryContacts, minConfirmations, timelock) {
        // IMPORTANT: This must be called by the user themselves (signer = user)
        // The backend signer (unless it IS the user) cannot set up recovery for another user.
        logger.warn(
            'setupRecovery called from backend service - ensure signer is the intended user!',
        );
        return this.executeTransaction(
            'VerificationRegistry',
            'setupRecovery',
            [recoveryContacts, minConfirmations, timelock],
        );
    }

    async initiateRecovery(oldAddress, newAddress) {
        // Requires RECOVERY_AGENT_ROLE on VerificationRegistry
        return this.executeTransaction(
            'VerificationRegistry',
            'initiateRecovery',
            [oldAddress, newAddress],
        );
    }

    async confirmRecovery(requestId) {
        // IMPORTANT: Must be called by a recovery contact for the user.
        // Backend signer likely cannot call this unless it's a designated contact.
        logger.warn(
            'confirmRecovery called from backend service - ensure signer is a valid recovery contact for the request!',
        );
        return this.executeTransaction(
            'VerificationRegistry',
            'confirmRecovery',
            [requestId],
        );
    }

    async getVerificationStatus(user, verificationType) {
        try {
            if (!ethers.isAddress(user)) {
                throw new Error(
                    `Invalid address format provided to getVerificationStatus: ${user}`,
                );
            }
            // Add check for valid verificationType enum index if needed
            const status = await this.getContract(
                'VerificationRegistry',
            ).verifications(user, verificationType); // Direct mapping access
            return {
                isVerified: status.isVerified,
                timestamp: status.timestamp.toString(),
                verifier: status.verifier,
                metadata: status.metadata,
            };
        } catch (error) {
            logger.error(
                `Get verification status error for ${user}, type ${verificationType}:`,
                error,
            );
            throw error;
        }
    }

    // --- Multi-Factor Auth Methods ---
    // IMPORTANT: Most MFA methods should be called by the user, not the backend signer.
    // The backend might facilitate by preparing data, but the final transaction
    // often needs the user's signature unless the backend acts as a trusted MFA verifier.

    async enableMFA(factors) {
        logger.warn(
            'enableMFA called from backend service - ensure signer is the intended user!',
        );
        return this.executeTransaction('MultiFactorAuth', 'enableMFA', [
            factors,
        ]);
    }

    async startAuthSession() {
        logger.warn(
            'startAuthSession called from backend service - ensure signer is the intended user!',
        );
        return this.executeTransaction('MultiFactorAuth', 'startAuthSession');
    }

    async verifyMFACtor(factor, challenge, signature) {
        // This might be called by the backend if it acts as the verifier role holder
        // OR it might need to be called by the user. Clarify contract role requirements.
        // Assuming backend has MFA_VERIFIER_ROLE for now.
        return this.executeTransaction('MultiFactorAuth', 'verifyFactor', [
            factor,
            challenge,
            signature,
        ]);
    }

    async addMFACtor(factor) {
        logger.warn(
            'addMFACtor called from backend service - ensure signer is the intended user!',
        );
        return this.executeTransaction('MultiFactorAuth', 'addFactor', [
            factor,
        ]);
    }

    async removeMFACtor(factor) {
        logger.warn(
            'removeMFACtor called from backend service - ensure signer is the intended user!',
        );
        return this.executeTransaction('MultiFactorAuth', 'removeFactor', [
            factor,
        ]);
    }

    async disableMFA() {
        logger.warn(
            'disableMFA called from backend service - ensure signer is the intended user!',
        );
        return this.executeTransaction('MultiFactorAuth', 'disableMFA');
    }

    async getEnabledMFAFactors(user) {
        try {
            if (!ethers.isAddress(user)) {
                throw new Error(
                    `Invalid address format provided to getEnabledMFAFactors: ${user}`,
                );
            }
            // Assuming getEnabledFactors is the correct view function name
            return await this.getContract('MultiFactorAuth').getEnabledFactors(
                user,
            );
        } catch (error) {
            logger.error(`Get enabled MFA factors error for ${user}:`, error);
            throw error;
        }
    }

    // --- Appeal System Methods ---

    async submitAppeal(reason, evidence, caseId) {
        // IMPORTANT: Must be called by the user themselves.
        logger.warn(
            'submitAppeal called from backend service - ensure signer is the intended user!',
        );
        return this.executeTransaction('AppealSystem', 'submitAppeal', [
            reason,
            evidence,
            caseId,
        ]);
    }

    async reviewAppeal(user, appealIndex, approved, notes) {
        // Requires APPEAL_REVIEWER_ROLE on AppealSystem
        return this.executeTransaction('AppealSystem', 'reviewAppeal', [
            user,
            appealIndex,
            approved,
            notes,
        ]);
    }

    async getAppealDetails(user, appealIndex) {
        try {
            if (!ethers.isAddress(user)) {
                throw new Error(
                    `Invalid address format provided to getAppealDetails: ${user}`,
                );
            }
            // Validate appealIndex if needed
            const appeal = await this.getContract(
                'AppealSystem',
            ).getAppealDetails(user, appealIndex);
            // Convert relevant fields from the struct
            return {
                user: appeal.user,
                reason: appeal.reason,
                evidence: appeal.evidence, // Be mindful of returning large strings
                timestamp: appeal.timestamp.toString(),
                status: appeal.status, // Enum index
                reviewer: appeal.reviewer,
                reviewNotes: appeal.reviewNotes,
                reviewTimestamp: appeal.reviewTimestamp.toString(),
                caseId: appeal.caseId.toString(),
                appealDeadline: appeal.appealDeadline.toString(),
            };
        } catch (error) {
            logger.error(
                `Get appeal details error for user ${user}, index ${appealIndex}:`,
                error,
            );
            throw error;
        }
    }

    async getUserAppealsCount(user) {
        try {
            if (!ethers.isAddress(user)) {
                throw new Error(
                    `Invalid address format provided to getUserAppealsCount: ${user}`,
                );
            }
            const count = await this.getContract(
                'AppealSystem',
            ).getUserAppealsCount(user);
            return count.toString();
        } catch (error) {
            logger.error(`Get user appeals count error for ${user}:`, error);
            throw error;
        }
    }
}

// Export a singleton instance
module.exports = new BlockchainService();
