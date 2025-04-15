# Blockchain Identity System - Integration Guide

This guide demonstrates how to integrate the Blockchain Identity System into your application using our SSO (Single Sign-On) gateway.

## Overview

The Blockchain Identity System offers a secure way to verify and authenticate users based on their blockchain identity. Integration options include:

1. **Direct API Integration** - Use our REST API with API keys
2. **OAuth 2.0 SSO Integration** - Implement a standardized auth flow

## Prerequisites

- API Key from the Blockchain Identity System
- Client ID and Client Secret for OAuth flows
- HTTPS-enabled redirect URI for your application

## OAuth 2.0 Integration

The Blockchain Identity System implements a standard OAuth 2.0 authorization code flow with some blockchain-specific additions.

### Step 1: Authorization Request

When a user wants to sign in with their blockchain identity, redirect them to our authorization endpoint:

```javascript
// Client-side implementation (JavaScript)
function initiateBlockchainLogin() {
  // User first signs a message with their wallet
  const message = `Login to your-client-id with timestamp: ${Math.floor(Date.now() / 1000)}`;
  
  web3.eth.personal.sign(message, userAddress)
    .then(signature => {
      // Construct authorization request
      const authRequest = {
        client_id: 'your-client-id',
        redirect_uri: 'https://your-app.com/callback',
        response_type: 'code',
        state: generateRandomState(),
        scope: 'identity reputation',
        address: userAddress,
        signature: signature,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Submit to authorization endpoint
      fetch('https://api.identity-system.com/gateway/sso/authorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'your-api-key'
        },
        body: JSON.stringify(authRequest)
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          // Redirect to the provided URL
          window.location.href = data.data.redirect_url;
        } else {
          console.error('Authorization failed:', data.error);
        }
      });
    });
}
```

### Step 2: Handle the Callback

After the user authorizes your application, they will be redirected to your `redirect_uri` with an authorization code:

```javascript
// Server-side implementation (Node.js)
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state to prevent CSRF attacks
  if (state !== storedState) {
    return res.status(400).send('Invalid state parameter');
  }
  
  // Exchange the code for tokens
  try {
    const response = await fetch('https://api.identity-system.com/gateway/sso/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'your-api-key'
      },
      body: JSON.stringify({
        client_id: 'your-client-id',
        client_secret: 'your-client-secret',
        grant_type: 'authorization_code',
        code: code
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Store the tokens securely
      const { access_token, refresh_token, user_info } = data.data;
      
      // Create a session for the user
      req.session.user = {
        address: user_info.address,
        did: user_info.did,
        verificationLevel: user_info.verification_level,
        accessToken: access_token,
        refreshToken: refresh_token
      };
      
      // Redirect to the application
      res.redirect('/dashboard');
    } else {
      res.status(400).send('Token exchange failed: ' + data.error);
    }
  } catch (error) {
    res.status(500).send('An error occurred: ' + error.message);
  }
});
```

### Step 3: Access User Info

You can retrieve additional user information using the access token:

```javascript
// Server-side implementation (Node.js)
async function getUserInfo(accessToken) {
  const response = await fetch('https://api.identity-system.com/gateway/sso/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    return data.data;
  } else {
    throw new Error('Failed to retrieve user info: ' + data.error);
  }
}
```

## Direct API Integration

If you prefer to integrate directly with our API instead of using the OAuth flow:

```javascript
// Example: Verifying a user's identity
async function verifyUserIdentity(address) {
  const response = await fetch(`https://api.identity-system.com/gateway/identity/${address}`, {
    headers: {
      'X-API-Key': 'your-api-key'
    }
  });
  
  const data = await response.json();
  
  if (data.success) {
    return {
      did: data.data.did,
      verificationLevel: data.data.verificationLevel,
      isVerified: data.data.isVerified
    };
  } else {
    throw new Error('Identity verification failed: ' + data.error);
  }
}
```

## Best Practices

1. **Always verify signatures** - Ensure signatures match the expected message format and are valid
2. **Store tokens securely** - Never expose access or refresh tokens to the client-side code
3. **Verify the verification level** - Check that users have the required verification level for sensitive actions
4. **Always check reputation scores** - Users with low reputation scores may present risks
5. **Implement proper error handling** - Handle API errors gracefully in your UI

## Support

If you need assistance with integration, please contact our developer support team at developers@identity-system.com.

---

## API Reference

For complete API documentation, visit our Swagger UI at:
https://api.identity-system.com/api-docs