const express = require('express');
const router = express.Router();
const blockchainService = require('../services/blockchain.service');
const logger = require('../utils/logger');

/**
 * @route GET /api/identity/details
 * @description Get identity details by address
 * @access Public
 */
router.get('/details', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address parameter is required'
      });
    }
    
    logger.info(`Fetching identity details for address: ${address}`);
    
    // Check if address has identity
    const hasIdentity = await blockchainService.contracts.identity.hasIdentity(address);
    
    if (!hasIdentity) {
      return res.status(404).json({
        success: false,
        error: 'Address does not have an identity'
      });
    }
    
    // Get token ID
    const tokenId = await blockchainService.contracts.identity.addressToTokenId(address);
    logger.info(`Found token ID ${tokenId} for address ${address}`);
    
    // Get identity details
    const details = await blockchainService.contracts.identity.getFormattedIdentityDetails(tokenId);
    
    // Return formatted response
    const responseData = {
      success: true,
      data: {
        did: details.did,
        isVerified: details.isVerified,
        creationDate: details.creationDate,
        lastUpdate: details.lastUpdate,
        verificationLevel: details.verificationLevel,
        isRecoverable: details.isRecoverable,
        recoveryAddress: details.recoveryAddress,
        lastVerificationDate: details.lastVerificationDate,
        tokenId: tokenId.toString()
      }
    };
    
    // Try to get metadata if available
    try {
      const metadataKeys = ['name', 'email', 'createdAt']; // Common metadata keys
      const metadata = {};
      
      for (const key of metadataKeys) {
        try {
          const value = await blockchainService.contracts.identity.getMetadata(tokenId, key);
          if (value) {
            metadata[key] = value;
          }
        } catch (error) {
          logger.warn(`Error fetching metadata '${key}' for token ${tokenId}:`, error.message);
        }
      }
      
      responseData.data.metadata = metadata;
    } catch (error) {
      logger.warn(`Error fetching metadata for token ${tokenId}:`, error.message);
    }
    
    return res.json(JSON.parse(JSON.stringify(responseData, 
      (key, value) => typeof value === 'bigint' ? value.toString() : value)));
  } catch (error) {
    logger.error(`Error fetching identity details:`, error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/identity/verificationLevel
 * @description Get verification level by address
 * @access Public
 */
router.get('/verificationLevel', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address parameter is required'
      });
    }
    
    logger.info(`Fetching verification level for address: ${address}`);
    
    // Check if address has identity
    const hasIdentity = await blockchainService.contracts.identity.hasIdentity(address);
    
    if (!hasIdentity) {
      return res.status(404).json({
        success: false,
        error: 'Address does not have an identity'
      });
    }
    
    // Get token ID
    const tokenId = await blockchainService.contracts.identity.addressToTokenId(address);
    
    // Get identity details
    const details = await blockchainService.contracts.identity.getFormattedIdentityDetails(tokenId);
    
    // Map verification level string to number
    let levelNumber = 0;
    
    switch (details.verificationLevel) {
      case 'BASIC VERIFIED':
        levelNumber = 1;
        break;
      case 'KYC VERIFIED':
        levelNumber = 2;
        break;
      case 'FULLY VERIFIED':
        levelNumber = 3;
        break;
      default:
        levelNumber = 0; // UNVERIFIED
    }
    
    return res.json({
      success: true,
      data: {
        level: levelNumber,
        levelName: details.verificationLevel
      }
    });
  } catch (error) {
    logger.error(`Error fetching verification level:`, error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/identity/create
 * @description Create a new identity
 * @access Private
 */
router.post('/create', async (req, res) => {
  try {
    const { address, did, metadata } = req.body;
    
    if (!address || !did) {
      return res.status(400).json({
        success: false,
        error: 'Address and DID are required'
      });
    }
    
    logger.info(`Creating identity for address: ${address}, DID: ${did}`);
    
    // Check if address already has identity
    const hasIdentity = await blockchainService.contracts.identity.hasIdentity(address);
    
    if (hasIdentity) {
      return res.status(400).json({
        success: false,
        error: 'Address already has an identity'
      });
    }
    
    // Prepare metadata
    const metadataKeys = [];
    const metadataValues = [];
    
    if (metadata && typeof metadata === 'object') {
      for (const [key, value] of Object.entries(metadata)) {
        metadataKeys.push(key);
        metadataValues.push(value.toString());
      }
    }
    
    // Create identity
    const result = await blockchainService.executeTransaction(
      'identity',
      'createIdentity',
      [address, did, metadataKeys, metadataValues]
    );
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to create identity: ${result.error || 'Unknown error'}`
      });
    }
    
    logger.info(`Identity created for ${address}, transaction: ${result.transactionHash}`);
    
    // Get token ID
    const tokenId = await blockchainService.contracts.identity.addressToTokenId(address);
    
    return res.json({
      success: true,
      message: 'Identity created successfully',
      data: {
        address,
        did,
        tokenId: tokenId.toString(),
        transactionHash: result.transactionHash
      }
    });
  } catch (error) {
    logger.error(`Error creating identity:`, error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;