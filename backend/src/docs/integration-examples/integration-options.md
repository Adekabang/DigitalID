# Blockchain Identity System - Integration Options

This document outlines the various ways you can integrate with the Blockchain Identity System. Choose the integration method that best suits your application's needs.

## Authentication Integrations

### 1. Sign in with Blockchain Identity (OAuth 2.0 Flow)

The most comprehensive integration method. Allow users to authenticate to your application using their blockchain identities.

**Best for:** Web applications, mobile apps, and platforms that need user authentication.

**Features:**
- Full OAuth 2.0 authorization code flow
- Access to user verification level and reputation score
- Token-based authentication with refresh capability
- User profile information access

**Implementation:**
- [Complete integration guide](./sign-in-with-blockchain-identity.md)
- [Demo application](./demo-app/README.md)

**Example use cases:**
- User login for Web3 applications
- KYC-compliant services
- Reputation-gated communities
- Decentralized identity verification

### 2. Direct API Integration (API Key Auth)

For applications that need to query blockchain identity data without user authentication.

**Best for:** Backend services, analytics platforms, and data integrations.

**Features:**
- Direct API access via API keys
- Query identity information by address
- Check verification status and reputation
- Rate-limited based on your application tier

**Implementation:**
- Request an API key through the admin dashboard
- Use the API key in your requests via the `X-API-Key` header
- Access the REST API endpoints directly

**Example use cases:**
- Risk assessment services
- Reputation monitoring
- Verification status checking
- Data analysis and reporting

### 3. Web3 Signature Verification

For dApps that want to verify a user's blockchain identity without redirecting to an OAuth flow.

**Best for:** Decentralized applications, crypto wallets, and blockchain-native services.

**Features:**
- Local signature verification
- No redirects required
- Entirely on-chain verification
- Compatible with any Web3 wallet

**Implementation:**
- Request a user to sign a message with their wallet
- Verify the signature on-chain using the provided smart contracts
- Check identity status and reputation on-chain

**Example use cases:**
- dApps with MetaMask or similar wallet integration
- Smart contract interactions requiring identity verification
- Blockchain-native applications

## Data Integration Options

### 1. RESTful API Endpoints

Access blockchain identity data via REST API endpoints.

**Best for:** Web applications, mobile apps, and traditional backends.

**Endpoints include:**
- Identity information
- Verification status
- Reputation scores
- Moderation status

**Implementation:**
- Authenticate with API key or OAuth token
- Make HTTPS requests to the API endpoints
- Process JSON responses in your application

### 2. On-chain Integration

Interact directly with the blockchain identity smart contracts.

**Best for:** Other smart contracts, blockchain-native applications.

**Features:**
- Direct contract calls
- Gas-efficient verification
- No centralized API dependency
- Fully decentralized operation

**Implementation:**
- Import contract interfaces (e.g., `IDigitalIdentityNFT.sol`)
- Make contract calls to verify identity and reputation
- Setup event listeners for identity updates

### 3. Webhook Notifications

Receive real-time updates about identity changes.

**Best for:** Applications requiring real-time data and notifications.

**Event types:**
- Identity creation
- Verification level changes
- Reputation score updates
- Moderation actions

**Implementation:**
- Register a webhook URL in the admin dashboard
- Configure the events you want to receive
- Implement an endpoint to process webhook payloads
- Verify webhook signatures for security

## Enterprise Integration

For enterprise customers requiring custom integration solutions.

**Options include:**
- Dedicated API endpoints with higher rate limits
- Custom webhook configurations
- Private identity verification bridges
- Customized verification levels
- White-labeled UI components

Please contact the enterprise support team to discuss your specific integration needs.

## Development Resources

- [API Documentation](../swagger.json)
- [Authentication Guide](./sign-in-with-blockchain-identity.md)
- [Sample Integration Demo](./demo-app/README.md)
- [Smart Contract Interfaces](../../../contracts/IDigitalIdentityNFT.sol)

For technical support with integrations, please contact support@blockchain-identity.com.