// backend/src/controllers/moderation.controller.js
const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ValidationError, AppError } = require('../middleware/error.middleware');
const { ethers } = require('ethers');

// Maps ActionType enum index to string representation
const mapActionType = (index) => {
    const types = [
        'WARNING',
        'RESTRICTION',
        'SEVERE_RESTRICTION',
        'BAN',
        'UNBAN',
    ];
    return types[index] || 'UNKNOWN';
};

exports.createCase = async (req, res, next) => {
    // Add next
    try {
        const { address, actionType, reason } = req.body;

        // --- Validation ---
        if (!address || !ethers.isAddress(address)) {
            throw new ValidationError('Invalid or missing Ethereum address');
        }
        if (
            actionType === undefined ||
            typeof actionType !== 'number' ||
            !Number.isInteger(actionType) ||
            actionType < 0 ||
            actionType > 3
        ) {
            // Only allow 0-3 for creation
            throw new ValidationError(
                'Invalid or missing actionType (must be an integer 0-3)',
            );
        }
        if (
            !reason ||
            typeof reason !== 'string' ||
            reason.trim().length === 0 ||
            reason.length > 500
        ) {
            throw new ValidationError(
                'Invalid or missing reason (must be a non-empty string, max 500 chars)',
            );
        }
        // --- End Validation ---

        logger.info(
            `Attempting to create moderation case for ${address}, type ${actionType}, reason: ${reason}`,
        );

        // --- FIX: Use executeTransaction ---
        const result = await blockchainService.executeTransaction(
            'ModeratorControl',
            'createModerationCase',
            [address, actionType, reason],
        );
        // --- End Fix ---

        // Find the CaseCreated event to get the caseId (optional but good)
        let caseId = 'N/A';
        const createdEvent = result.events?.find(
            (e) => e.event === 'CaseCreated',
        );
        if (createdEvent && createdEvent.args) {
            caseId = createdEvent.args.caseId.toString();
            logger.info(
                `Moderation case ${caseId} created successfully. Tx: ${result.transactionHash}`,
            );
        } else {
            logger.warn(
                `CaseCreated event not found or args missing in tx ${result.transactionHash}`,
            );
        }

        res.status(201).json({
            // Use 201 for resource creation
            success: true,
            message: 'Moderation case created successfully.',
            data: {
                caseId,
                address,
                actionType: mapActionType(actionType), // Return string representation
                reason,
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
            },
        });
    } catch (error) {
        logger.error(
            `Create moderation case controller error: ${error.message}`,
        );
        next(error); // Pass to central error handler
    }
};

exports.getCases = async (req, res, next) => {
    // Add next
    try {
        // Optional: Add pagination later if needed
        logger.info('Fetching all moderation cases...');

        // --- FIX: Use service methods ---
        const totalCasesString =
            await blockchainService.getTotalModerationCases();
        const totalCases = parseInt(totalCasesString);
        // --- End Fix ---

        const cases = [];
        // Iterate carefully, case IDs are 0 to totalCases-1
        for (let i = 0; i < totalCases; i++) {
            try {
                // --- FIX: Use service methods ---
                const caseDetails =
                    await blockchainService.getModerationCaseDetails(i);
                // --- End Fix ---
                cases.push({
                    id: i, // Case ID is the index
                    user: caseDetails.user,
                    actionType: mapActionType(caseDetails.actionType), // Map enum index to string
                    reason: caseDetails.reason,
                    timestamp: caseDetails.timestamp, // Already string from service
                    moderator: caseDetails.moderator,
                    isResolved: caseDetails.isResolved,
                });
            } catch (loopError) {
                logger.error(
                    `Error fetching details for case ID ${i}: ${loopError.message}`,
                );
                // Decide whether to skip or halt on error fetching one case
                // cases.push({ id: i, error: 'Failed to fetch details' }); // Option: include error marker
            }
        }

        logger.info(`Successfully fetched ${cases.length} moderation cases.`);
        res.json({
            success: true,
            data: cases,
            total: totalCases, // Include total count
        });
    } catch (error) {
        logger.error(
            `Get all moderation cases controller error: ${error.message}`,
        );
        next(error); // Pass to central error handler
    }
};

exports.getCaseById = async (req, res, next) => {
    // Add next
    try {
        const { id } = req.params;
        const caseId = parseInt(id); // Ensure it's a number

        // --- Validation ---
        if (isNaN(caseId) || caseId < 0) {
            throw new ValidationError(
                'Invalid Case ID provided in URL parameter',
            );
        }
        // --- End Validation ---

        logger.info(`Fetching details for moderation case ID: ${caseId}`);

        const caseDetails = await blockchainService.getModerationCaseDetails(
            caseId,
        );

        // --- FIX: Use ethers.ZeroAddress (v6) ---
        // Check if user is zero address (might indicate case doesn't exist if contract doesn't revert)
        if (!caseDetails || caseDetails.user === ethers.ZeroAddress) {
            throw new NotFoundError(
                `Case with ID ${caseId} not found or invalid.`,
            ); // Use NotFoundError
        }
        // --- End Fix ---

        res.json({
            success: true,
            data: {
                id: caseId,
                user: caseDetails.user,
                actionType: mapActionType(caseDetails.actionType), // Map enum index to string
                reason: caseDetails.reason,
                timestamp: caseDetails.timestamp, // Already string from service
                moderator: caseDetails.moderator,
                isResolved: caseDetails.isResolved,
            },
        });
    } catch (error) {
        logger.error(
            `Get moderation case by ID controller error: ${error.message}`,
        );
        // Handle specific errors like case not found if service throws them
        if (
            error.message.includes('Case ID out of bounds') ||
            error instanceof NotFoundError
        ) {
            next(new NotFoundError(`Case with ID ${req.params.id} not found.`)); // Pass NotFoundError
        } else {
            next(error); // Pass other errors to central handler
        }
    }
};
