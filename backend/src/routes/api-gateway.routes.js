const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { apiKeyMiddleware } = require('../utils/apikey.service');
const authService = require('../auth/auth.service');
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
 * @route POST /gateway/sso/authorize
 * @description OAuth 2.0 like authorization endpoint
 * @access Public with API key
 */
router.post('/sso/authorize', apiKeyMiddleware, async (req, res) => {
  try {
    const { client_id, redirect_uri, state, scope, response_type, address, signature, timestamp } = req.body;
    
    // Validate required fields
    if (!client_id || !redirect_uri || !response_type || !address || !signature || !timestamp) {
      throw new ValidationError('Missing required OAuth parameters');
    }
    
    // Verify the client ID matches the API key client
    if (client_id !== req.apiClient.id) {
      throw new ValidationError('client_id does not match API key');
    }
    
    // Only support 'code' response type for now (authorization code flow)
    if (response_type !== 'code') {
      throw new ValidationError('Only code response_type is supported');
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
    
    // Standard OAuth message format
    const message = `Login to ${client_id} with timestamp: ${timestamp}`;
    
    // Verify signature
    const isValid = await blockchainUtils.verifySignature(
      message,
      signature,
      address
    );
    
    if (!isValid) {
      throw new ValidationError('Invalid signature');
    }
    
    // Check if user has an identity
    const hasIdentity = await blockchainUtils.hasIdentity(address);
    if (!hasIdentity) {
      throw new ValidationError('User does not have an identity');
    }
    
    // Generate OAuth authorization code
    const code = generateAuthCode(client_id, address, scope);
    
    // Build redirect URI with params
    const redirectUrl = buildRedirectUrl(redirect_uri, {
      code,
      state: state || ""
    });
    
    res.json({
      success: true,
      data: {
        redirect_url: redirectUrl,
        code: code
      }
    });
    
  } catch (error) {
    logger.error('API Gateway SSO authorization error:', error);
    res.status(error instanceof ValidationError ? 400 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /gateway/sso/token
 * @description OAuth 2.0 token endpoint
 * @access Public with API key
 */
router.post('/sso/token', apiKeyMiddleware, async (req, res) => {
  try {
    const { client_id, client_secret, code, grant_type } = req.body;
    
    // Validate required fields
    if (!client_id || !client_secret || !code || !grant_type) {
      throw new ValidationError('Missing required OAuth parameters');
    }
    
    // Verify the client ID matches the API key client
    if (client_id !== req.apiClient.id) {
      throw new ValidationError('client_id does not match API key');
    }
    
    // Only support 'authorization_code' grant type for now
    if (grant_type !== 'authorization_code') {
      throw new ValidationError('Only authorization_code grant_type is supported');
    }
    
    // Validate the authorization code
    const authInfo = validateAuthCode(code);
    if (!authInfo) {
      throw new ValidationError('Invalid authorization code');
    }
    
    // Verify the code was generated for this client
    if (authInfo.clientId !== client_id) {
      throw new ValidationError('Authorization code was not generated for this client');
    }
    
    // Get user information
    const [identityData, reputationData] = await Promise.all([
      blockchainUtils.getIdentityData(authInfo.address),
      blockchainUtils.getReputationData(authInfo.address)
    ]);
    
    if (!identityData) {
      throw new ValidationError('Identity not found');
    }
    
    // Generate access token and refresh token
    const payload = {
      address: authInfo.address,
      client_id: client_id,
      scope: authInfo.scope,
      did: identityData.did,
      verificationLevel: identityData.verificationLevel
    };
    
    const tokens = authService.generateTokens(payload);
    
    res.json({
      success: true,
      data: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
        scope: authInfo.scope,
        user_info: {
          address: authInfo.address,
          did: identityData.did,
          verification_level: identityData.verificationLevel,
          reputation_score: reputationData ? reputationData.score : null
        }
      }
    });
    
  } catch (error) {
    logger.error('API Gateway SSO token error:', error);
    res.status(error instanceof ValidationError ? 400 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /gateway/sso/userinfo
 * @description OAuth 2.0 userinfo endpoint
 * @access Protected with OAuth access token
 */
router.get('/sso/userinfo', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ValidationError('No token provided');
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = authService.verifyToken(token);
    
    if (!decoded) {
      throw new ValidationError('Invalid token');
    }
    
    // Get user information
    const [identityData, reputationData] = await Promise.all([
      blockchainUtils.getIdentityData(decoded.address),
      blockchainUtils.getReputationData(decoded.address)
    ]);
    
    if (!identityData) {
      throw new ValidationError('Identity not found');
    }
    
    res.json({
      success: true,
      data: {
        address: decoded.address,
        did: identityData.did,
        verification_level: identityData.verificationLevel,
        verification_status: _getVerificationStatus(identityData.verificationLevel),
        creation_date: identityData.creationDate,
        reputation_score: reputationData ? reputationData.score : null,
        client_id: decoded.client_id,
        scope: decoded.scope
      }
    });
    
  } catch (error) {
    logger.error('API Gateway userinfo error:', error);
    res.status(error instanceof ValidationError ? 401 : 500).json({
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
      timestamp: new Date().toISOString(),
      oauth_supported: true,
      supported_flows: ['authorization_code']
    }
  });
});

// Helper Functions

// Store authorization codes (in memory for now, would use Redis or similar in production)
const authCodes = new Map();

/**
 * Generate a new OAuth authorization code
 */
function generateAuthCode(clientId, address, scope = '') {
  // Generate a random code
  const code = Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
  
  // Store the code info
  authCodes.set(code, {
    clientId,
    address,
    scope,
    expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
  });
  
  // Clean up expired codes (simple cleanup)
  const now = Date.now();
  for (const [key, value] of authCodes.entries()) {
    if (value.expiresAt < now) {
      authCodes.delete(key);
    }
  }
  
  return code;
}

/**
 * Validate an authorization code and return the associated information
 */
function validateAuthCode(code) {
  if (!authCodes.has(code)) {
    return null;
  }
  
  const codeInfo = authCodes.get(code);
  const now = Date.now();
  
  // Check if code is expired
  if (codeInfo.expiresAt < now) {
    authCodes.delete(code);
    return null;
  }
  
  // Remove the code after use (single use)
  authCodes.delete(code);
  
  return codeInfo;
}

/**
 * Build a redirect URL with query parameters
 */
function buildRedirectUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  
  return url.toString();
}

/**
 * Get a human-readable verification status from level
 */
function _getVerificationStatus(level) {
  switch (level) {
    case 0:
      return 'UNVERIFIED';
    case 1:
      return 'BASIC_VERIFIED';
    case 2:
      return 'KYC_VERIFIED';
    case 3:
      return 'FULLY_VERIFIED';
    default:
      return 'UNKNOWN';
  }
}

module.exports = router;