// backend/src/utils/apikey.service.js
const crypto = require('crypto');
const logger = require('./logger');

// In a production environment, this would be replaced by a database
// For now, we'll use a persistent cache that will survive server restarts
const fs = require('fs');
const path = require('path');

// File to store API keys data
const STORAGE_FILE = path.join(process.cwd(), 'data', 'apikeys.json');

// In-memory API key storage
let apiKeys = new Map();
let apiKeyMeta = new Map();
let apiKeyUsage = new Map(); // Track API key usage for rate limiting
let apiKeyLogs = []; // Audit log

// Create data directory if it doesn't exist
const ensureDataDirectory = () => {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
};

// Load API keys from storage
const loadApiKeys = () => {
  try {
    ensureDataDirectory();
    
    if (!fs.existsSync(STORAGE_FILE)) {
      // Create empty file if it doesn't exist
      saveApiKeys();
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
    
    // Reset maps
    apiKeys = new Map();
    apiKeyMeta = new Map();
    apiKeyUsage = new Map();
    
    // Load API keys
    if (data.keys) {
      data.keys.forEach(item => {
        apiKeys.set(item.key, item.clientId);
        apiKeyMeta.set(item.key, {
          clientId: item.clientId,
          clientName: item.clientName,
          permissions: item.permissions || [],
          active: item.active,
          createdAt: item.createdAt,
          expiresAt: item.expiresAt,
          rateLimit: item.rateLimit || { limit: 100, interval: 60000 } // Default: 100 requests per minute
        });
      });
    }
    
    // Load audit logs
    if (data.logs) {
      apiKeyLogs = data.logs;
    }
    
    logger.info(`Loaded ${apiKeys.size} API keys from storage`);
  } catch (error) {
    logger.error('Failed to load API keys from storage:', error);
  }
};

// Save API keys to storage
const saveApiKeys = () => {
  try {
    ensureDataDirectory();
    
    const keys = [];
    apiKeys.forEach((clientId, key) => {
      if (apiKeyMeta.has(key)) {
        const meta = apiKeyMeta.get(key);
        keys.push({
          key,
          clientId,
          clientName: meta.clientName,
          permissions: meta.permissions,
          active: meta.active,
          createdAt: meta.createdAt,
          expiresAt: meta.expiresAt,
          rateLimit: meta.rateLimit
        });
      }
    });
    
    // Only keep the last 1000 audit logs
    const logs = apiKeyLogs.slice(-1000);
    
    fs.writeFileSync(STORAGE_FILE, JSON.stringify({ keys, logs }, null, 2));
    logger.info(`Saved ${keys.length} API keys to storage`);
  } catch (error) {
    logger.error('Failed to save API keys to storage:', error);
  }
};

// Add an audit log entry
const addAuditLog = (apiKey, event, details) => {
  const timestamp = new Date().toISOString();
  const clientId = apiKeys.get(apiKey) || 'unknown';
  
  const logEntry = {
    timestamp,
    apiKey: apiKey.substring(0, 8) + '...',
    clientId,
    event,
    details
  };
  
  apiKeyLogs.push(logEntry);
  
  // Save periodically (not on every request to avoid performance issues)
  if (apiKeyLogs.length % 10 === 0) {
    saveApiKeys();
  }
  
  return logEntry;
};

// Clean up expired keys (run periodically)
const cleanupExpiredKeys = () => {
  const now = new Date();
  let removedCount = 0;
  
  apiKeyMeta.forEach((meta, key) => {
    if (meta.expiresAt && new Date(meta.expiresAt) < now) {
      apiKeys.delete(key);
      apiKeyMeta.delete(key);
      apiKeyUsage.delete(key);
      removedCount++;
    }
  });
  
  if (removedCount > 0) {
    logger.info(`Removed ${removedCount} expired API keys`);
    saveApiKeys();
  }
};

// Initialize
loadApiKeys();

// Set up automatic cleanup every hour
setInterval(cleanupExpiredKeys, 60 * 60 * 1000);

/**
 * Middleware to validate API keys with rate limiting
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
    
    // Check if key is expired
    if (keyData.expiresAt && new Date(keyData.expiresAt) < new Date()) {
      // Deactivate the key
      keyData.active = false;
      apiKeyMeta.set(apiKey, keyData);
      saveApiKeys();
      
      return res.status(403).json({
        success: false,
        error: 'API key has expired'
      });
    }
    
    // Rate limiting
    const rateLimit = keyData.rateLimit || { limit: 100, interval: 60000 }; // Default: 100 requests per minute
    
    // Initialize usage tracking if it doesn't exist
    if (!apiKeyUsage.has(apiKey)) {
      apiKeyUsage.set(apiKey, {
        count: 0,
        resetAt: Date.now() + rateLimit.interval
      });
    }
    
    // Get current usage
    const usage = apiKeyUsage.get(apiKey);
    
    // Reset count if the interval has passed
    if (Date.now() > usage.resetAt) {
      usage.count = 0;
      usage.resetAt = Date.now() + rateLimit.interval;
      apiKeyUsage.set(apiKey, usage);
    }
    
    // Check if rate limit exceeded
    if (usage.count >= rateLimit.limit) {
      // Add audit log
      addAuditLog(apiKey, 'rate_limit_exceeded', {
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip
      });
      
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        resetAt: new Date(usage.resetAt).toISOString()
      });
    }
    
    // Increment usage count
    usage.count++;
    apiKeyUsage.set(apiKey, usage);
    
    // Add API client info to request
    req.apiClient = {
      id: keyData.clientId,
      name: keyData.clientName,
      permissions: keyData.permissions || []
    };
    
    // Add audit log (for important operations only)
    if (req.method !== 'GET') {
      addAuditLog(apiKey, 'api_request', {
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip
      });
    }
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': rateLimit.limit,
      'X-RateLimit-Remaining': rateLimit.limit - usage.count,
      'X-RateLimit-Reset': usage.resetAt
    });
    
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
 * @param {Object} options - Additional options (expiresIn, rateLimit)
 * @returns {string} - The generated API key
 */
exports.generateApiKey = (clientId, clientName, permissions = [], options = {}) => {
  // Generate a random API key
  const apiKey = crypto.randomBytes(32).toString('hex');
  
  // Calculate expiration date if provided
  let expiresAt = null;
  if (options.expiresIn) {
    expiresAt = new Date(Date.now() + options.expiresIn).toISOString();
  }
  
  // Store the API key
  apiKeys.set(apiKey, clientId);
  
  // Store metadata
  const meta = {
    clientId,
    clientName,
    permissions,
    active: true,
    createdAt: new Date().toISOString(),
    expiresAt,
    rateLimit: options.rateLimit || { limit: 100, interval: 60000 } // Default: 100 requests per minute
  };
  
  apiKeyMeta.set(apiKey, meta);
  
  // Add audit log
  addAuditLog(apiKey, 'key_generated', {
    clientId,
    clientName,
    permissions,
    expiresAt,
    rateLimit: meta.rateLimit
  });
  
  // Save to persistent storage
  saveApiKeys();
  
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
    
    // Add audit log
    addAuditLog(apiKey, 'key_deactivated', {
      clientId: keyData.clientId,
      reason: 'Manual deactivation'
    });
    
    // Save to persistent storage
    saveApiKeys();
    
    return true;
  }
  return false;
};

