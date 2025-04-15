# Blockchain Identity System

This project implements a decentralized identity system using blockchain technology (Ethereum) and Non-Fungible Tokens (NFTs).

## Project Overview

The system allows users to create and manage their digital identities as NFTs. It includes features for verification, reputation management, multi-factor authentication, and an appeal process. The system also features an off-chain oracle for identity verification and KYC processes.

## Directory Structure

```
blockchain-identity-system/
├── artifacts/            # Compiled contract artifacts (ABI, bytecode)
├── backend/              # Node.js/Express backend API
│   ├── scripts/        # Backend specific utility scripts
│   ├── src/            # Backend source code (server.js, controllers, services)
│   ├── package.json
│   └── ...
├── cache/                # Hardhat cache files
├── contracts/            # Solidity smart contracts
│   ├── DigitalIdentityNFT.sol
│   ├── VerificationRegistry.sol
│   ├── ReputationSystem.sol
│   ├── MultiFactorAuth.sol
│   ├── ModeratorControl.sol
│   ├── AppealSystem.sol
│   └── ...
├── demo-app/             # Example third-party integration app
│   ├── index.html
│   ├── server.js
│   └── ...
├── oracle/               # Off-chain oracle service
│   ├── abis/           # Contract ABIs
│   ├── scripts/        # Oracle utility scripts
│   ├── src/            # Oracle source code
│   │   ├── config/     # Configuration files
│   │   ├── controllers/# API controllers
│   │   ├── services/   # Oracle services
│   │   └── utils/      # Utility functions
│   ├── package.json
│   └── ...
├── node_modules/         # Project dependencies
├── scripts/              # Hardhat deployment and interaction scripts
│   ├── deploy.js
│   └── interact.js
├── test/                 # Smart contract tests
├── .gitignore
├── hardhat.config.js     # Hardhat configuration
├── KODING.md             # AI assistant context
├── package.json
├── README.md             # This file
└── deployed-addresses.json # Addresses of deployed contracts
```

## Core Components

### Smart Contracts (`contracts/`)

-   **DigitalIdentityNFT.sol:** The core ERC721 contract representing user identities as NFTs.
-   **VerificationRegistry.sol:** Manages verification statuses for identities.
-   **ReputationSystem.sol:** Tracks and manages user reputation scores.
-   **MultiFactorAuth.sol:** Implements multi-factor authentication logic.
-   **ModeratorControl.sol:** Defines roles and permissions for moderators.
-   **AppealSystem.sol:** Handles the process for users to appeal moderation decisions.

Managed and tested using the Hardhat development environment.

### Backend API (`backend/`)

-   A Node.js application using the Express framework (`backend/src/server.js`).
-   Provides a RESTful API for interacting with the smart contracts and potentially managing off-chain data.
-   Uses `ethers.js` to communicate with the Ethereum blockchain.
-   Includes routes for identity management, verification, reputation checks, appeals, etc.

### Oracle Service (`oracle/`)

-   Off-chain service for handling identity verification, KYC processes, and blockchain events.
-   Processes verification requests and submits results back to the blockchain.
-   Monitors blockchain events for new identity creation, verification requests, and moderation actions.
-   Integrates with external KYC providers with a pluggable architecture.
-   Provides a RESTful API for verification status checks and callbacks.

### Demo App (`demo-app/`)

-   Simple example application showing third-party integration with the identity system.
-   Implements "Sign in with Blockchain Identity" using MetaMask.
-   Demonstrates OAuth flow and session management.

## Setup & Usage (Combined)

### Prerequisites

-   Node.js (>= 16.x)
-   npm
-   MetaMask extension (for browser testing)

### Installation & Local Blockchain Setup

1.  **Install Root Dependencies:**
    ```bash
    npm i
    ```
2.  **Start Local Hardhat Node:** (Keep this terminal running)
    ```bash
    npx hardhat node
    ```
