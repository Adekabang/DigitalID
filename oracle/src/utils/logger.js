const winston = require('winston');
const config = require('../config');

// Custom JSON replacer function to handle BigInt
const bigIntReplacer = (key, value) => {
  // Convert BigInt to string
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

// Define log format
const logFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  return `${timestamp} ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, bigIntReplacer) : ''}`;
});

// Create logger configuration
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    config.logging.format === 'json' 
      ? winston.format.json() 
      : logFormat
  ),
  defaultMeta: { service: 'oracle-service' },
  transports: [
    // Log to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        logFormat
      )
    }),
    // Log errors to a file
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Log all output to a file
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Export logger
module.exports = logger;