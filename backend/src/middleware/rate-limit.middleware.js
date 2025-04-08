const rateLimit = require('express-rate-limit');

const createRateLimiter = (
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            success: false,
            error: 'Too many requests, please try again later.',
        },
    });
};

module.exports = {
    createRateLimiter,
    // Specific limiters for different endpoints
    authLimiter: createRateLimiter(15 * 60 * 1000, 5), // 5 requests per 15 minutes for auth
    apiLimiter: createRateLimiter(15 * 60 * 1000, 100), // 100 requests per 15 minutes for API
};
