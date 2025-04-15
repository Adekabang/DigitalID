const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const oracleService = require('./services/oracle.service');

// Create express app
const app = express();

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS support
app.use(express.json()); // Parse JSON requests
app.use(morgan('combined')); // HTTP request logging

// API routes
app.use('/api/events', require('./controllers/events.controller'));
app.use('/api/verifications', require('./controllers/verifications.controller'));
app.use('/api/callbacks', require('./controllers/callbacks.controller'));
app.use('/api/identity', require('./controllers/identity.controller'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'oracle',
    timestamp: new Date().toISOString(),
    environment: config.server.env
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: config.server.env === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Start the server
const PORT = config.server.port;
const server = app.listen(PORT, async () => {
  logger.info(`Oracle service running on port ${PORT}`);
  
  try {
    // Initialize oracle service
    await oracleService.initialize();
    logger.info('Oracle service started successfully');
  } catch (error) {
    logger.error('Failed to start oracle service:', error);
    process.exit(1);
  }
});

// Handle shutdown gracefully
const shutdown = async () => {
  logger.info('Shutting down oracle service...');
  
  // Stop the oracle service
  oracleService.stop();
  
  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  shutdown();
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});