3.  **Deploy Contracts (in a new terminal):**
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```
    _(This will create `deployed-addresses.json`)_
4.  **Copy Contract ABIs to Oracle:**
    ```bash
    node oracle/scripts/copy-abis.js
    ```

### Backend Setup

1.  **Install Backend Dependencies:**
    ```bash
    cd backend
    npm i
    ```
2.  **Run Backend Server:** (Keep this terminal running)
    ```bash
    npm run dev
    ```
    _(The backend server will start, typically on port 3000)_

### Oracle Setup

1.  **Install Oracle Dependencies:**
    ```bash
    cd oracle
    npm i
    ```
2.  **Set Up Environment:**
    ```bash
    # Copy development environment file
    cp .env.development .env
    ```
3.  **Run Oracle Service:** (Keep this terminal running)
    ```bash
    npm run dev
    ```
    _(The oracle service will start, typically on port 3040)_

### Demo App Setup

1.  **Install Demo App Dependencies:**
    ```bash
    cd demo-app
    npm i
    ```
2.  **Run Demo App:** (Keep this terminal running)
    ```bash
    npm run dev
    ```
    _(The demo app will start, typically on port 3050)_

### Interacting with the System

-   **Hardhat Tasks:** Use `npx hardhat [task]` for contract compilation, testing, etc.

    ```bash
    # Compile contracts
    npx hardhat compile

    # Run contract tests
    npx hardhat test

    # Run a specific test file
    npx hardhat test test/<test_file_name>.js
    ```

-   **Run Scripts:** Execute custom scripts against the deployed contracts.
    ```bash
    # Example:
    npx hardhat run scripts/interact.js --network localhost
    ```
-   **Hardhat Console:** Open an interactive console connected to the network.
    ```bash
    npx hardhat console --network localhost
    ```
-   **Backend API:**
    -   Access API endpoints (defined in `backend/src/server.js` and related files) via `http://localhost:3000`.
    -   Use tools like `curl`, Postman, or a frontend application.
    -   **Authentication Script:** Generate auth headers if needed by backend endpoints.
        ```bash
        # Run from the root directory
        node backend/scripts/generate-auth.js
        ```
-   **Oracle API:**
    -   Access Oracle endpoints (defined in `oracle/src/controllers`) via `http://localhost:3040`.
    -   Check verification status via `/api/verifications/:id`
    -   View health status via `/health`

-   **Demo App:**
    -   Access the demo app in your browser at `http://localhost:3050`
    -   Connect your MetaMask wallet to test the "Sign in with Blockchain Identity" flow

## Development Mode

The system supports a development mode that allows components to work without requiring all parts to be fully operational:

-   **Oracle Service:** Runs in development mode with mock contracts when actual contracts are not available.
-   **KYC Verification:** Uses a mock provider in development that simulates verification processes.
-   **Blockchain Connection:** Falls back to default development addresses and configurations when needed.

To enable development mode, set `NODE_ENV=development` in your `.env` files.

## Verification Flow

The identity verification system utilizes a multi-step, multi-verifier approach to enhance security:

### Verification Levels

- **UNVERIFIED (0)** - Initial state when identity is first created
- **BASIC_VERIFIED (1)** - Basic verification completed, requires 1 verifier
- **KYC_VERIFIED (2)** - KYC verification complete, requires 2 different verifiers
- **FULL_VERIFIED (3)** - Enhanced verification, requires 2 different verifiers

### Security Feature: Multiple Verifier Requirement

The `DigitalIdentityNFT` contract includes a security feature that requires **at least 2 different verifier addresses** to approve before upgrading an identity to KYC_VERIFIED (level 2) or higher. This is a security measure to prevent a single compromised verifier from granting high verification levels.

### Complete Verification Flow

1. **Identity Creation**
   ```bash
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
   ```

2. **Request Verification in VerificationRegistry**
   ```bash
   curl -X POST http://localhost:3030/api/verifications/request \
     -H "Content-Type: application/json" \
     -d '{
       "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
       "verificationType": 0,
       "data": {
         "name": "Test User",
         "document": "passport",
         "documentId": "AB123456"
       }
     }'
   ```

3. **Oracle Processes Verification**
   - Oracle monitors verification requests
   - Processes KYC data (either mock or external provider)
   - Submits verification result to VerificationRegistry

4. **First Verification in DigitalIdentityNFT**
   - After successful verification in VerificationRegistry
   - Oracle (first verifier) approves to BASIC_VERIFIED (level 1) in DigitalIdentityNFT
   - This is automatically handled by the oracle service

5. **Second Verification in DigitalIdentityNFT**
   - Required for KYC_VERIFIED (level 2)
   - Can be triggered via API endpoint:
   ```bash
   curl -X POST http://localhost:3030/api/verifications/second-approval \
     -H "Content-Type: application/json" \
     -d '{
       "tokenId": "1",
       "targetLevel": 2
     }'
   ```

6. **Check Verification Status**
   ```bash
   curl http://localhost:3030/api/identity/verificationLevel?address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
   ```

### Testing with Script

The repository includes a script to test the full verification flow:
```bash
# From project root
node scripts/kyc-manual-flow.js
```

This script demonstrates the complete verification flow including both verifier approvals required to reach KYC_VERIFIED level.

## Testing

-   **Smart Contracts:** See Hardhat Tasks above (`npx hardhat test`).
-   **Backend:** Test API endpoints using Postman or curl.
-   **Oracle:** Test verification flows with the mock KYC provider.
-   **Integration:** Use the demo app to test the full authentication flow.