/**
 * Rotate an API key (generate new key, deactivate old key)
 * @param {string} oldApiKey - The API key to rotate
 * @returns {Object} - New API key or null if failed
 */
exports.rotateApiKey = (oldApiKey) => {
  if (apiKeys.has(oldApiKey) && apiKeyMeta.has(oldApiKey)) {
    const oldKeyData = apiKeyMeta.get(oldApiKey);
    
    // Generate a new API key with the same properties
    const newApiKey = exports.generateApiKey(
      oldKeyData.clientId,
      oldKeyData.clientName,
      oldKeyData.permissions,
      {
        expiresAt: oldKeyData.expiresAt,
        rateLimit: oldKeyData.rateLimit
      }
    );
    
    // Deactivate the old key
    oldKeyData.active = false;
    apiKeyMeta.set(oldApiKey, oldKeyData);
    
    // Add audit log
    addAuditLog(oldApiKey, 'key_rotated', {
      clientId: oldKeyData.clientId,
      newKeyPrefix: newApiKey.substring(0, 8) + '...'
    });
    
    // Save to persistent storage
    saveApiKeys();
    
    return {
      apiKey: newApiKey,
      clientId: oldKeyData.clientId,
      clientName: oldKeyData.clientName,
      permissions: oldKeyData.permissions,
      createdAt: new Date().toISOString(),
      expiresAt: oldKeyData.expiresAt,
      rateLimit: oldKeyData.rateLimit
    };
  }
  return null;
};

