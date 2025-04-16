# Blockchain Identity System: Project Brief

This document outlines the system architecture, process flows, and implementation details for the blockchain-based digital identity system as it currently exists in the codebase.

---

# 1. System Architecture Overview

### **A. Core Blockchain Layer**

-   **DigitalIdentityNFT Smart Contract:**
    -   **Function:** Mint unique, non-transferable tokens to represent user identities.
    -   **Features:**
        -   Contains Decentralized Identity (DID) metadata.
        -   Enforces "one identity per individual" via KYC/verification data.
        -   Multi-verifier security for verification level upgrades.

-   **VerificationRegistry Smart Contract:**
    -   **Function:** Records and manages verification claims for digital identities.
    -   **Features:**
        -   Stores verification data with expiration dates.
        -   Manages different verification types and their associated metadata.

-   **ReputationSystem Smart Contract:**
    -   **Function:** Manage and update users' reputation scores based on behavior events.
    -   **Scoring Mechanism:**
        -   Users start with an initial score of 100 points.
        -   Points are adjusted based on user actions (positive or negative).
        -   Decay over time implemented with configurable rate.
        -   Activity multiplier for more engaged users.
    -   **Threshold System:**
        -   BAN_THRESHOLD = 50 (users below this score become banned)
        -   WARNING_THRESHOLD = 70
        -   RESTRICTION_THRESHOLD = 50
        -   SEVERE_RESTRICTION_THRESHOLD = 30
        -   MIN_SCORE = 0, MAX_SCORE = 1000

-   **ModeratorControl Smart Contract:**
    -   **Function:** Enforce access control and moderation rules based on reputation scores.
    -   **Features:**
        -   Role-based access control (MODERATOR_ROLE, ORACLE_ROLE)
        -   Moderation case management
        -   Reputation score adjustments based on moderation actions

-   **AppealSystem Smart Contract:**
    -   **Function:** Allows users to appeal moderation decisions.
    -   **Features:**
        -   Appeal submission and processing
        -   Integration with ModeratorControl for restriction removal

-   **MultiFactorAuth Smart Contract:**
    -   **Function:** Provides additional security layers for high-value operations.
    -   **Features:**
        -   Supports various authentication methods (email, phone, authenticator, biometric, hardware key)
        -   Session management and verification

---

### **B. Off-Chain Components and External Integrations**

-   **Oracle Service:**
    -   **Function:** Securely brings external data onto the blockchain for:
        -   KYC/verification of new registrations.
        -   Processing verification claims from multiple verifiers.
    -   **Security Feature:** Implements a dual-verifier model requiring two different verifiers for high-level verification.
    -   **API:** RESTful endpoints with Swagger UI documentation available at /docs.

-   **Backend API:**
    -   **Function:**
        -   Provides RESTful endpoints for interacting with the blockchain.
        -   Manages authentication and authorization through JWT tokens.
        -   Handles BigInt serialization for blockchain data.
    -   **Integration:**
        -   Connects to the blockchain via ethers.js.
        -   Offers comprehensive endpoints for identity, verification, reputation, and appeals.

-   **API Gateway:**
    -   **Function:**
        -   Provides authenticated access for third-party applications.
        -   Allows external systems to query users' verification status and reputation.
    -   **Security:**
        -   Uses API keys to control access.
        -   Implements rate limiting and security headers.

---

### **C. User & Integration Interfaces**

-   **Demo Application:**
    -   **Purpose:**
        -   Demonstrates "Sign-in with Blockchain Identity" using MetaMask.
        -   Shows integration patterns for third-party applications.
        -   Provides OAuth-like authentication flow.

-   **Messenger Application:**
    -   **Purpose:**
        -   Real-time messaging application built on the identity system.
        -   Demonstrates verification level display and reputation badges.
        -   Implements reputation-based feature access:
            - Score ≥ 80: "Trusted User" badge, all features
            - Score ≥ 50: "Regular User" badge, standard features
            - Score < 50: "Banned User" badge, cannot send messages
        -   Includes user reporting system that affects reputation scores.

---

### **D. Architecture Diagram**

