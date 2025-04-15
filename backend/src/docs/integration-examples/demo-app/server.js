// Simple Express server for the demo app
const express = require('express');
const path = require('path');
const axios = require('axios');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration (in a real app, these would be environment variables)
const config = {
    apiEndpoint: 'http://localhost:3000', // Blockchain Identity System API endpoint
    clientId: 'demo-app-123',
    clientSecret: 'demo-app-secret-456',
    redirectUri: 'http://localhost:3001/callback', // The OAuth callback URL
    apiKey: '9145274d9ec8a87874446681596cf65df10931bbc11be9f2a344c09d7364c8eb', // ⚠️ Replace with a real API key from your Blockchain Identity System
};

// Log the configuration
console.log('Demo app configuration:');
console.log('- API Endpoint:', config.apiEndpoint);
console.log('- Client ID:', config.clientId);
console.log('- Redirect URI:', config.redirectUri);
console.log('- API Key:', config.apiKey.substring(0, 8) + '...' + config.apiKey.substring(config.apiKey.length - 4));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Use a more robust session configuration for persistence
app.use(
    session({
        secret: 'blockchain-identity-demo-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { 
            secure: false, // set to true if using HTTPS
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        },
        name: 'blockchain_identity_session' // Custom session name
    }),
);

// Add CORS for local development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS',
    );
    res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    next();
});

// Serve the demo app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route to handle the initial authentication request
app.post('/api/start-auth', async (req, res) => {
    try {
        const { address, signature, timestamp, message } = req.body;

        if (!address || !signature || !timestamp || !message) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields',
            });
        }

        // Create the request payload
        const payload = {
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: 'identity.read reputation.read',
            state: Math.random().toString(36).substring(2, 15),
            address,
            signature,
            timestamp,
            message // Include the message that was signed
        };
        
        // Double-check that redirect_uri is set
        if (!payload.redirect_uri) {
            console.error('ERROR: redirect_uri is not set in the payload!');
            return res.status(400).json({
                success: false,
                error: 'Missing redirect_uri in configuration'
            });
        }
        
        // Debug info - log the full payload
        console.log('OAuth authorize request payload:', JSON.stringify(payload, null, 2));

        // Make request to the blockchain identity API to start OAuth flow
        try {
            // Convert payload to URLSearchParams for x-www-form-urlencoded
            const params = new URLSearchParams();
            Object.entries(payload).forEach(([key, value]) => {
                params.append(key, value);
            });
            
            // Try both JSON and form-encoded formats to see which one works
            let authResponse;
            
            try {
                console.log('Trying JSON format first');
                authResponse = await axios.post(
                    `${config.apiEndpoint}/gateway/sso/authorize`,
                    payload,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': config.apiKey,
                            'Accept': 'application/json'
                        },
                    },
                );
            } catch (error) {
                console.log('JSON format failed, trying x-www-form-urlencoded');
                authResponse = await axios.post(
                    `${config.apiEndpoint}/gateway/sso/authorize`,
                    params.toString(),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'X-API-Key': config.apiKey,
                            'Accept': 'application/json'
                        },
                    },
                );
            }

            if (!authResponse.data.success) {
                throw new Error(
                    authResponse.data.error || 'Authorization failed',
                );
            }

            // Return the redirect URL to the client
            res.json({
                success: true,
                redirectUrl: authResponse.data.data.redirect_url,
            });
        } catch (error) {
            console.error('Authorization API error:', error);
            
            // Log detailed error information
            if (error.response) {
                // The request was made and the server responded with a status code
                // that falls out of the range of 2xx
                console.error('Error response data:', error.response.data);
                console.error('Error response status:', error.response.status);
                console.error('Error response headers:', error.response.headers);
            } else if (error.request) {
                // The request was made but no response was received
                console.error('Error request (no response):', error.request);
            } else {
                // Something happened in setting up the request that triggered an Error
                console.error('Error message:', error.message);
            }
            
            res.status(error.response?.status || 500).json({
                success: false,
                error: error.response?.data?.error || error.message,
            });
        }
    } catch (error) {
        console.error('Start auth error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Route to handle OAuth callback
app.get('/callback', async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).send('Missing authorization code');
        }

        console.log(`Received authorization code: ${code}`);

        // Exchange code for token using the real API
        try {
            const tokenResponse = await axios.post(
                `${config.apiEndpoint}/gateway/sso/token`,
                {
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    code,
                    grant_type: 'authorization_code',
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': config.apiKey,
                    },
                },
            );

            if (!tokenResponse.data.success) {
                throw new Error(
                    tokenResponse.data.error || 'Token exchange failed',
                );
            }

            const tokenData = tokenResponse.data.data;

            console.log('Received token data:', tokenData);

            // Store tokens and user info in session
            req.session.blockchainAuth = {
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                userInfo: tokenData.user_info,
            };

            // Redirect back to the main page with a success parameter
            res.redirect('/?login=success');
        } catch (tokenError) {
            console.error('Token exchange error:', tokenError);
            res.status(500).send(
                'Authentication failed: ' +
                    (tokenError.response?.data?.error || tokenError.message),
            );
        }
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send('Error processing callback: ' + error.message);
    }
});

// Initial session check endpoint
app.get('/api/session', (req, res) => {
    if (req.session && req.session.blockchainAuth) {
        console.log('Found existing session:', req.session.blockchainAuth.userInfo.address);
        res.json({
            success: true,
            isAuthenticated: true,
            message: 'User is authenticated from session'
        });
    } else {
        res.json({
            success: true,
            isAuthenticated: false,
            message: 'No active session found'
        });
    }
});

// API endpoint to get user profile
app.get('/api/user/profile', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.session.blockchainAuth) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated',
            });
        }

        // Use the access token to get up-to-date user info
        try {
            const userInfoResponse = await axios.get(
                `${config.apiEndpoint}/gateway/sso/userinfo`,
                {
                    headers: {
                        Authorization: `Bearer ${req.session.blockchainAuth.accessToken}`,
                    },
                },
            );

            if (!userInfoResponse.data.success) {
                throw new Error(
                    userInfoResponse.data.error || 'Failed to fetch user info',
                );
            }

            // Get user info from response
            const userData = userInfoResponse.data.data;
            
            // Add ban status based on reputation score
            if (!userData.is_banned && userData.reputation_score) {
                // For demo purposes - users with reputation below 60 are considered "banned"
                userData.is_banned = parseInt(userData.reputation_score) < 60;
            } else {
                userData.is_banned = false; // Default to not banned
            }
            
            // Update session with latest user info
            req.session.blockchainAuth.userInfo = userData;
            
            // Make sure to save the session
            req.session.save(err => {
                if (err) console.error('Error saving session:', err);
            });

            // Return updated user profile
            res.json({
                success: true,
                data: userData,
            });
        } catch (error) {
            console.error('Error fetching userinfo:', error);

            // As a fallback, return the user info from session if available
            if (req.session.blockchainAuth.userInfo) {
                const userData = req.session.blockchainAuth.userInfo;
                
                // Make sure ban status is included
                if (!userData.is_banned && userData.reputation_score) {
                    userData.is_banned = parseInt(userData.reputation_score) < 60;
                } else if (userData.is_banned === undefined) {
                    userData.is_banned = false;
                }
                
                res.json({
                    success: true,
                    data: userData,
                    note: 'Using cached user data due to API error',
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    // Clear the session
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                error: 'Failed to logout',
            });
        }

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Demo app running at http://localhost:${PORT}`);
    console.log(
        'Use this server to test the "Sign in with Blockchain Identity" flow',
    );
});
