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

const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./auth/auth.routes');
const identityRoutes = require('./routes/identity.routes');
const reputationRoutes = require('./routes/reputation.routes');
const moderationRoutes = require('./routes/moderation.routes');
const systemRoutes = require('./routes/system.routes');
const appealRoutes = require('./routes/appeal.routes'); // New
const mfaRoutes = require('./routes/mfa.routes'); // New

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

// API routes with rate limiting
app.use('/api/auth', authRoutes);
app.use('/api/identity', apiLimiter, identityRoutes);
app.use('/api/reputation', apiLimiter, reputationRoutes);
app.use('/api/moderation', apiLimiter, moderationRoutes);
app.use('/api/system', apiLimiter, systemRoutes);
app.use('/api/appeal', apiLimiter, appealRoutes); // New
app.use('/api/mfa', apiLimiter, mfaRoutes); // New

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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

module.exports = app;
