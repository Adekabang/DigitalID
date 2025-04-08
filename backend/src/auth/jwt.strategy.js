const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const logger = require('../utils/logger');

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
};

const jwtStrategy = new JwtStrategy(options, async (payload, done) => {
  try {
    // Verify if token is not expired
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (payload.exp <= currentTimestamp) {
      return done(null, false, { message: 'Token expired' });
    }

    // Return the user payload
    return done(null, {
      id: payload.id,
      address: payload.address,
      role: payload.role,
      exp: payload.exp
    });
  } catch (error) {
    logger.error('JWT Strategy Error:', error);
    return done(error, false);
  }
});

module.exports = jwtStrategy;
