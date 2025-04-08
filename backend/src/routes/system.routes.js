// backend/src/routes/system.routes.js
const express = require('express');
const router = express.Router();
const blockchainService = require('../utils/blockchain'); // Assuming direct use here
const logger = require('../utils/logger'); // Import logger
const { AppError } = require('../middleware/error.middleware'); // Import error handler if needed

// Health check including blockchain connection
router.get('/health', async (req, res, next) => {
    // Add next
    try {
        // Check blockchain connection by getting block number
        const blockNumber = await blockchainService.provider.getBlockNumber();
        logger.info(`System health check: OK, current block: ${blockNumber}`);
        res.json({
            status: 'healthy',
            blockchain: 'connected',
            currentBlock: blockNumber,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        logger.error(`System health check failed: ${error.message}`);
        // Use AppError for consistent error response via middleware
        next(
            new AppError(
                'System unhealthy: Cannot connect to blockchain',
                503,
                'BLOCKCHAIN_UNAVAILABLE',
            ),
        );
    }
});

// System statistics
router.get('/stats', async (req, res, next) => {
    // Add next
    try {
        logger.info('Fetching system statistics...');

        // --- FIX: Access contracts correctly and use correct functions ---
        // Get total identities using the dedicated function
        const identityContract =
            blockchainService.getContract('DigitalIdentityNFT');
        const currentTokenId = await identityContract.getCurrentTokenId(); // Returns BigInt

        // Get total moderation cases using the service method
        const totalCases = await blockchainService.getTotalModerationCases(); // Returns String
        // --- End Fix ---

        logger.info(
            `Stats fetched: Identities=${currentTokenId.toString()}, Cases=${totalCases}`,
        );

        res.json({
            success: true,
            data: {
                // Convert BigInt to string for JSON compatibility
                totalIdentitiesMinted: currentTokenId.toString(),
                totalModerationCases: totalCases, // Already a string from service
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        logger.error(`Get system stats failed: ${error.message}`);
        next(error); // Pass error to central handler
    }
});

module.exports = router;
