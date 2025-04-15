const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { apiKeyMiddleware } = require('../middleware/apikey.middleware');
const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/error.middleware');
const blockchainUtils = require('../utils/blockchain');

/**
 * @route GET /gateway/identity/:address
 * @description Get identity information for a specific address
 * @access Public with API key
 */
router.get('/identity/:address', apiKeyMiddleware, async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate ETH address
    if (!blockchainUtils.isValidEthereumAddress(address)) {
      throw new ValidationError('Invalid Ethereum address');
    }
    
    // Get identity data from blockchain
    const identityData = await blockchainUtils.getIdentityData(address);
    
    if (!identityData) {
      return res.status(404).json({
        success: false,
        error: 'Identity not found'
      });
    }
    
    // Format the response
    res.json({
      success: true,
      data: {
        address: address,
        did: identityData.did,
        verificationLevel: identityData.verificationLevel,
        creationDate: identityData.creationDate,
        isVerified: identityData.verificationLevel > 0,
        recoverable: identityData.isRecoverable
      }
    });
  } catch (error) {
    logger.error('API Gateway identity fetch error:', error);
    res.status(error instanceof ValidationError ? 400 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /gateway/reputation/:address
 * @description Get reputation score for a specific address
 * @access Public with API key
 */
router.get('/reputation/:address', apiKeyMiddleware, async (req, res) => {
  try {
    const { address } = req.params;
    
    // Validate ETH address
    if (!blockchainUtils.isValidEthereumAddress(address)) {
      throw new ValidationError('Invalid Ethereum address');
    }
    
    // Get reputation data from blockchain
    const reputationData = await blockchainUtils.getReputationData(address);
    
    if (!reputationData) {
      return res.status(404).json({
        success: false,
        error: 'Reputation data not found'
      });
    }
    
    // Format the response
    res.json({
      success: true,
      data: {
        address: address,
        score: reputationData.score,
        lastUpdate: reputationData.lastUpdate,
        history: reputationData.history
      }
    });
  } catch (error) {
    logger.error('API Gateway reputation fetch error:', error);
    res.status(error instanceof ValidationError ? 400 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /gateway/authenticate
 * @description Authenticate a user via the gateway
 * @access Public with API key
 */
router.post('/authenticate', apiKeyMiddleware, async (req, res) => {
  try {
    const { address, signature, message, timestamp } = req.body;
    
    if (!address || !signature || !message || !timestamp) {
      throw new ValidationError('Missing required fields');
    }
    
    // Validate ETH address
    if (!blockchainUtils.isValidEthereumAddress(address)) {
      throw new ValidationError('Invalid Ethereum address');
    }
    
    // Verify timestamp is within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (now - parseInt(timestamp) > 300) {
      throw new ValidationError('Signature expired');
    }
    
    // Verify signature
    const isValid = await blockchainUtils.verifySignature(
      message,
      signature,
      address
    );
    
    if (!isValid) {
      throw new ValidationError('Invalid signature');
    }
    
    // Get identity and reputation data
    const [identityData, reputationData] = await Promise.all([
      blockchainUtils.getIdentityData(address),
      blockchainUtils.getReputationData(address)
    ]);
    
    // Format the response
    res.json({
      success: true,
      data: {
        address: address,
        authenticated: true,
        identity: identityData ? {
          did: identityData.did,
          verificationLevel: identityData.verificationLevel,
          isVerified: identityData.verificationLevel > 0
        } : null,
        reputation: reputationData ? {
          score: reputationData.score
        } : null,
        timestamp: now
      }
    });
  } catch (error) {
    logger.error('API Gateway authentication error:', error);
    res.status(error instanceof ValidationError ? 400 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /gateway/status
 * @description Get the status of the gateway API
 * @access Public
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'operational',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;