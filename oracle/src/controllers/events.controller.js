const express = require('express');
const router = express.Router();
const blockchainService = require('../services/blockchain.service');
const logger = require('../utils/logger');

/**
 * @route GET /api/events/:contractName/:eventName
 * @description Get events for a specific contract and event name
 * @access Public
 */
router.get('/:contractName/:eventName', async (req, res) => {
  try {
    const { contractName, eventName } = req.params;
    const { fromBlock, toBlock } = req.query;
    
    logger.info(`Fetching events for ${contractName}.${eventName}`);
    
    // Validate contract name
    if (!blockchainService.contracts[contractName]) {
      return res.status(400).json({
        success: false,
        error: `Invalid contract name: ${contractName}`
      });
    }
    
    // Parse block numbers
    const from = fromBlock ? parseInt(fromBlock) : undefined;
    const to = toBlock ? parseInt(toBlock) : undefined;
    
    // Query for events
    const events = await blockchainService.pollForEvents(
      contractName,
      eventName,
      {},
      from
    );
    
    return res.json({
      success: true,
      data: {
        events: events.map(event => ({
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          args: event.args
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching events:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/events/poll
 * @description Force poll for missed events
 * @access Private
 */
router.post('/poll', async (req, res) => {
  try {
    logger.info('Manual event polling triggered');
    
    // Start asynchronous polling process
    setTimeout(async () => {
      try {
        // Poll for missed verification events
        const verificationEvents = await blockchainService.pollForEvents(
          'verification',
          'VerificationRequested'
        );
        
        // Poll for missed moderation events
        const moderationEvents = await blockchainService.pollForEvents(
          'moderation',
          'ModerationActionCreated'
        );
        
        logger.info(`Polled for events: ${verificationEvents.length} verification events, ${moderationEvents.length} moderation events`);
      } catch (error) {
        logger.error('Error in manual event polling:', error);
      }
    }, 0);
    
    return res.json({
      success: true,
      message: 'Event polling triggered'
    });
  } catch (error) {
    logger.error('Error triggering event polling:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;