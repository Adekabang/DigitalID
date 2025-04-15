const crypto = require('crypto');
const logger = require('../utils/logger');

// In-memory API key store - in production, this would be in a database
const apiKeys = new Map();

// API key permissions/metadata
const apiKeyMeta = new Map();

/**
 * Middleware to validate API keys
 */
exports.apiKeyMiddleware = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key is required'
      });
    }
    
    // Check if API key is valid
    if (!apiKeys.has(apiKey)) {
      logger.warn(`Invalid API key attempt: ${apiKey.substring(0, 8)}...`);
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    // Get API key metadata
    const keyData = apiKeyMeta.get(apiKey);
    
    // Check if key is active
    if (!keyData.active) {
      return res.status(403).json({
        success: false,
        error: 'API key is inactive'
      });
    }
    
    // Add API client info to request
    req.apiClient = {
      id: keyData.clientId,
      name: keyData.clientName,
      permissions: keyData.permissions || []
    };
    
    // Log API usage
    logger.info(`API request from client: ${keyData.clientId}, endpoint: ${req.originalUrl}`);
    
    next();
  } catch (error) {
    logger.error('API key middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Generate a new API key
 * @param {string} clientId - Client identifier
 * @param {string} clientName - Name of the client
 * @param {string[]} permissions - Array of permission strings
 * @returns {string} - The generated API key
 */
exports.generateApiKey = (clientId, clientName, permissions = []) => {
  // Generate a random API key
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  // Store the API key
  apiKeys.set(apiKey, clientId);
  
  // Store metadata
  apiKeyMeta.set(apiKey, {
    clientId,
    clientName,
    permissions,
    active: true,
    createdAt: new Date().toISOString()
  });
  
  return apiKey;
};

/**
 * Deactivate an API key
 * @param {string} apiKey - The API key to deactivate
 * @returns {boolean} - Success status
 */
exports.deactivateApiKey = (apiKey) => {
  if (apiKeys.has(apiKey) && apiKeyMeta.has(apiKey)) {
    const keyData = apiKeyMeta.get(apiKey);
    keyData.active = false;
    apiKeyMeta.set(apiKey, keyData);
    return true;
  }
  return false;
};

/**
 * Get all API keys for a client
 * @param {string} clientId - Client identifier
 * @returns {Array} - Array of API key data objects
 */
exports.getClientApiKeys = (clientId) => {
  const result = [];
  
  apiKeys.forEach((id, key) => {
    if (id === clientId && apiKeyMeta.has(key)) {
      const meta = apiKeyMeta.get(key);
      result.push({
        key: key.substring(0, 8) + '...',
        active: meta.active,
        createdAt: meta.createdAt,
        permissions: meta.permissions
      });
    }
  });
  
  return result;
};

// Initialize with some development keys if in development environment
if (process.env.NODE_ENV === 'development') {
  const devKey = exports.generateApiKey(
    'dev-client-1',
    'Development Client',
    ['identity.read', 'reputation.read']
  );
  
  logger.info(`Development API key generated: ${devKey}`);
}