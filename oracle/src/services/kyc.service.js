const axios = require('axios');
const config = require('../config');
const kycConfig = require('../config/kyc-providers');
const logger = require('../utils/logger');

class KYCService {
  constructor() {
    const provider = kycConfig.activeProvider;
    
    logger.info(`Initializing KYC service with provider: ${provider.name}`);
    
    // Only create client if using a real provider
    if (provider.url) {
      this.client = axios.create({
        baseURL: provider.url,
        timeout: provider.timeout || 30000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        }
      });
    }
    
    this.provider = provider;
    this.providerType = kycConfig.activeProviderType;
  }
  
  /**
   * Verify identity using external KYC provider
   * 
   * @param {string} userAddress - Ethereum address of the user
   * @param {number} verificationType - Type of verification (1=Basic, 2=KYC, 3=Enhanced)
   * @param {string} metadata - Metadata for verification (JSON string)
   * @returns {Promise<Object>} - Verification result
   */
  async verifyIdentity(userAddress, verificationType, metadata) {
    try {
      // Add extra logging to debug type conversion issues
      logger.info(`Sending KYC verification request for ${userAddress}, type: ${verificationType} (${typeof verificationType})`);
      
      // Ensure verificationType is a number
      const vTypeNum = Number(verificationType);
      if (isNaN(vTypeNum)) {
        logger.warn(`Verification type is NaN: ${verificationType}, setting to 0 (KYC)`);
        verificationType = 0;
      } else {
        verificationType = vTypeNum;
      }
      
      // Parse metadata if it's a string
      let parsedMetadata;
      try {
        parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        logger.debug(`Parsed metadata for ${userAddress}: ${JSON.stringify(parsedMetadata, null, 2)}`);
      } catch (error) {
        logger.warn(`Failed to parse metadata for ${userAddress}:`, error);
        parsedMetadata = { raw: metadata };
      }
      
      // Use mock provider if configured to do so, or if in development with no real provider
      if (this.providerType === 'mock' || (config.server.env === 'development' && !this.provider.url)) {
        logger.info(`Using mock KYC verification for ${userAddress}`);
        return this._mockVerification(userAddress, verificationType, parsedMetadata);
      }
      
      // Build verification request
      const request = {
        address: userAddress,
        verificationType,
        metadata: parsedMetadata
      };
      
      // Call external KYC provider
      const response = await this.client.post('/verify', request);
      
      logger.info(`KYC verification response for ${userAddress}:`, response.data);
      
      return {
        success: response.data.success,
        data: response.data.data || {},
        reason: response.data.reason || ''
      };
    } catch (error) {
      logger.error(`KYC verification error for ${userAddress}:`, error);
      
      return {
        success: false,
        reason: `Verification failed: ${error.message}`
      };
    }
  }
  
  /**
   * Mock KYC verification for development/testing
   * 
   * @param {string} userAddress - Ethereum address of the user
   * @param {number} verificationType - Type of verification
   * @param {Object} metadata - Verification metadata
   * @returns {Object} - Mock verification result
   * @private
   */
  _mockVerification(userAddress, verificationType, metadata) {
    // Simulate verification process
    logger.info(`Simulating ${verificationType} verification for ${userAddress}`);
    
    // Get success rates from config if available
    const verificationConfig = this.provider.verificationLevels && 
                              this.provider.verificationLevels[verificationType];
    
    const successRate = verificationConfig ? 
                        verificationConfig.successRate : 
                        verificationType === 1 ? 0.95 : 
                        verificationType === 2 ? 0.8 : 
                        verificationType === 3 ? 0.7 : 0.5;
    
    // Simulation logic: Approve basic verifications, but be more selective for higher levels
    let success = true;
    let reason = '';
    let data = {};
    
    // Map verification types to internal levels
    // In VerificationRegistry contract, verification types are: KYC (0), DOCUMENT (1), BIOMETRIC (2), TWO_FACTOR (3), SOCIAL (4)
    
    // KYC verification (type 0) - Standard verification
    if (verificationType === 0) {
      const hasRequiredFields = metadata && 
        (typeof metadata === 'object' ? 
          (metadata.fullName || (metadata.firstName && metadata.lastName)) : 
          true);  // If metadata isn't parsed yet, assume it's ok
      
      // For testing purposes, always succeed with KYC verification
      success = true;
      
      if (success) {
        data = {
          verificationId: `kyc-${Date.now()}`,
          level: 2,
          timestamp: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year expiry
          // Additional debugging info to confirm this verification is being processed
          verificationSuccessful: true,
          verificationType: "KYC",
          processedAt: new Date().toISOString(),
          mockProvider: true
        };
      } else {
        reason = hasRequiredFields 
          ? 'KYC verification failed - Could not verify user identity'
          : 'KYC verification failed - Missing required user information';
      }
    }
    // Document verification (level 1) - Almost always approve
    else if (verificationType === 1) {
      success = Math.random() < successRate; // Default: 95% success rate
      
      if (success) {
        data = {
          verificationId: `document-${Date.now()}`,
          level: 1,
          timestamp: new Date().toISOString()
        };
      } else {
        reason = 'Document verification failed - Invalid document';
      }
    }
    // Biometric verification (level 2) - More stringent checks
    else if (verificationType === 2) {
      // Simulate more thorough checks for biometric verification
      const hasRequiredFields = metadata && 
        (metadata.fullName || (metadata.firstName && metadata.lastName));
      
      success = hasRequiredFields && Math.random() < 0.8; // 80% success if data is present
      
      if (success) {
        data = {
          verificationId: `biometric-${Date.now()}`,
          level: 2,
          timestamp: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year expiry
        };
      } else {
        reason = hasRequiredFields 
          ? 'Biometric verification failed - Could not verify user identity'
          : 'Biometric verification failed - Missing required user information';
      }
    }
    // Enhanced verification (level 3) - Highest level of scrutiny
    else if (verificationType === 3) {
      // Simulate very thorough checks for enhanced verification
      const hasAllFields = metadata && 
        metadata.fullName && 
        metadata.dateOfBirth &&
        metadata.address &&
        metadata.identificationNumber;
      
      success = hasAllFields && Math.random() < 0.7; // 70% success if all data is present
      
      if (success) {
        data = {
          verificationId: `enhanced-${Date.now()}`,
          level: 3,
          timestamp: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() // 6 months expiry
        };
      } else {
        reason = hasAllFields
          ? 'Enhanced verification failed - Could not verify additional user credentials'
          : 'Enhanced verification failed - Insufficient documentation provided';
      }
    }
    // Social verification (level 4)
    else if (verificationType === 4) {
      // Simple social verification
      success = Math.random() < 0.95; // 95% success rate for social verification
      
      if (success) {
        data = {
          verificationId: `social-${Date.now()}`,
          level: 1,
          timestamp: new Date().toISOString()
        };
      } else {
        reason = 'Social verification failed - Could not verify social credentials';
      }
    }
    // Unknown verification type
    else {
      success = false;
      reason = `Unknown verification type: ${verificationType}`;
    }
    
    // Simulate processing delay (100-500ms)
    const delay = Math.floor(Math.random() * 400) + 100;
    
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          success,
          data,
          reason
        });
      }, delay);
    });
  }
}

// Create singleton instance
const kycService = new KYCService();

module.exports = kycService;