```
                           +---------------------+
                           |   External KYC &    |
                           |  Verification APIs  |
                           +----------+----------+
                                      |
                                      v
  +------------------+      +------------------+       +------------------+
  | Third-Party Apps |<---->|  Backend APIs    |<----->|  Oracle Service  |
  | (Demo & Messenger)|      |(Identity & Auth) |       |(Verification)   |
  +------------------+      +---------+--------+       +--------+---------+
                                       |                        |
     +---------------------------------+------------------------+
     |                                 |                        |
     v                                 v                        v
+----+--------+              +--------+---------+      +-------+--------+
| Digital ID  |              | Verification     |      | Reputation,    |
| NFT Contract|<------------>| Registry Contract|<---->| Appeals, MFA,  |
| (ERC-721)   |              |                  |      | Moderator      |
+-------------+              +------------------+      +----------------+
      ^                                                          |
      |                                                          |
+-----+-----------------------------------------------------------+
|                                                                  |
|                     Ethereum Blockchain                          |
+------------------------------------------------------------------+
```

**Explanation:**

1. **External KYC Sources:** KYC providers and verification services connect via the Oracle service.
2. **Service Layer:**
   - The **Oracle Service** handles verification processes with multi-verifier security.
   - The **Backend APIs** provide RESTful interfaces for identity management, authentication, and verification.
   - **Third-Party Apps** like the Demo and Messenger apps demonstrate integration patterns.
3. **Blockchain Layer:**
   - The **Digital Identity NFT Contract** manages user identities as ERC-721 tokens.
   - The **Verification Registry Contract** records verification claims.
   - Supporting contracts handle **Reputation, Appeals, MFA, and Moderation** functions.

---

# 2. Process Flows

Below are detailed process flows for each key mechanism:

---

### **A. Verification Flow with Multi-Verifier Security**

1. **User Registration and Identity Creation:**
   - User authenticates with the Backend API using their Ethereum wallet.
   - Backend creates a new digital identity through the DigitalIdentityNFT contract.
   - The identity starts with UNVERIFIED (level 0) status.

2. **First Verification (Basic):**
   - User submits verification request to the Oracle service.
   - Oracle processes verification through the mock KYC provider.
   - Oracle (acting as first verifier) calls the verify method on VerificationRegistry.
   - Oracle approves the identity to BASIC_VERIFIED (level 1) in DigitalIdentityNFT.

3. **Second Verification (KYC Level):**
   - A second verification request is submitted with the token ID.
   - Oracle uses a different verifier wallet (security feature).
   - Second verifier calls approveVerification to upgrade to KYC_VERIFIED (level 2).
   - The multi-verifier security check ensures two different verifiers approved.

4. **Verification Status Use:**
   - External applications query the verification level through the Backend API.
   - Applications grant access based on verification level requirements.

```
┌─────────────────┐                 ┌───────────────┐                 ┌───────────────────┐                 ┌───────────────────┐
│                 │                 │               │                 │                   │                 │                   │
│      User       │                 │  Backend API  │                 │   Oracle Service  │                 │    Blockchain     │
│                 │                 │               │                 │                   │                 │                   │
└──────┬──────────┘                 └────┬──────────┘                 └─────────┬─────────┘                 └────────┬──────────┘
       │                                  │                                     │                                    │
       │ 1. Authenticate with Wallet      │                                     │                                    │
       │─────────────────────────────────>│                                     │                                    │
       │                                  │                                     │                                    │
       │ 2. Create identity request       │                                     │                                    │
       │─────────────────────────────────>│                                     │                                    │
       │                                  │ 3. Create digital identity          │                                    │
       │                                  │────────────────────────────────────────────────────────────────────────>│
       │                                  │                                     │                                    │
       │ 4. Request basic verification    │                                     │                                    │
       │────────────────────────────────────────────────────────────────────────>                                   │
       │                                  │                                     │ 5. Process KYC (first verifier)    │
       │                                  │                                     │───────────────────────────────────>│
       │                                  │                                     │                                    │
       │                                  │                                     │ 6. Approve to BASIC_VERIFIED      │
       │                                  │                                     │───────────────────────────────────>│
       │                                  │                                     │                                    │
       │ 7. Request second verification   │                                     │                                    │
       │────────────────────────────────────────────────────────────────────────>                                   │
       │                                  │                                     │                                    │
       │                                  │                                     │ 8. Process with second verifier    │
       │                                  │                                     │───────────────────────────────────>│
       │                                  │                                     │                                    │
       │                                  │                                     │ 9. Upgrade to KYC_VERIFIED        │
       │                                  │                                     │───────────────────────────────────>│
       │                                  │                                     │                                    │
       │ 10. Query verification status    │                                     │                                    │
       │─────────────────────────────────>│                                     │                                    │
       │                                  │ 11. Get verification level          │                                    │
       │                                  │────────────────────────────────────────────────────────────────────────>│
       │                                  │                                     │                                    │
       │ 12. Return verification level    │                                     │                                    │
       │<─────────────────────────────────│                                     │                                    │
       │                                  │                                     │                                    │
```

