# Blockchain Identity System

This project implements a decentralized identity system using blockchain technology (Ethereum) and Non-Fungible Tokens (NFTs).

## Project Overview

The system allows users to create and manage their digital identities as NFTs. It includes features for verification, reputation management, multi-factor authentication, and an appeal process.

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

## Setup & Usage (Combined)

### Prerequisites

-   Node.js (>= recommended version)
-   npm

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

## Testing

-   **Smart Contracts:** See Hardhat Tasks above (`npx hardhat test`).
-   **Backend:** (Add details here if specific backend testing steps exist).
