// backend/src/routes/system.routes.js
const express = require('express');
const router = express.Router();
const blockchainService = require('../utils/blockchain');

router.get('/health', async (req, res) => {
    try {
        // Check blockchain connection
        await blockchainService.provider.getBlockNumber();
        
        res.json({
            status: 'healthy',
            blockchain: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            blockchain: 'disconnected',
            error: error.message
        });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const totalIdentities = await blockchainService.digitalIdentityNFT.balanceOf(
            blockchainService.digitalIdentityNFT.address
        );
        const totalCases = await blockchainService.moderatorControl.getTotalCases();

        res.json({
            totalIdentities: totalIdentities.toString(),
            totalCases: totalCases.toString(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
