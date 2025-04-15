// Load environment variables
require('dotenv').config();

const config = {
    // Server settings
    server: {
        port: process.env.PORT || 3030,
        env: process.env.NODE_ENV || 'development',
    },

    // Blockchain settings
    blockchain: {
        rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
        privateKey: process.env.PRIVATE_KEY,
        chainId: parseInt(process.env.CHAIN_ID || '31337'),
        contracts: {
            identity: process.env.IDENTITY_CONTRACT,
            verification: process.env.VERIFICATION_CONTRACT,
            moderation: process.env.MODERATION_CONTRACT,
        },
        gasLimit: 2000000,
        confirmations: 1,
    },

    // Security settings
    security: {
        jwtSecret:
            process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
        jwtExpiresIn: '1d',
        apiKey: process.env.API_KEY,
    },

    // External services
    externalServices: {
        kyc: {
            provider: process.env.KYC_PROVIDER_URL,
            apiKey: process.env.KYC_PROVIDER_API_KEY,
            timeout: 30000, // 30 seconds
        },
    },

    // Oracle settings
    oracle: {
        updateInterval: process.env.ORACLE_UPDATE_INTERVAL || '*/1 * * * *', // Every 15 minutes by default
        maxRetries: 10,
        retryDelay: 5000, // 5 seconds
        eventPollingInterval: 60000, // 1 minute
    },

    // Logging settings
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.NODE_ENV === 'production' ? 'json' : 'console',
    },
};

// Validate configuration
function validateConfig() {
    const requiredVars = [
        'blockchain.privateKey',
        'blockchain.contracts.identity',
        'blockchain.contracts.verification',
        'security.jwtSecret',
        'security.apiKey',
    ];

    const missingVars = requiredVars.filter((varPath) => {
        const keys = varPath.split('.');
        let current = config;
        for (const key of keys) {
            if (current[key] === undefined || current[key] === '') {
                return true;
            }
            current = current[key];
        }
        return false;
    });

    if (missingVars.length > 0) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                `Missing required configuration: ${missingVars.join(', ')}`,
            );
        } else {
            console.warn(
                `⚠️  Warning: Missing recommended configuration: ${missingVars.join(
                    ', ',
                )}`,
            );
        }
    }
}

// In production, validate all required config
if (process.env.NODE_ENV === 'production') {
    validateConfig();
}

module.exports = config;
