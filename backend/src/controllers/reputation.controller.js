// backend/src/controllers/reputation.controller.js
const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { ValidationError, AppError } = require('../middleware/error.middleware');
const { ethers } = require('ethers'); // Import ethers if needed for validation

exports.getReputation = async (req, res, next) => {
    // Add next
    try {
        const { address } = req.params;

        if (!address || !ethers.isAddress(address)) {
            throw new ValidationError(
                'Invalid Ethereum address format in URL parameter',
            );
        }

        // getReputation now throws on error
        const reputation = await blockchainService.getUserReputation(address);
        res.json({
            success: true,
            data: reputation,
        });
    } catch (error) {
        logger.error(`Get reputation controller error: ${error.message}`);
        // Handle specific errors like identity not found if getUserReputation throws them
        next(error); // Pass to central error handler
    }
};

exports.updateReputation = async (req, res, next) => {
    // Add next
    try {
        const { address, points } = req.body;

        // --- Validation ---
        if (!address || !ethers.isAddress(address)) {
            throw new ValidationError(
                'Invalid or missing Ethereum address in request body',
            );
        }
        // Ensure points is an integer (can be negative)
        if (
            points === undefined ||
            typeof points !== 'number' ||
            !Number.isInteger(points)
        ) {
            throw new ValidationError(
                'Invalid or missing points value (must be an integer)',
            );
        }
        // --- End Validation ---

        // --- FIX: Use executeTransaction ---
        // Call ModeratorControl.updateUserReputation via the service helper
        logger.info(
            `Attempting reputation update for ${address} with points ${points}`,
        );
        const result = await blockchainService.executeTransaction(
            'ModeratorControl', // Contract Name
            'updateUserReputation', // Method Name
            [address, points], // Arguments array
        );
        // --- End Fix ---

        // Fetch the updated reputation to return it
        const updatedReputation = await blockchainService.getUserReputation(
            address,
        );

        res.json({
            success: true,
            message: 'Reputation update transaction successful.',
            data: {
                transactionHash: result.transactionHash,
                blockNumber: result.blockNumber,
                updatedReputation,
            },
        });
    } catch (error) {
        logger.error(`Update reputation controller error: ${error.message}`);
        next(error); // Pass to central error handler
    }
};
