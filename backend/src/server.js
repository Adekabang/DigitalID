const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const identityRoutes = require('./routes/identity.routes');
const reputationRoutes = require('./routes/reputation.routes');
const moderationRoutes = require('./routes/moderation.routes');
const systemRoutes = require('./routes/system.routes');
const authRoutes = require('./auth/auth.routes');

// Import middleware
const { errorHandler } = require('./middleware/error.middleware');
const { authMiddleware } = require('./middleware/auth.middleware');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ message: 'Blockchain Identity System API' });
});

// Routes
app.use('/api/identity', identityRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/auth', authRoutes);

// Error handling
app.use(errorHandler);

// Handle 404 routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

module.exports = app;
