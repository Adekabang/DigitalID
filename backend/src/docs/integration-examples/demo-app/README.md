# "Sign in with Blockchain Identity" Demo App

This is a simple demonstration app showing how to integrate the "Sign in with Blockchain Identity" feature into your web application.

## Overview

This demo app consists of:

1. A frontend implementation showing the integration of the blockchain wallet authentication flow
2. A backend server that handles OAuth callbacks and token exchange
3. Sample API endpoints for retrieving user profile information

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Web3 wallet (MetaMask) installed in your browser
- The Blockchain Identity System running at http://localhost:3000

### Manual Setup (Required)

1. Install dependencies:

```bash
npm install
```

2. Get an API key from the Blockchain Identity System:
   - With the Blockchain Identity System running on localhost:3000, visit:
   - http://localhost:3000/api/system/devkey (in development mode)
   - This will give you an API key for development purposes

3. Replace the API key in the demo app:
   - Open `server.js` 
   - Replace the placeholder `YOUR_API_KEY_HERE` with your real API key on line 15
   - Note: In a production app, you'd store this in an environment variable

4. Register the demo app as an OAuth client:
   - This step typically requires admin access to the Blockchain Identity System
   - For this demo, the backend is already configured to accept "demo-app-123" as a valid client_id
   - The client_id and client_secret in server.js should match the ones registered in the system

5. Start the demo server:

```bash
node server.js
```

6. Open your browser and navigate to `http://localhost:3001`

7. Make sure your MetaMask wallet is connected to the same network as the one used by the Blockchain Identity System

## Demo Features

- **"Sign in with Blockchain Identity" button** - Simulates connecting to a Web3 wallet
- **Mock wallet authentication** - Simulates the wallet signature process
- **OAuth flow demonstration** - Shows the authorization code flow
- **User profile display** - Shows the blockchain identity information
- **Logout functionality** - Clears the session

## Implementation Notes

For simplicity, this demo uses simulated responses and does not make actual API calls to the Blockchain Identity System. In a real implementation, you would:

1. Configure your application with real API keys and client credentials
2. Make actual API calls to the Blockchain Identity System endpoints
3. Implement proper error handling and security measures

## Structure

- `index.html` - Frontend demo application with UI and client-side logic
- `server.js` - Simple Express server with OAuth callback handling
- `public/` - Static assets for the demo app

## Security Considerations

In a production environment, you should:

1. Use HTTPS for all communications
2. Store session data in a secure, production-ready store
3. Implement proper CSRF protection
4. Never expose your client secret in client-side code
5. Validate all inputs on both client and server sides
6. Implement proper rate limiting

## Support

If you have questions about this demo or need help with integration, please refer to the main documentation or contact the blockchain identity support team.