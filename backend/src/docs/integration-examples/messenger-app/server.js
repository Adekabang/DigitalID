/**
 * Messenger App Server
 * A simple chat server that integrates with the blockchain identity system
 */
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Configuration
const PORT = process.env.PORT || 3050;
const IDENTITY_API_URL = 'http://localhost:3000/api'; // Blockchain Identity API
const JWT_SECRET =
    process.env.JWT_SECRET ||
    'it_is_a_secret_key_for_jwt_token_which_is_very_long_completely_random_and_secure'; // Should match backend JWT_SECRET

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Create HTTP server
const server = http.createServer(app);

// Create Socket.io server
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// In-memory storage for messages and user sessions
const messages = [];
const connectedUsers = new Map(); // Maps socket ID to user data

// Middleware to verify JWT token from blockchain identity system
function verifyToken(token) {
    try {
        // Use the configured JWT_SECRET that should match the one in your identity system
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        console.error('Token verification error:', error);
        return null;
    }
}

// Socket.io connection handling
io.use((socket, next) => {
    // Auth token is expected in the auth object
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Authentication token is required'));
    }

    // Verify token
    const user = verifyToken(token);

    if (!user) {
        return next(new Error('Invalid authentication token'));
    }

    // Store user data in socket
    socket.user = user;
    next();
});

io.on('connection', (socket) => {
    const { address } = socket.user;

    // Get user identity info from blockchain system
    fetchUserInfo(address)
        .then((userInfo) => {
            // Store user data
            const userData = {
                address,
                username: userInfo.name || `User-${address.substring(0, 6)}`,
                verificationLevel: userInfo.verificationLevel || 0,
                reputationScore: userInfo.reputationScore || 0,
            };

            connectedUsers.set(socket.id, userData);

            console.log(`User connected: ${userData.username} (${address})`);

            // Broadcast user join
            socket.broadcast.emit('user_joined', {
                username: userData.username,
                address: userData.address,
            });
        })
        .catch((error) => {
            console.error('Error fetching user info:', error);

            // If the user doesn't have a registered identity, disconnect them
            if (error.message === 'User does not have a registered identity') {
                socket.emit('error', { 
                    message: 'You must have a registered identity to use this chat. Please register in the main application.'
                });
                socket.disconnect(true);
                return;
            }
            
            // For other errors, use default values
            const userData = {
                address,
                username: `User-${address.substring(0, 6)}`,
                verificationLevel: 0,
                reputationScore: 0,
            };

            connectedUsers.set(socket.id, userData);
        });

    // Handle incoming messages
    socket.on('send_message', (data) => {
        const { text } = data;
        const userData = connectedUsers.get(socket.id);

        if (!userData) {
            return;
        }

        // Create message object
        const message = {
            id: uuidv4(),
            text,
            sender: userData.username,
            senderAddress: userData.address,
            timestamp: new Date().toISOString(),
            verificationLevel: userData.verificationLevel,
            reputationScore: userData.reputationScore,
        };

        // Store message
        messages.push(message);

        // Broadcast to all clients
        io.emit('message', message);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const userData = connectedUsers.get(socket.id);

        if (userData) {
            console.log(
                `User disconnected: ${userData.username} (${userData.address})`,
            );

            // Broadcast user leave
            socket.broadcast.emit('user_left', {
                username: userData.username,
                address: userData.address,
            });

            // Remove from connected users
            connectedUsers.delete(socket.id);
        }
    });
});

// Fetch user info from blockchain identity system
async function fetchUserInfo(address) {
    try {
        // First check if user has a registered identity
        const identityResponse = await axios.get(
            `${IDENTITY_API_URL}/identity/${address}`,
        );
        
        // If no identity exists, throw an error
        if (!identityResponse.data.success || !identityResponse.data.data) {
            throw new Error('User does not have a registered identity');
        }
        
        // Fetch verification level (already done in identity call)
        const verificationLevel = identityResponse.data.data.verificationLevel || 0;
        
        // Fetch reputation score
        const reputationResponse = await axios.get(
            `${IDENTITY_API_URL}/reputation/${address}`,
        );
        
        return {
            verificationLevel: verificationLevel,
            reputationScore: reputationResponse.data.success 
                ? reputationResponse.data.data 
                : 0,
            name: identityResponse.data.data.metadata?.name || null
        };
    } catch (error) {
        console.error('Error fetching user info:', error);
        
        // Specifically handle the case where the user isn't registered
        if (error.message === 'User does not have a registered identity') {
            throw new Error('User does not have a registered identity');
        }
        
        // For other errors, return default values
        return {
            verificationLevel: 0,
            reputationScore: 0,
            name: null,
        };
    }
}

// API Routes

// Get all messages
app.get('/api/messages', (req, res) => {
    // In a real app, you might want to paginate and limit the number of messages
    res.json({
        success: true,
        data: messages.slice(-50), // Return last 50 messages
    });
});

// Report message
app.post('/api/report', async (req, res) => {
    try {
        const { messageId, reason, userAddress } = req.body;
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        // Verify token
        const user = verifyToken(token);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication token',
            });
        }

        // Find message
        const message = messages.find((msg) => msg.id === messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                error: 'Message not found',
            });
        }

        // Call blockchain identity API to update reputation
        const reputationResponse = await axios.post(
            `${IDENTITY_API_URL}/reputation/update`,
            {
                address: userAddress,
                points: -10, // Deduct 10 points for harmful content
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        );

        if (!reputationResponse.data.success) {
            throw new Error(
                reputationResponse.data.error || 'Failed to update reputation',
            );
        }

        // Get updated reputation
        const updatedReputation =
            reputationResponse.data.data.updatedReputation;

        // Notify all clients about reputation update
        io.emit('reputation_update', {
            userAddress,
            newReputation: updatedReputation,
        });

        // Update reputation score for connected user
        for (const [socketId, userData] of connectedUsers.entries()) {
            if (userData.address === userAddress) {
                userData.reputationScore = updatedReputation;
            }
        }

        // Log report
        console.log(
            `Report received: Message ${messageId} reported by ${user.address} for reason: ${reason}`,
        );

        res.json({
            success: true,
            message: 'Report submitted successfully',
            data: {
                updatedReputation,
            },
        });
    } catch (error) {
        console.error('Error processing report:', error);

        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error',
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        usersConnected: connectedUsers.size,
        messagesCount: messages.length,
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Messenger server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to access the application`);
});