---

### **B. Reputation Management Flow**

1. **Reputation Initialization:**
   - When a digital identity is created, a neutral reputation score (100) is initialized.
   - The reputation record is linked to the user's digital identity token.

2. **Reputation Updates:**
   - ModeratorControl applies reputation adjustments based on user actions:
     - WARNING: -10 points
     - RESTRICTION: -25 points
     - SEVERE_RESTRICTION: -50 points
     - BAN: -100 points
   - The Messenger App demo allows users to report others, applying -10 points per report.

3. **Threshold Enforcement:**
   - ModeratorControl evaluates user reputation against thresholds:
     - Below 30: SEVERE_RESTRICTION applied
     - Below 50: RESTRICTION applied (user becomes banned)
     - Below 70: WARNING applied
   - In the Messenger App, users with scores below 50 cannot send messages.

4. **Appeal Process:**
   - Users can submit appeals against negative reputation actions through AppealSystem.
   - Moderators review appeals and can remove restrictions.

5. **Reputation Decay:**
   - ReputationSystem applies a decay rate over time (default 1% per 30 days).
   - Decay helps ensure reputation reflects recent behavior.

```
┌─────────────────┐               ┌───────────────┐               ┌───────────────────┐               ┌───────────────────┐
│                 │               │               │               │                   │               │                   │
│      User       │               │ Messenger App │               │   Backend API     │               │    Blockchain     │
│                 │               │               │               │                   │               │                   │
└──────┬──────────┘               └────┬──────────┘               └─────────┬─────────┘               └────────┬──────────┘
       │                                │                                   │                                  │
       │ 1. User sends harmful message  │                                   │                                  │
       │───────────────────────────────>│                                   │                                  │
       │                                │                                   │                                  │
       │ 2. Another user reports message│                                   │                                  │
       │───────────────────────────────>│                                   │                                  │
       │                                │                                   │                                  │
       │                                │ 3. Create moderation case         │                                  │
       │                                │──────────────────────────────────>│                                  │
       │                                │                                   │                                  │
       │                                │                                   │ 4. Apply moderation action       │
       │                                │                                   │────────────────────────────────>│
       │                                │                                   │                                  │
       │                                │ 5. Update reputation score        │                                  │
       │                                │──────────────────────────────────>│                                  │
       │                                │                                   │                                  │
       │                                │                                   │ 6. Reduce score by 10 points     │
       │                                │                                   │────────────────────────────────>│
       │                                │                                   │                                  │
       │                                │                                   │ 7. Check against thresholds      │
       │                                │                                   │────────────────────────────────>│
       │                                │                                   │                                  │
       │                                │ 8. Notify client of score update  │                                  │
       │                                │<──────────────────────────────────│                                  │
       │                                │                                   │                                  │
       │ 9. User sees reputation reduced│                                   │                                  │
       │<───────────────────────────────│                                   │                                  │
       │                                │                                   │                                  │
       │ 10. User abilities restricted  │                                   │                                  │
       │ if score below 50              │                                   │                                  │
       │<───────────────────────────────│                                   │                                  │
       │                                │                                   │                                  │
```

---

### **C. Authentication and Sign-In with Blockchain Identity**

1. **User Initiates Authentication:**
   - User connects their Ethereum wallet to the application.
   - Application requests signature of a timestamped message.

