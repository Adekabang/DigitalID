# Blockchain Identity Messenger

A simple messenger application that demonstrates integration with the Blockchain Identity System. This application allows users to:

1. Connect their blockchain wallet (MetaMask)
2. Authenticate using their blockchain identity
3. Chat with other users in a common room
4. Report harmful messages
5. See reputation scores affected by community moderation

## Features

- **Blockchain Authentication**: Sign in with your Ethereum wallet
- **Identity Verification**: Display user verification level from the blockchain identity system
- **Reputation System**: Show and update reputation scores based on user behavior
- **Community Moderation**: Allow users to report harmful content
- **Real-time Chat**: Communicate with other users in real-time

## Technical Implementation

The application consists of:

- A client-side application built with HTML, CSS, and vanilla JavaScript
- A server built with Node.js, Express, and Socket.io
- Integration with the Blockchain Identity System for authentication and reputation management

## Prerequisites

- Node.js (>= 16.x)
- npm
- MetaMask extension
- Running instance of the Blockchain Identity System

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3050
   ```

## Integration with Blockchain Identity System

This messenger app demonstrates several integration points with the Blockchain Identity System:

1. **Authentication**: Uses the `/auth/login` endpoint with wallet signatures to authenticate users
2. **Identity Verification**: Retrieves verification level from `/identity/verificationLevel` endpoint
3. **Reputation Management**: Gets and updates user reputation via `/reputation` endpoints
4. **Security**: Uses JWT tokens for secure API calls

## How the Reporting System Works

1. When a user sends a harmful message, other users can report it
2. Reports are sent to the server, which calls the Blockchain Identity System API
3. The reputation score of the reported user is decreased
4. All clients are notified of the reputation change
5. Reputation badge updates in real-time

## Configuration

You can configure the application by modifying the following values in `server.js`:

- `PORT`: The port the application runs on (default: 3050)
- `IDENTITY_API_URL`: The URL of the Blockchain Identity API (default: http://localhost:3000/api)

## Security Considerations

- JWT tokens are stored in localStorage for simplicity, but in a production environment, consider using more secure storage mechanisms
- The JWT verification should use the same secret as your identity system
- The reputation deduction points can be adjusted based on your moderation policy

## License

This example is part of the Blockchain Identity System project.