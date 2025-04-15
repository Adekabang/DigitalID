# Blockchain Identity Oracle Service

This is the off-chain oracle service for the Blockchain Identity System. It handles verification processes, KYC bridges, and automated event monitoring.

## Understanding the Verification Flow

The verification process involves two separate contracts:

1. **VerificationRegistry** - Tracks verification requests and stores verification status
2. **DigitalIdentityNFT** - Represents user identities and their verification levels

The complete verification flow is:

1. User requests KYC verification in the `VerificationRegistry` contract
2. Oracle detects the verification request
3. Oracle processes the verification (KYC, document check, etc.)
4. Oracle confirms the verification result in the `VerificationRegistry` contract
5. Oracle updates the verification level in the `DigitalIdentityNFT` contract

**Important Security Feature**: The `DigitalIdentityNFT` contract requires **at least 2 different verifier addresses** to approve before upgrading to KYC_VERIFIED (level 2) or higher. This is a security measure to prevent a single compromised verifier from granting high verification levels.

### Verification Levels

- **UNVERIFIED (0)** - Initial state, no verification
- **BASIC_VERIFIED (1)** - Basic verification, requires 1 verifier
- **KYC_VERIFIED (2)** - KYC verification complete, requires 2 different verifiers
- **FULL_VERIFIED (3)** - Enhanced verification, requires 2 different verifiers

## Features

- **Blockchain Event Monitoring**: Listens for events from the blockchain identity system contracts
- **KYC Verification Bridge**: Connects blockchain identities to external KYC/verification services
- **Verification Processing**: Handles verification requests with configurable providers
- **Scheduled Tasks**: Performs regular checks and maintenance operations
- **API Interface**: Provides REST API for manual management and monitoring

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Access to Ethereum node (via Infura, Alchemy, or local node)
- Contract ABIs from the main blockchain identity system

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy contract ABIs:

```bash
node scripts/copy-abis.js
```

4. Create a `.env` file based on `.env.example`

### Configuration

Configure the service by editing the `.env` file:

```
# Server Configuration
PORT=3030
NODE_ENV=development

# Blockchain Configuration
RPC_URL=http://localhost:8545
PRIVATE_KEY=your_private_key_here
CHAIN_ID=31337

# Add other configuration as needed
```

### Running the Service

Start the service in development mode:

```bash
npm run dev
```

Start the service in production mode:

```bash
npm start
```

## Manual Verification Testing

You can test the complete verification flow using the provided script:

```bash
npx hardhat run scripts/kyc-manual-flow.js --network localhost
```

This script performs all steps:
1. Creates a user identity
2. Requests KYC verification
3. Confirms verification in `VerificationRegistry`
4. First verifier approves to BASIC_VERIFIED level
5. Second verifier approves to KYC_VERIFIED level
6. Verifies the final verification level

Alternatively, use the API endpoints:

```bash
# 1. Create identity
curl -X POST http://localhost:3030/api/identity/create \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "did": "did:ethr:0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "metadata": {
      "name": "Test User",
      "email": "user@example.com"
    }
  }'

# 2. Request verification
curl -X POST http://localhost:3030/api/verifications/mock \
  -H "Content-Type: application/json" \
  -d '{
    "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "verificationType": 0,
    "metadata": {
      "fullName": "Test User",
      "dateOfBirth": "1990-01-01",
      "documentType": "passport",
      "documentId": "AB123456",
      "nationality": "USA"
    }
  }'

# 3. Get token ID
curl http://localhost:3030/api/identity/details?address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

# 4. Add second verifier approval
curl -X POST http://localhost:3030/api/verifications/second-approval \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "1",
    "targetLevel": 2
  }'

# 5. Check final level
curl http://localhost:3030/api/identity/verificationLevel?address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

## Architecture

The oracle service consists of several core components:

### Blockchain Service

Handles all interaction with the blockchain:
- Connects to Ethereum node
- Creates contract instances
- Manages event listeners
- Executes transactions

### Oracle Service

Core service that orchestrates all oracle operations:
- Registers for blockchain events
- Schedules periodic tasks
- Processes verification requests
- Handles event triggers

### KYC Service

Connects to external verification providers:
- Sends verification requests
- Processes verification responses
- Supports multiple verification levels
- Provides mock implementations for testing

### API Controllers

REST API for manual interaction:
- View pending verifications
- Trigger verification processing
- Monitor events
- Configure oracle settings

## API Endpoints

### Identity

- `GET /api/identity/details?address={address}` - Get identity details
- `GET /api/identity/verificationLevel?address={address}` - Get verification level
- `POST /api/identity/create` - Create a new identity

### Verifications

- `GET /api/verifications/pending` - Get list of pending verifications
- `GET /api/verifications/:id` - Get details of a specific verification
- `POST /api/verifications/:id/process` - Manually process a verification
- `POST /api/verifications/mock` - Run a mock verification
- `POST /api/verifications/second-approval` - Add second verifier approval

### Events

- `GET /api/events/:contractName/:eventName` - Get events of specific type
- `POST /api/events/poll` - Force poll for missed events

### Health

- `GET /health` - Get oracle service health status

## Important Notes

1. The oracle only acts as the first verifier in the verification process.
2. A second, different verifier address is needed to upgrade to KYC_VERIFIED level.
3. In production, you would need a secure mechanism for managing the second verifier.
4. For testing, use the `/api/verifications/second-approval` endpoint or the manual script.

## License

MIT