2. **Backend Verification:**
   - Signature and user address are sent to Backend API.
   - Backend verifies the signature and checks for a valid digital identity.
   - Backend queries verification level and reputation score.

3. **JWT Token Issuance:**
   - On successful verification, Backend issues a JWT token.
   - Token includes verification level and reputation information.

4. **Application Access:**
   - Application uses the JWT for API access.
   - Application adjusts user experience based on verification level.
   - Reputation score determines feature access and permissions.

```
┌─────────────────┐               ┌───────────────┐               ┌───────────────────┐               ┌───────────────────┐
│                 │               │               │               │                   │               │                   │
│      User       │               │ Demo/Messenger│               │   Backend API     │               │    Blockchain     │
│                 │               │   App         │               │                   │               │                   │
└──────┬──────────┘               └────┬──────────┘               └─────────┬─────────┘               └────────┬──────────┘
       │                                │                                   │                                  │
       │ 1. Connect wallet              │                                   │                                  │
       │───────────────────────────────>│                                   │                                  │
       │                                │                                   │                                  │
       │ 2. Request message signature   │                                   │                                  │
       │<───────────────────────────────│                                   │                                  │
       │                                │                                   │                                  │
       │ 3. Sign authentication message │                                   │                                  │
       │───────────────────────────────>│                                   │                                  │
       │                                │                                   │                                  │
       │                                │ 4. Submit credentials             │                                  │
       │                                │──────────────────────────────────>│                                  │
       │                                │                                   │                                  │
       │                                │                                   │ 5. Verify signature              │
       │                                │                                   │                                  │
       │                                │                                   │ 6. Check identity exists         │
       │                                │                                   │────────────────────────────────>│
       │                                │                                   │                                  │
       │                                │                                   │ 7. Get verification level        │
       │                                │                                   │────────────────────────────────>│
       │                                │                                   │                                  │
       │                                │                                   │ 8. Get reputation score          │
       │                                │                                   │────────────────────────────────>│
       │                                │                                   │                                  │
       │                                │ 9. Issue JWT token                │                                  │
       │                                │<──────────────────────────────────│                                  │
       │                                │                                   │                                  │
       │ 10. Authentication successful  │                                   │                                  │
       │<───────────────────────────────│                                   │                                  │
       │                                │                                   │                                  │
       │ 11. Access application         │                                   │                                  │
       │───────────────────────────────>│                                   │                                  │
       │                                │                                   │                                  │
       │                                │ 12. API requests with JWT token   │                                  │
       │                                │──────────────────────────────────>│                                  │
       │                                │                                   │                                  │
```

---

# 3. Implementation

The system is implemented with the following components:

### A. Smart Contracts 

- **Technology Stack:** Solidity, Hardhat
- **Key Contracts:**
  - `DigitalIdentityNFT.sol`: ERC-721 NFT for digital identities
  - `VerificationRegistry.sol`: Stores verification claims
  - `ReputationSystem.sol`: Manages user reputation scores
  - `ModeratorControl.sol`: Handles moderation actions
  - `AppealSystem.sol`: Manages appeals against moderation
  - `MultiFactorAuth.sol`: Provides additional authentication options

### B. Backend API

- **Technology Stack:** Node.js, Express.js, ethers.js
- **Key Components:**
  - RESTful API endpoints for identity management
  - JWT-based authentication
  - Integration with Ethereum blockchain
  - BigInt serialization for blockchain data

### C. Oracle Service

- **Technology Stack:** Node.js, Express.js, ethers.js
- **Key Features:**
  - Verification request processing
  - Multi-verifier security model
  - Mock KYC provider integration
  - Blockchain event monitoring
  - Swagger UI documentation for API at /docs endpoint

### D. Demo and Integration Apps

- **Technology Stack:** HTML, CSS, JavaScript, Node.js
- **Demo App:** Sign-in with Blockchain Identity example
- **Messenger App:** Real-time messaging with reputation-based features:
  - Reputation badges for users (Trusted/Regular/Banned)
  - Reporting system that affects user reputation
  - Feature restrictions based on reputation thresholds
  - Real-time reputation updates

---

# 4. Presentation Guide

## A. Presentation Structure

