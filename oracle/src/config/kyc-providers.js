/**
 * KYC Provider Configuration
 * 
 * This file defines the available KYC providers and their configuration.
 * You can add new providers by implementing the required interface.
 */

require('dotenv').config();

const kycProviders = {
  // Mock provider for development and testing
  mock: {
    name: 'Mock KYC Provider',
    url: null,
    apiKey: null,
    timeout: 5000,
    verificationLevels: {
      1: { name: 'Basic', successRate: 0.95 },
      2: { name: 'KYC', successRate: 0.8 },
      3: { name: 'Enhanced', successRate: 0.7 }
    }
  },
  
  // Example provider configurations
  onfido: {
    name: 'Onfido',
    url: process.env.KYC_PROVIDER_URL || 'https://api.onfido.com/v3',
    apiKey: process.env.KYC_PROVIDER_API_KEY,
    timeout: 30000,
    webhookSigningSecret: process.env.KYC_WEBHOOK_SECRET,
    region: process.env.KYC_PROVIDER_REGION || 'us',
    verificationLevels: {
      1: { workflow: 'basic-identity' },
      2: { workflow: 'standard-kyc' },
      3: { workflow: 'enhanced-kyc' }
    }
  },
  
  jumio: {
    name: 'Jumio',
    url: process.env.KYC_PROVIDER_URL || 'https://netverify.com/api/v4',
    apiKey: process.env.KYC_PROVIDER_API_KEY,
    apiSecret: process.env.KYC_PROVIDER_API_SECRET,
    timeout: 30000,
    callbackURL: process.env.KYC_CALLBACK_URL,
    verificationLevels: {
      1: { workflowId: 'basic-id' },
      2: { workflowId: 'kyc-standard' },
      3: { workflowId: 'kyc-enhanced' }
    }
  },
  
  civic: {
    name: 'Civic',
    url: process.env.KYC_PROVIDER_URL || 'https://api.civic.com/kyc',
    apiKey: process.env.KYC_PROVIDER_API_KEY,
    timeout: 30000,
    appId: process.env.KYC_PROVIDER_APP_ID,
    verificationLevels: {
      1: { level: 'basic' },
      2: { level: 'plus' },
      3: { level: 'premium' }
    }
  }
};

// Get active provider from environment variable or default to mock
const activeProviderType = process.env.KYC_PROVIDER_TYPE || 'mock';
const activeProvider = kycProviders[activeProviderType] || kycProviders.mock;

// If no API key is provided but one is required, warn in development
if (!activeProvider.apiKey && activeProviderType !== 'mock' && process.env.NODE_ENV !== 'production') {
  console.warn(`⚠️ Warning: No API key provided for KYC provider '${activeProviderType}'. Using mock provider instead.`);
}

module.exports = {
  providers: kycProviders,
  activeProvider,
  activeProviderType
};