const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    this.generateTokens = this.generateTokens.bind(this);
    this.verifySignature = this.verifySignature.bind(this);
    this.refreshToken = this.refreshToken.bind(this);
  }

  generateTokens(payload) {
    try {
      const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
      });

      const refreshToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
      });

      return { accessToken, refreshToken };
    } catch (error) {
      logger.error('Token generation error:', error);
      throw new Error('Failed to generate tokens');
    }
  }

  async verifySignature(message, signature, address) {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === address.toLowerCase();
    } catch (error) {
      logger.error('Signature verification error:', error);
      return false;
    }
  }

  refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      
      // Generate new tokens
      const payload = {
        id: decoded.id,
        address: decoded.address,
        role: decoded.role
      };
      
      return this.generateTokens(payload);
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw new Error('Invalid refresh token');
    }
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      logger.error('Token verification error:', error);
      return null;
    }
  }
}

module.exports = new AuthService();
