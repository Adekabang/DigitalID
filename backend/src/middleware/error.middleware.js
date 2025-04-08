const logger = require('../utils/logger');

// Custom error classes
class AppError extends Error {
    constructor(message, statusCode, errorCode) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message) {
        super(message, 400, 'VALIDATION_ERROR');
    }
}

class AuthenticationError extends AppError {
    constructor(message) {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

class AuthorizationError extends AppError {
    constructor(message) {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

class NotFoundError extends AppError {
    constructor(message) {
        super(message, 404, 'NOT_FOUND_ERROR');
    }
}

// Global error handler
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log error
    logger.error('Error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query,
        user: req.user,
    });

    // Specific error handling
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.errorCode,
                message: err.message,
            },
        });
    }

    // Blockchain specific errors
    if (err.message && err.message.includes('transaction failed')) {
        return res.status(400).json({
            success: false,
            error: {
                code: 'BLOCKCHAIN_ERROR',
                message: 'Blockchain transaction failed',
                details:
                    process.env.NODE_ENV === 'development'
                        ? err.message
                        : undefined,
            },
        });
    }

    // Default error response
    res.status(err.statusCode).json({
        success: false,
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message:
                process.env.NODE_ENV === 'development'
                    ? err.message
                    : 'Something went wrong',
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        },
    });
};

module.exports = {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    errorHandler,
};
