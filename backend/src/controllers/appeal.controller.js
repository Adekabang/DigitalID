// backend/src/controllers/appeal.controller.js
const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const {
    ValidationError,
    AppError,
    NotFoundError,
} = require('../middleware/error.middleware');
const { ethers } = require('ethers');

class AppealController {
    async submitAppeal(req, res, next) {
        // Handles signed appeal submission
        try {
            // --- Extract fields including signature ---
            const { userAddress, reason, evidence, caseId, signature } =
                req.body;
            const authenticatedUserAddress = req.user.address; // Address from JWT
            // --- End Extraction ---

            // --- Validation ---
            // Basic check: does the address in the body match the authenticated user?
            if (
                userAddress.toLowerCase() !==
                authenticatedUserAddress.toLowerCase()
            ) {
                throw new ValidationError(
                    'User address in body does not match authenticated user.',
                );
            }
            // Other validation already done by express-validator middleware
            // --- End Validation ---

            logger.info(
                `Attempting signed appeal submission for case ${caseId} by user ${userAddress}`,
            );

            // --- Call the modified contract function via executeTransaction ---
            // Pass all required arguments including the user address and signature
            const result = await blockchainService.executeTransaction(
                'AppealSystem',
                'submitAppeal', // Target the modified contract function
                [userAddress, reason, evidence, caseId, signature], // Pass all args
            );
            // --- End Call ---

            // Find the AppealSubmitted event to get the appealIndex
            let appealIndex = 'N/A';
            const submittedEvent = result.events?.find(
                (e) => e.event === 'AppealSubmitted',
            );
            if (submittedEvent && submittedEvent.args) {
                appealIndex = submittedEvent.args.appealIndex.toString();
                logger.info(
                    `Appeal ${appealIndex} submitted successfully for case ${caseId} by ${userAddress}. Tx: ${result.transactionHash}`,
                );
            } else {
                logger.warn(
                    `AppealSubmitted event not found or args missing in tx ${result.transactionHash}`,
                );
            }

            res.status(201).json({
                success: true,
                message: 'Appeal submitted successfully.',
                data: {
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber,
                    appealIndex: appealIndex,
                    caseId: caseId,
                },
            });
        } catch (error) {
            logger.error(`Submit appeal controller error: ${error.message}`);
            // Handle potential contract reverts
            if (
                error.message.includes('Invalid signature') ||
                error.message.includes('Signature does not match user address')
            ) {
                next(
                    new AppError(
                        'Invalid signature provided for appeal.',
                        400,
                        'INVALID_SIGNATURE',
                    ),
                );
            } else if (
                error.message.includes('No active restriction to appeal') ||
                error.message.includes('Must wait for cooldown period')
            ) {
                next(
                    new AppError(
                        error.message,
                        400,
                        'APPEAL_CONDITION_NOT_MET',
                    ),
                );
            } else {
                next(error); // Pass other errors to central handler
            }
        }
    }

    // --- getAppealStatus, getAppealHistory, confirmAppeal remain largely the same ---
    // (Ensure they use correct service methods as fixed previously)

    async getAppealStatus(req, res, next) {
        try {
            const { address, appealIndex } = req.params;
            const index = parseInt(appealIndex);

            logger.info(
                `Fetching status for appeal index ${index} for address ${address}`,
            );
            const appealDetails = await blockchainService.getAppealDetails(
                address,
                index,
            );

            if (!appealDetails || appealDetails.user === ethers.ZeroAddress) {
                throw new NotFoundError(
                    `Appeal index ${index} not found for address ${address}.`,
                );
            }

            res.json({
                success: true,
                data: { ...appealDetails },
            });
        } catch (error) {
            logger.error(
                `Get appeal status controller error: ${error.message}`,
            );
            if (
                error instanceof NotFoundError ||
                error.message.includes('Appeal does not exist')
            ) {
                next(
                    new NotFoundError(
                        `Appeal index ${req.params.appealIndex} not found for address ${req.params.address}.`,
                    ),
                );
            } else {
                next(error);
            }
        }
    }

    async getAppealHistory(req, res, next) {
        try {
            const { address } = req.params;
            const page = Math.max(1, parseInt(req.query.page) || 1);
            const limit = Math.max(
                1,
                Math.min(100, parseInt(req.query.limit) || 10),
            );

            logger.info(
                `Fetching appeal history for address ${address}, page ${page}, limit ${limit}`,
            );
            const appealsCountString =
                await blockchainService.getUserAppealsCount(address);
            const totalItems = parseInt(appealsCountString);

            const appeals = [];
            let appealsData = { appeals: [], pagination: {} };

            if (totalItems > 0) {
                const totalPages = Math.ceil(totalItems / limit);
                const currentPage = Math.min(page, totalPages);
                const startIndex = (currentPage - 1) * limit;
                const endIndex = Math.min(startIndex + limit, totalItems);

                for (let i = startIndex; i < endIndex; i++) {
                    try {
                        const appeal = await blockchainService.getAppealDetails(
                            address,
                            i,
                        );
                        if (appeal && appeal.user !== ethers.ZeroAddress) {
                            appeals.push({ index: i, ...appeal });
                        } else {
                            logger.warn(
                                `Appeal index ${i} for user ${address} returned invalid data.`,
                            );
                        }
                    } catch (loopError) {
                        logger.error(
                            `Error fetching appeal index ${i} for user ${address}: ${loopError.message}`,
                        );
                    }
                }
                appealsData.pagination = {
                    totalItems,
                    totalPages,
                    currentPage,
                    pageSize: limit,
                };
            } else {
                appealsData.pagination = {
                    totalItems: 0,
                    totalPages: 0,
                    currentPage: 1,
                    pageSize: limit,
                };
            }
            appealsData.appeals = appeals;

            res.json({
                success: true,
                data: appealsData.appeals,
                pagination: appealsData.pagination,
            });
        } catch (error) {
            logger.error(
                `Get appeal history controller error: ${error.message}`,
            );
            next(error);
        }
    }

    // Belongs elsewhere? Calls VerificationRegistry
    async confirmAppeal(req, res, next) {
        try {
            const { requestId } = req.params;
            const confirmerAddress = req.user.address;

            logger.warn(
                `Confirming recovery request ${requestId} using backend signer ${blockchainService.signer.address} - ensure this signer is a recovery contact for the request!`,
            );
            logger.info(
                `Attempting confirmation for recovery request ${requestId} by alleged confirmer ${confirmerAddress}`,
            );

            const result = await blockchainService.executeTransaction(
                'VerificationRegistry',
                'confirmRecovery',
                [requestId],
            );

            logger.info(
                `Recovery confirmation submitted for request ${requestId}. Tx: ${result.transactionHash}`,
            );
            res.json({
                success: true,
                message: 'Recovery confirmation submitted successfully.',
                data: { transactionHash: result.transactionHash, requestId },
            });
        } catch (error) {
            logger.error(`Confirm recovery controller error: ${error.message}`);
            if (
                error.message.includes('Not a recovery contact') ||
                error.message.includes('Already confirmed')
            ) {
                next(
                    new AppError(
                        error.message,
                        400,
                        'RECOVERY_CONFIRMATION_FAILED',
                    ),
                );
            } else if (error.message.includes('Recovery already executed')) {
                next(
                    new AppError(
                        error.message,
                        400,
                        'RECOVERY_ALREADY_EXECUTED',
                    ),
                );
            } else {
                next(error);
            }
        }
    }
}

module.exports = new AppealController();
