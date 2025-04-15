# Sign in with Blockchain Identity - Integration Guide

This guide shows how to integrate "Sign in with Blockchain Identity" into your application. It provides step-by-step instructions and code examples for a complete implementation.

## Overview

The "Sign in with Blockchain Identity" feature allows users with blockchain identities to authenticate to your application without creating new credentials. This integration uses OAuth 2.0 flows similar to "Sign in with Google" or "Sign in with Facebook".

## Prerequisites

1. An API key from the Blockchain Identity System
2. Basic knowledge of OAuth 2.0
3. A web application with a frontend and backend

## Integration Steps

### 1. Register Your Application

Contact the system administrators to register your application and obtain:

- Client ID
- Client Secret
- API Key

### 2. Frontend Implementation

#### HTML Button

Add a "Sign in with Blockchain Identity" button to your login page:

```html
<!-- Login page -->
<div class="login-options">
  <button id="blockchain-login-btn" class="blockchain-btn">
    Sign in with Blockchain Identity
  </button>
  <!-- Your other login options -->
</div>
```

#### JavaScript Client

```javascript
// blockchain-auth.js

class BlockchainAuthClient {
  constructor(config) {
    this.apiEndpoint = config.apiEndpoint;
    this.clientId = config.clientId;
    this.redirectUri = config.redirectUri;
    this.apiKey = config.apiKey;
  }

  /**
   * Initialize the auth client
   */
  init() {
    // Add click listener to the login button
    const loginBtn = document.getElementById('blockchain-login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.startLogin());
    }

    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      // Remove code from URL to prevent bookmarking issues
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Exchange code for token
      this.exchangeCodeForToken(code);
    }
  }

  /**
   * Start the login process by connecting to the user's wallet
   */
  async startLogin() {
    try {
      // Check if Web3 is available (MetaMask or similar)
      if (!window.ethereum) {
        alert('Please install MetaMask or another Web3 wallet to continue');
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      const address = accounts[0];
      if (!address) {
        throw new Error('No account selected');
      }
      
      // Generate timestamp for message
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      // Create message to sign
      const message = `Login to ${this.clientId} with timestamp: ${timestamp}`;
      
      // Request signature
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address]
      });
      
      // Initiate OAuth flow
      this.requestAuthorizationCode(address, signature, timestamp);
      
    } catch (error) {
      console.error('Login error:', error);
      alert('Error during login: ' + error.message);
    }
  }

  /**
   * Request an authorization code from the OAuth server
   */
  async requestAuthorizationCode(address, signature, timestamp) {
    try {
      const response = await fetch(`${this.apiEndpoint}/gateway/sso/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          client_id: this.clientId,
          redirect_uri: this.redirectUri,
          response_type: 'code',
          scope: 'identity.read reputation.read',
          state: this.generateRandomState(),
          address,
          signature,
          timestamp
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Authorization failed');
      }
      
      // Redirect to the redirect URL
      window.location.href = data.data.redirect_url;
      
    } catch (error) {
      console.error('Authorization error:', error);
      alert('Error during authorization: ' + error.message);
    }
  }

  /**
   * Exchange the authorization code for a token
   * This should typically be done server-side for security
   */
  async exchangeCodeForToken(code) {
    // In a real implementation, this would be a request to your backend
    // which would then securely exchange the code for a token
    
    // For demo purposes, we're alerting that we got the code
    alert(`Authorization code received: ${code}. In a real application, this would be sent to your backend.`);
    
    // Redirect to a logged in page or callback
    const callbackEvent = new CustomEvent('blockchainAuthCodeReceived', {
      detail: { code }
    });
    document.dispatchEvent(callbackEvent);
  }

  /**
   * Generate a random state parameter for CSRF protection
   */
  generateRandomState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
}

// Usage example:
// const authClient = new BlockchainAuthClient({
//   apiEndpoint: 'https://api.blockchain-identity.com',
//   clientId: 'YOUR_CLIENT_ID',
//   redirectUri: 'https://your-app.com/callback',
//   apiKey: 'YOUR_API_KEY'
// });
// authClient.init();
```

### 3. Backend Implementation

Your backend needs to:
1. Receive the authorization code from the frontend
2. Exchange it for an access token
3. Use the token to fetch user information

#### Node.js Example

```javascript
// Express.js backend example
const express = require('express');
const axios = require('axios');
const session = require('express-session');
const router = express.Router();

// Configuration
const config = {
  apiEndpoint: process.env.BLOCKCHAIN_API_ENDPOINT,
  clientId: process.env.BLOCKCHAIN_CLIENT_ID,
  clientSecret: process.env.BLOCKCHAIN_CLIENT_SECRET,
  apiKey: process.env.BLOCKCHAIN_API_KEY
};

// Callback route that receives the authorization code
router.get('/auth/blockchain/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }
    
    // Exchange code for token
    const tokenResponse = await axios.post(
      `${config.apiEndpoint}/gateway/sso/token`,
      {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey
        }
      }
    );
    
    if (!tokenResponse.data.success) {
      throw new Error(tokenResponse.data.error || 'Token exchange failed');
    }
    
    const tokenData = tokenResponse.data.data;
    
    // Store tokens and user info in session
    req.session.blockchainAuth = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      userInfo: tokenData.user_info
    };
    
    // Redirect to the user dashboard or home page
    res.redirect('/dashboard');
    
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Protected route example
router.get('/dashboard', (req, res) => {
  // Check if user is authenticated
  if (!req.session.blockchainAuth) {
    return res.redirect('/login');
  }
  
  // Render dashboard with user info
  const userInfo = req.session.blockchainAuth.userInfo;
  res.render('dashboard', { 
    user: {
      address: userInfo.address,
      did: userInfo.did,
      verificationLevel: userInfo.verification_level,
      reputationScore: userInfo.reputation_score
    }
  });
});

// Fetch additional user data if needed
router.get('/api/user/blockchain-profile', async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.session.blockchainAuth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Use the access token to get user info
    const userInfoResponse = await axios.get(
      `${config.apiEndpoint}/gateway/sso/userinfo`,
      {
        headers: {
          'Authorization': `Bearer ${req.session.blockchainAuth.accessToken}`
        }
      }
    );
    
    if (!userInfoResponse.data.success) {
      throw new Error(userInfoResponse.data.error || 'Failed to fetch user info');
    }
    
    // Return user profile data
    res.json({
      success: true,
      data: userInfoResponse.data.data
    });
    
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
```

### 4. Full Integration Flow

1. User clicks "Sign in with Blockchain Identity" button
2. User connects their Web3 wallet and signs a message
3. Your frontend sends the signature to the Blockchain Identity OAuth server
4. OAuth server returns an authorization code via redirect
5. Your frontend sends the code to your backend
6. Your backend exchanges the code for access and refresh tokens
7. Your backend uses the access token to fetch user information
8. User is logged in with their blockchain identity

## Security Considerations

1. **Always exchange the authorization code for tokens on your backend**, never on the frontend
2. Store client secrets securely and never expose them in client-side code
3. Implement CSRF protection using the `state` parameter
4. Verify the integrity of the user's blockchain identity
5. Consider implementing additional security measures for high-security applications

## User Experience Tips

1. Provide clear instructions for users who don't have a blockchain wallet
2. Show a loading indicator during wallet connection and authentication
3. Handle errors gracefully with user-friendly messages
4. Consider offering traditional login methods alongside blockchain authentication
5. Display verification level and reputation score to build trust

## Support

If you encounter any issues with this integration, please contact our support team at support@blockchain-identity.com.