### 1. Introduction (3 minutes)
- **Project Overview:** Blockchain-based digital identity system with verification, reputation, and moderation features
- **Problem Statement:** Identity verification, trust, and interoperability challenges in web3

### 2. System Architecture (4 minutes)
- **Core Components:** Smart contracts, Backend API, Oracle service, Integration apps
- **Architecture Diagram:** Visual explanation of system components and their interactions
- **Security Features:** Multi-verifier approach, JWT authentication, API security

### 3. Smart Contracts Deep Dive (4 minutes)
- **DigitalIdentityNFT:** ERC-721 implementation with verification levels
- **Verification Security:** Multi-verifier requirement for level upgrades
- **ReputationSystem:** Score management with decay, thresholds, and reporting

### 4. Verification Flow Demo (4 minutes)
- **Registration Process:** Creating a digital identity
- **Verification Process:** Basic and KYC verification with multi-verifier security
- **API Endpoint Usage:** Demonstrating verification API calls

### 5. Reputation System (4 minutes)
- **Current Implementation:** Scoring system with WARNING/RESTRICTION/SEVERE_RESTRICTION/BAN
- **Moderation Controls:** How moderation actions affect reputation
- **Threshold System:** Effects at scores below 70, 50, and 30

### 6. Third-Party Integration (4 minutes)
- **Authentication Flow:** Sign-in with Blockchain Identity
- **Messenger App Demo:** Real-time messaging with reputation-based features
- **Integration Patterns:** How third parties can leverage the system

### 7. Scalability and Future Work (2 minutes)
- **Future Enhancements:** Additional verification methods, enhanced reputation algorithms
- **Ecosystem Expansion:** Broader integration opportunities

### 8. Q&A (5 minutes)
- **Audience Questions:** Address questions about implementation, design choices, and use cases

## B. Demo Script

### Demo 1: Identity Creation and Verification
1. Show authentication with MetaMask
2. Create a new digital identity
3. Request basic verification
4. Show the verification status change
5. Request second-verifier approval
6. Demonstrate the KYC verification level upgrade
7. Show the transaction history on the blockchain

### Demo 2: Reputation System in Messenger App
1. Display a user's initial reputation score (100 points)
2. Show the reputation badge in the Messenger UI ("Trusted User")
3. Demonstrate the reporting feature:
   - Report a user for harmful content
   - Show the reputation score decreasing
   - Demonstrate how the badge changes
4. Show restricted functionality when score drops below 50
   - Message input becomes disabled
   - "Banned User" badge appears

### Demo 3: Sign-in with Blockchain Identity
1. Connect wallet to demo application
2. Sign the authentication message
3. Show successful login with verification level
4. Display different access levels based on verification status

## C. Key Talking Points

### Technical Innovation
- Multi-verifier security model for enhanced trust
- Non-transferable NFT implementation for digital identity
- Reputation system with automatic moderation triggers

### Business Value
- Reduced KYC redundancy across platforms
- Portable digital identity with verification levels
- Transparent reputation system across applications

### Security Features
- Multi-verifier requirement for high verification levels
- Secure JWT token implementation
- BigInt handling for blockchain data
- API rate limiting and security headers

### Scalability Approach
- Smart contract optimization for gas efficiency
- Backend API designed for horizontal scaling
- Oracle service with reliable blockchain event handling

---

# 5. Summary

This blockchain identity system provides a working solution for digital identity verification, reputation management, and third-party integration. The current implementation focuses on core functionality with the following key features:

### Multi-Level Security
- Dual-verifier security requiring two different verifiers for KYC verification
- JWT-based authentication with Ethereum signature verification
- Role-based access control in smart contracts

### Reputation Management
- Current implementation tracks user behavior with scores from 0-1000
- Default initial score of 100 for all users
- Ban threshold at 50 points with restricted functionality
- Moderation actions automatically affect reputation scores
- Time-based decay mechanism to reflect recent behavior

### Integration Examples
- Working "Sign-in with Blockchain Identity" flow with MetaMask
- Messenger application demonstrating reputation-based access control
- Complete API documentation with Swagger UI support

### Next Steps
- Further development of the reputation tier system
- Enhanced appeal and rehabilitation mechanisms
- Additional KYC provider integrations