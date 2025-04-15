# Blockchain Identity System - Backend

This is the backend service for the Blockchain Identity System, providing RESTful APIs for managing digital identities, reputation, and verification on the blockchain.

## Features

- Complete blockchain-based identity management
- JWT authentication with Ethereum signatures
- Multi-factor authentication
- Reputation system
- Moderation capabilities
- Appeal system
- API Gateway for third-party integration

## Getting Started

### Prerequisites

- Node.js v16+
- Ethereum network (local or testnet)
- MongoDB (optional)

### Installation

1. Clone the repository
2. Navigate to the backend directory
3. Install dependencies:

```bash
npm install
```

4. Create a `.env` file with the following content:

```
PORT=3000
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=30d
RPC_URL=your_ethereum_rpc_url
PRIVATE_KEY=your_ethereum_private_key
NODE_ENV=development
```

5. Start the server:

```bash
npm run dev
```

## API Documentation

The API documentation is available via Swagger UI when the server is running:

```
http://localhost:3000/api-docs
```

You can also access the raw Swagger JSON at:

```
http://localhost:3000/api-docs/json
```

## Authentication

### JWT Authentication

The API uses JWT tokens for authentication. To get a token:

1. Generate a signature using your Ethereum wallet by signing a message: `Authenticate to Identity System: {timestamp}`
2. Send a POST request to `/api/auth/login` with:
   - `address`: Your Ethereum address
   - `signature`: The signature you generated
   - `timestamp`: The Unix timestamp used in the message

### API Key Authentication (Gateway)

For third-party integrations, use API key authentication:

1. Get an API key in development:
   - Make a GET request to `/api/system/devkey`

2. In production, an admin must generate an API key:
   - Make a POST request to `/api/system/apikeys` with:
     - `clientId`: Client identifier
     - `clientName`: Name of the client
     - `permissions`: Array of permissions

3. Use the API key in requests to gateway endpoints by adding the header:
   - `X-API-Key: your_api_key`

## Key Endpoints

### Authentication

- `POST /api/auth/login` - Login with Ethereum signature
- `POST /api/auth/refresh` - Refresh access token

### Identity

- `GET /api/identity/:address` - Get identity details
- `POST /api/identity/create` - Create a new identity

### Gateway

- `GET /gateway/identity/:address` - Get identity details
- `GET /gateway/reputation/:address` - Get reputation score
- `POST /gateway/authenticate` - Authenticate a user

### System

- `GET /api/system/health` - Check system health
- `GET /api/system/stats` - Get system statistics

## License

MIT