/**
 * Update API key permissions
 * @param {string} apiKey - The API key to update
 * @param {string[]} permissions - New array of permission strings
 * @returns {boolean} - Success status
 */
exports.updateApiKeyPermissions = (apiKey, permissions = []) => {
  if (apiKeys.has(apiKey) && apiKeyMeta.has(apiKey)) {
    const keyData = apiKeyMeta.get(apiKey);
    
    // Store old permissions for audit log
    const oldPermissions = [...keyData.permissions];
    
    // Update permissions
    keyData.permissions = permissions;
    apiKeyMeta.set(apiKey, keyData);
    
    // Add audit log
    addAuditLog(apiKey, 'permissions_updated', {
      clientId: keyData.clientId,
      oldPermissions,
      newPermissions: permissions
    });
    
    // Save to persistent storage
    saveApiKeys();
    
    return true;
  }
  return false;
};

/**
 * Update API key rate limit
 * @param {string} apiKey - The API key to update
 * @param {Object} rateLimit - Rate limit object { limit, interval }
 * @returns {boolean} - Success status
 */
exports.updateApiKeyRateLimit = (apiKey, rateLimit) => {
  if (apiKeys.has(apiKey) && apiKeyMeta.has(apiKey)) {
    const keyData = apiKeyMeta.get(apiKey);
    
    // Store old rate limit for audit log
    const oldRateLimit = { ...keyData.rateLimit };
    
    // Update rate limit
    keyData.rateLimit = rateLimit;
    apiKeyMeta.set(apiKey, keyData);
    
    // Add audit log
    addAuditLog(apiKey, 'rate_limit_updated', {
      clientId: keyData.clientId,
      oldRateLimit,
      newRateLimit: rateLimit
    });
    
    // Save to persistent storage
    saveApiKeys();
    
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
        expiresAt: meta.expiresAt,
        permissions: meta.permissions,
        rateLimit: meta.rateLimit
      });
    }
  });
  
  return result;
};

/**
 * Get API key usage statistics
 * @param {string} apiKey - The API key
 * @returns {Object} - Usage statistics
 */
exports.getApiKeyUsage = (apiKey) => {
  if (apiKeys.has(apiKey) && apiKeyUsage.has(apiKey)) {
    const usage = apiKeyUsage.get(apiKey);
    const meta = apiKeyMeta.get(apiKey);
    
    return {
      clientId: meta.clientId,
      active: meta.active,
      currentUsage: usage.count,
      rateLimit: meta.rateLimit,
      resetAt: new Date(usage.resetAt).toISOString()
    };
  }
  return null;
};

/**
 * Get API key audit logs
 * @param {string} clientId - Client identifier (optional)
 * @param {number} limit - Maximum number of logs to return
 * @returns {Array} - Array of audit log entries
 */
exports.getApiKeyAuditLogs = (clientId, limit = 100) => {
  let logs = [...apiKeyLogs];
  
  // Filter by client ID if provided
  if (clientId) {
    logs = logs.filter(log => log.clientId === clientId);
  }
  
  // Sort by timestamp (newest first)
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Limit the number of logs
  return logs.slice(0, limit);
};

// Initialize with some development keys if in development environment
if (process.env.NODE_ENV === 'development') {
  // Check if we already have a development key
  let devKeyExists = false;
  
  apiKeys.forEach((clientId) => {
    if (clientId.startsWith('dev-client-')) {
      devKeyExists = true;
    }
  });
  
  if (!devKeyExists) {
    const devKey = exports.generateApiKey(
      'dev-client-1',
      'Development Client',
      ['identity.read', 'reputation.read'],
      {
        expiresIn: 30 * 24 * 60 * 60 * 1000 // 30 days
      }
    );
    
    logger.info(`Development API key generated: ${devKey}`);
  }
}