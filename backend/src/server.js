const express = require('express');
const { errorHandler, NotFoundError } = require('./middleware/error.middleware');
const {
    helmetConfig,
    corsConfig,
    additionalHeaders,
} = require('./middleware/security.middleware');
const {
    createRateLimiter,
    apiLimiter,
} = require('./middleware/rate-limit.middleware');
const logger = require('./utils/logger');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
const fs = require('fs');
const path = require('path');

const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./auth/auth.routes');
const identityRoutes = require('./routes/identity.routes');
const reputationRoutes = require('./routes/reputation.routes');
const moderationRoutes = require('./routes/moderation.routes');
const systemRoutes = require('./routes/system.routes');
const appealRoutes = require('./routes/appeal.routes');
const mfaRoutes = require('./routes/mfa.routes');
const apiGatewayRoutes = require('./routes/api-gateway.routes');

const app = express();

// Security middleware
app.use(helmetConfig);
app.use(corsConfig);
app.use(additionalHeaders);

// Basic middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Global rate limiter
app.use(createRateLimiter());

// Health check endpoint (no rate limit)
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Documentation endpoints
app.get('/api-docs/json', (req, res) => {
    res.json(swaggerDocument);
});

// Serve Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "Blockchain Identity System API",
}));

// API routes with rate limiting
app.use('/api/auth', authRoutes);
app.use('/api/identity', apiLimiter, identityRoutes);
app.use('/api/reputation', apiLimiter, reputationRoutes);
app.use('/api/moderation', apiLimiter, moderationRoutes);
app.use('/api/system', apiLimiter, systemRoutes);
app.use('/api/appeal', apiLimiter, appealRoutes);
app.use('/api/mfa', apiLimiter, mfaRoutes);

// API Gateway routes
app.use('/gateway', apiLimiter, apiGatewayRoutes);

// 404 handler
app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.originalUrl} not found`));
});

// Global error handler
app.use(errorHandler);

// Uncaught exception handler
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});

// Unhandled rejection handler
process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION:', err);
    process.exit(1);
});

// Register demo app OAuth client if in development mode
if (process.env.NODE_ENV === 'development') {
    const apiKeyService = require('./utils/apikey.service');
    
    // Register the demo app client
    const demoClient = {
        clientId: 'demo-app-123',
        clientName: 'Demo App',
        clientSecret: 'demo-app-secret-456',
        redirectUri: 'http://localhost:3001/callback',
        apiKey: '9145274d9ec8a87874446681596cf65df10931bbc11be9f2a344c09d7364c8eb' // Add it to the client config too
    };
    
    // Force create a specific API key for the demo app
    logger.info('Registering demo app client with fixed API key');
    
    // First, check if the key already exists
    if (!apiKeyService.apiKeys) {
        apiKeyService.apiKeys = new Map();
    }
    
    // Add the fixed API key for the demo app
    apiKeyService.apiKeys.set(demoClient.apiKey, demoClient.clientId);
    
    // Add metadata
    if (!apiKeyService.apiKeyMeta) {
        apiKeyService.apiKeyMeta = new Map();
    }
    
    apiKeyService.apiKeyMeta.set(demoClient.apiKey, {
        clientId: demoClient.clientId,
        clientName: demoClient.clientName,
        permissions: ['identity.read', 'reputation.read', 'authentication'],
        active: true,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString(),
        rateLimit: { limit: 1000, interval: 60000 }
    });
    
    logger.info(`Demo app client registered with API key: ${demoClient.apiKey.substring(0, 8)}...`);
    
    // Also register using the normal method as a backup
    const clientKeys = apiKeyService.getClientApiKeys(demoClient.clientId);
    if (clientKeys.length === 0) {
        logger.info('Also registering demo app client with standard method');
        apiKeyService.generateApiKey(
            demoClient.clientId,
            demoClient.clientName,
            ['identity.read', 'reputation.read', 'authentication'],
            {
                expiresIn: 30 * 24 * 60 * 60 * 1000 // 30 days
            }
        );
    }
    
    // Store auth codes for the demo app (normally would be in a database)
    global.oauthClients = global.oauthClients || new Map();
    global.oauthClients.set(demoClient.clientId, demoClient);
    
    logger.info('Demo app client configured for SSO authentication');
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

module.exports = app;
