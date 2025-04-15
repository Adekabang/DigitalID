// backend/src/routes/system.routes.js
const express = require('express');
const router = express.Router();
const blockchainService = require('../utils/blockchain');
const logger = require('../utils/logger');
const { AppError, ValidationError } = require('../middleware/error.middleware');
const { authMiddleware, requireRoles } = require('../middleware/auth.middleware');
const apiKeyService = require('../utils/apikey.service');

// Health check including blockchain connection
router.get('/health', async (req, res, next) => {
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
    try {
        logger.info('Fetching system statistics...');

        // Get total identities using the dedicated function
        const identityContract =
            blockchainService.getContract('DigitalIdentityNFT');
        const currentTokenId = await identityContract.getCurrentTokenId();

        // Get total moderation cases using the service method
        const totalCases = await blockchainService.getTotalModerationCases();

        logger.info(
            `Stats fetched: Identities=${currentTokenId.toString()}, Cases=${totalCases}`,
        );

        res.json({
            success: true,
            data: {
                totalIdentitiesMinted: currentTokenId.toString(),
                totalModerationCases: totalCases,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        logger.error(`Get system stats failed: ${error.message}`);
        next(error);
    }
});

/**
 * @route POST /api/system/apikeys
 * @description Generate a new API key
 * @access Private (admin only)
 */
router.post('/apikeys', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { clientId, clientName, permissions, expiresIn, rateLimit } = req.body;
        
        if (!clientId || !clientName) {
            throw new ValidationError('Client ID and name are required');
        }
        
        // Set options
        const options = {};
        
        // Set expiration if provided (milliseconds)
        if (expiresIn) {
            options.expiresIn = expiresIn;
        }
        
        // Set rate limit if provided
        if (rateLimit) {
            options.rateLimit = rateLimit;
        }
        
        // Generate a new API key
        const apiKey = apiKeyService.generateApiKey(
            clientId, 
            clientName, 
            permissions || [],
            options
        );
        
        res.json({
            success: true,
            data: {
                apiKey,
                clientId,
                clientName,
                permissions: permissions || [],
                createdAt: new Date().toISOString(),
                expiresAt: options.expiresIn ? new Date(Date.now() + options.expiresIn).toISOString() : null,
                rateLimit: options.rateLimit || { limit: 100, interval: 60000 }
            }
        });
    } catch (error) {
        logger.error('API key generation error:', error);
        next(error);
    }
});

/**
 * @route GET /api/system/apikeys/:clientId
 * @description Get all API keys for a client
 * @access Private (admin only)
 */
router.get('/apikeys/:clientId', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { clientId } = req.params;
        
        if (!clientId) {
            throw new ValidationError('Client ID is required');
        }
        
        // Get all API keys for the client
        const keys = apiKeyService.getClientApiKeys(clientId);
        
        res.json({
            success: true,
            data: {
                clientId,
                keys
            }
        });
    } catch (error) {
        logger.error('API key retrieval error:', error);
        next(error);
    }
});

/**
 * @route DELETE /api/system/apikeys
 * @description Deactivate an API key
 * @access Private (admin only)
 */
router.delete('/apikeys', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey) {
            throw new ValidationError('API key is required');
        }
        
        // Deactivate the API key
        const success = apiKeyService.deactivateApiKey(apiKey);
        
        if (!success) {
            throw new ValidationError('API key not found or already deactivated');
        }
        
        res.json({
            success: true,
            message: 'API key deactivated successfully'
        });
    } catch (error) {
        logger.error('API key deactivation error:', error);
        next(error);
    }
});

/**
 * @route POST /api/system/apikeys/rotate
 * @description Rotate an API key (create new, deactivate old)
 * @access Private (admin only)
 */
