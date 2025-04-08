const authService = require('./auth.service');
const logger = require('../utils/logger');
const { ValidationError } = require('../middleware/error.middleware');

class AuthController {
  constructor() {
    this.login = this.login.bind(this);
    this.refresh = this.refresh.bind(this);
    this.logout = this.logout.bind(this);
  }

  async login(req, res) {
    try {
      const { signature, address, timestamp } = req.body;

      if (!signature || !address || !timestamp) {
        throw new ValidationError('Signature, address and timestamp are required');
      }

      // Verify timestamp is within 5 minutes
      const now = Math.floor(Date.now() / 1000);
      if (now - parseInt(timestamp) > 300) {
        throw new ValidationError('Signature expired');
      }

      // Verify signature
      const message = `Authenticate to Identity System: ${timestamp}`;
      const isValid = await authService.verifySignature(
        message,
        signature,
        address
      );

      if (!isValid) {
        throw new ValidationError('Invalid signature');
      }

      // Generate tokens
      const payload = {
        address,
        role: 'user', // You can enhance this with role checking logic
        timestamp: now
      };

      const tokens = authService.generateTokens(payload);

      res.json({
        success: true,
        data: tokens
      });

    } catch (error) {
      logger.error('Login error:', error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message
      });
    }
  }

  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new ValidationError('Refresh token is required');
      }

      const tokens = authService.refreshToken(refreshToken);

      res.json({
        success: true,
        data: tokens
      });

    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        error: error.message
      });
    }
  }

  async logout(req, res) {
    try {
      // In a more complex implementation, you might want to blacklist the token
      // or remove it from a token store
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new AuthController();
