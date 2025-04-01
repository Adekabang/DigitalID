const logger = require('../utils/logger');

exports.errorHandler = (err, req, res, next) => {
    logger.error('Error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });

    // Check if the error is a blockchain transaction error
    if (err.message && err.message.includes('transaction failed')) {
        return res.status(400).json({
            error: 'Blockchain transaction failed',
            details: err.message
        });
    }

    // Check if the error is a validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.message
        });
    }

    // Check if the error is an authentication error
    if (err.name === 'AuthenticationError') {
        return res.status(401).json({
            error: 'Authentication Error',
            details: err.message
        });
    }

    // Default error
    res.status(500).json({
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};

// Custom error types
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

class AuthenticationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

exports.ValidationError = ValidationError;
exports.AuthenticationError = AuthenticationError;