router.post('/apikeys/rotate', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey) {
            throw new ValidationError('API key is required');
        }
        
        // Rotate the API key
        const newKey = apiKeyService.rotateApiKey(apiKey);
        
        if (!newKey) {
            throw new ValidationError('API key not found');
        }
        
        res.json({
            success: true,
            message: 'API key rotated successfully',
            data: newKey
        });
    } catch (error) {
        logger.error('API key rotation error:', error);
        next(error);
    }
});

/**
 * @route PUT /api/system/apikeys/permissions
 * @description Update API key permissions
 * @access Private (admin only)
 */
router.put('/apikeys/permissions', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { apiKey, permissions } = req.body;
        
        if (!apiKey || !permissions) {
            throw new ValidationError('API key and permissions are required');
        }
        
        // Update API key permissions
        const success = apiKeyService.updateApiKeyPermissions(apiKey, permissions);
        
        if (!success) {
            throw new ValidationError('API key not found');
        }
        
        res.json({
            success: true,
            message: 'API key permissions updated successfully',
            data: {
                permissions
            }
        });
    } catch (error) {
        logger.error('API key permissions update error:', error);
        next(error);
    }
});

/**
 * @route PUT /api/system/apikeys/ratelimit
 * @description Update API key rate limit
 * @access Private (admin only)
 */
router.put('/apikeys/ratelimit', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { apiKey, rateLimit } = req.body;
        
        if (!apiKey || !rateLimit || !rateLimit.limit || !rateLimit.interval) {
            throw new ValidationError('API key and rate limit (limit, interval) are required');
        }
        
        // Update API key rate limit
        const success = apiKeyService.updateApiKeyRateLimit(apiKey, rateLimit);
        
        if (!success) {
            throw new ValidationError('API key not found');
        }
        
        res.json({
            success: true,
            message: 'API key rate limit updated successfully',
            data: {
                rateLimit
            }
        });
    } catch (error) {
        logger.error('API key rate limit update error:', error);
        next(error);
    }
});

/**
 * @route GET /api/system/apikeys/usage/:apiKey
 * @description Get API key usage statistics
 * @access Private (admin only)
 */
router.get('/apikeys/usage/:apiKey', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { apiKey } = req.params;
        
        if (!apiKey) {
            throw new ValidationError('API key is required');
        }
        
        // Get API key usage
        const usage = apiKeyService.getApiKeyUsage(apiKey);
        
        if (!usage) {
            throw new ValidationError('API key not found');
        }
        
        res.json({
            success: true,
            data: usage
        });
    } catch (error) {
        logger.error('API key usage retrieval error:', error);
        next(error);
    }
});

/**
 * @route GET /api/system/apikeys/logs/:clientId?
 * @description Get API key audit logs
 * @access Private (admin only)
 */
router.get('/apikeys/logs/:clientId?', authMiddleware, requireRoles(['admin']), async (req, res, next) => {
    try {
        const { clientId } = req.params;
        const { limit } = req.query;
        
        // Get API key audit logs
        const logs = apiKeyService.getApiKeyAuditLogs(clientId, limit ? parseInt(limit) : 100);
        
        res.json({
            success: true,
            data: {
                logs
            }
        });
    } catch (error) {
        logger.error('API key audit logs retrieval error:', error);
        next(error);
    }
});

/**
 * @route GET /api/system/devkey
 * @description Get a development API key (only in development environment)
 * @access Public (development only)
 */
router.get('/devkey', (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
        return res.status(403).json({
            success: false,
            error: 'This endpoint is only available in development environment'
        });
    }
    
    // Generate a development API key with 1-day expiration
    const apiKey = apiKeyService.generateApiKey(
        'dev-client-' + Date.now(),
        'Development Client',
        ['identity.read', 'reputation.read', 'authentication'],
        {
            expiresIn: 24 * 60 * 60 * 1000 // 1 day
        }
    );
    
    res.json({
        success: true,
        message: 'Development API key generated',
        data: {
            apiKey,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            note: 'This key is for development purposes only'
        }
    });
});

module.exports = router;