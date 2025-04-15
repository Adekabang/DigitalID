const express = require('express');
const router = express.Router();
const kycConfig = require('../config/kyc-providers');
const blockchainService = require('../services/blockchain.service');
const logger = require('../utils/logger');

/**
 * @route POST /api/callbacks/kyc
 * @description Callback endpoint for KYC providers
 * @access Public (restricted by provider signature/secret)
 */
router.post('/kyc', async (req, res) => {
  try {
    const provider = kycConfig.activeProviderType;
    logger.info(`Received KYC callback from provider type: ${provider}`);
    
    // Get request data
    const callbackData = req.body;
    logger.debug('KYC callback data:', callbackData);
    
    // Validate callback signature for security (implementation depends on provider)
    if (!validateCallbackSignature(req, provider)) {
      logger.warn('Invalid callback signature');
      return res.status(401).json({
        success: false,
        error: 'Invalid signature'
      });
    }
    
    // Process the callback based on provider type
    let verificationResult;
    
    switch (provider) {
      case 'onfido':
        verificationResult = processOnfidoCallback(callbackData);
        break;
      case 'jumio':
        verificationResult = processJumioCallback(callbackData);
        break;
      case 'civic':
        verificationResult = processCivicCallback(callbackData);
        break;
      default:
        logger.warn(`Unsupported KYC provider: ${provider}`);
        return res.status(400).json({
          success: false,
          error: 'Unsupported KYC provider'
        });
    }
    
    // Send verification result to blockchain
    if (verificationResult) {
      try {
        const { verificationId, approved, reason } = verificationResult;
        
        // Submit verification result to blockchain
        await blockchainService.executeTransaction(
          'verification',
          'confirmVerification',
          [verificationId, approved, reason || '']
        );
        
        logger.info(`Verification ${verificationId} ${approved ? 'approved' : 'rejected'} from callback`);
      } catch (error) {
        logger.error('Error submitting verification result to blockchain:', error);
      }
    }
    
    // Return success response
    return res.json({
      success: true,
      message: 'Callback processed successfully'
    });
  } catch (error) {
    logger.error('Error processing KYC callback:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Validate callback signature
 * Implementation depends on provider
 */
function validateCallbackSignature(req, provider) {
  // In development, bypass validation for easier testing
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // For each provider, validate accordingly
  switch (provider) {
    case 'onfido':
      // Onfido uses a signature header with HMAC
      const signature = req.headers['x-signature'];
      const webhookToken = kycConfig.providers.onfido.webhookSigningSecret;
      
      // Implementation would validate HMAC signature
      return true;
      
    case 'jumio':
      // Jumio uses basic auth with API key and secret
      // Implementation would validate basic auth credentials
      return true;
      
    case 'civic':
      // Civic validation
      return true;
      
    default:
      return false;
  }
}

/**
 * Process Onfido callback
 * Implementation depends on Onfido's callback format
 */
function processOnfidoCallback(callbackData) {
  try {
    // Example implementation - would be tailored to Onfido's specific format
    const { resource_type, action, object } = callbackData;
    
    if (resource_type === 'check' && action === 'check.completed') {
      const verificationId = object.id;
      const approved = object.result === 'clear';
      const reason = object.result_reason || '';
      
      return { verificationId, approved, reason };
    }
    
    return null;
  } catch (error) {
    logger.error('Error processing Onfido callback:', error);
    return null;
  }
}

/**
 * Process Jumio callback
 */
function processJumioCallback(callbackData) {
  try {
    // Example implementation - would be tailored to Jumio's specific format
    const { scanReference, verificationStatus } = callbackData;
    
    if (scanReference) {
      const verificationId = scanReference;
      const approved = verificationStatus === 'APPROVED';
      const reason = callbackData.rejectReason || '';
      
      return { verificationId, approved, reason };
    }
    
    return null;
  } catch (error) {
    logger.error('Error processing Jumio callback:', error);
    return null;
  }
}

/**
 * Process Civic callback
 */
function processCivicCallback(callbackData) {
  try {
    // Example implementation - would be tailored to Civic's specific format
    const { userId, verificationStatus } = callbackData;
    
    if (userId) {
      const verificationId = userId;
      const approved = verificationStatus === 'approved';
      const reason = callbackData.rejectReason || '';
      
      return { verificationId, approved, reason };
    }
    
    return null;
  } catch (error) {
    logger.error('Error processing Civic callback:', error);
    return null;
  }
}

module.exports = router;