# Digital Identity Verification Flow

This document provides a comprehensive explanation of the verification flow in the Blockchain Identity System, focusing on the multi-verifier security feature that requires at least 2 different verifiers to upgrade an identity to KYC_VERIFIED level or higher.

## Verification Levels

The system supports four verification levels:

1. **UNVERIFIED (0)** - Initial state when an identity is first created
2. **BASIC_VERIFIED (1)** - Basic verification completed, requires 1 verifier approval
3. **KYC_VERIFIED (2)** - KYC verification complete, requires 2 different verifier approvals
4. **FULL_VERIFIED (3)** - Enhanced verification, requires 2 different verifier approvals with additional checks

## Multi-Verifier Security Feature

A key security feature of the DigitalIdentityNFT contract is the requirement for **at least 2 different verifier addresses** to approve before upgrading an identity to KYC_VERIFIED (level 2) or higher. This security mechanism prevents a single compromised verifier from granting high verification levels.

## Components Involved in Verification

### Smart Contracts
1. **VerificationRegistry.sol** - Handles verification requests and maintains a registry of verification claims
2. **DigitalIdentityNFT.sol** - Manages identity tokens and their verification levels

### Services
1. **Oracle Service** - Off-chain service that processes verification requests and interacts with the blockchain
2. **KYC Providers** - External or mock services that perform actual KYC verification

## Detailed Verification Flow

### 1. Identity Creation

An identity is created in the DigitalIdentityNFT contract. Initially, the identity has a verification level of 0 (UNVERIFIED).

```javascript
// Create identity through API
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

### 2. Request Verification

A user requests verification through the VerificationRegistry contract:

```javascript
// Request verification through API
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

The verification request is stored in the VerificationRegistry with a unique verification ID, calculated as:
```
verificationId = keccak256(userAddress, verificationType)
```

### 3. Oracle Processes Verification

The Oracle service monitors the blockchain for verification requests. When a new request is detected:

1. The Oracle processes the verification data (either through a mock or external KYC provider)
2. The Oracle submits the verification result to the VerificationRegistry

```javascript
// Oracle confirms verification in VerificationRegistry
await verificationContract.connect(oracleAdmin).confirmVerification(
  verificationId,
  true, // isVerified
  resultMetadata
);
```

### 4. First Verifier Approval in DigitalIdentityNFT

After successful verification in the VerificationRegistry, the Oracle (acting as the first verifier) approves the identity in the DigitalIdentityNFT contract:

```javascript
// First verifier approves to BASIC_VERIFIED level
await identityContract.connect(oracleAdmin).approveVerification(
  tokenId,
  1 // BASIC_VERIFIED level
);
```

At this point, the identity has a verification level of 1 (BASIC_VERIFIED).

### 5. Second Verifier Approval in DigitalIdentityNFT

To upgrade to KYC_VERIFIED level, a second verifier must approve:

```javascript
// Second verifier approves to KYC_VERIFIED level
await identityContract.connect(secondVerifier).approveVerification(
  tokenId,
  2 // KYC_VERIFIED level
);
```

The second verifier **must be a different address** than the first verifier. This approval can be triggered via API:

```javascript
// Request second verifier approval through API
curl -X POST http://localhost:3030/api/verifications/second-approval \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "1",
    "targetLevel": 2
  }'
```

The Oracle service handles this by executing a script that uses a different verifier address to make the approval.

### 6. Check Verification Level

After both verifier approvals, the identity should have a verification level of 2 (KYC_VERIFIED):

```javascript
// Check verification level through API
curl http://localhost:3030/api/identity/verificationLevel?address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
```

## Role Requirements

Both verifiers must have the VERIFIER_ROLE in both contracts:

```javascript
// For DigitalIdentityNFT
const verifierRole = await identityContract.VERIFIER_ROLE();
await identityContract.grantRole(verifierRole, verifierAddress);

// For VerificationRegistry
await verificationContract.grantRole(verifierRole, verifierAddress);
```

## Testing the Flow

### Using the Automated Script

The repository includes a script to test the full verification flow:

```bash
# From project root
node scripts/kyc-manual-flow.js
```

### Using the API Flow Script

For testing through the API endpoints:

```bash
# From project root
./scripts/test-api-flow.sh
```

## Debugging Common Issues

### Verification Level Stuck at BASIC_VERIFIED

If the verification level remains at 1 (BASIC_VERIFIED) after the KYC process:

1. **Check verifier roles**: Ensure the second verifier has VERIFIER_ROLE in the DigitalIdentityNFT contract
2. **Check verification count**: Use `identityContract.verificationCount(tokenId)` to see how many verifiers have approved
3. **Using same verifier**: Confirm you're using two different verifier addresses for the approvals
4. **Role assignment**: Check role assignments with `identityContract.hasRole(verifierRole, verifierAddress)`

### Transaction Failures

- "Requires multiple verifier approvals" - This error occurs when trying to upgrade to KYC_VERIFIED without having 2 different verifiers
- "Caller doesn't have VERIFIER_ROLE" - The account needs to be granted the VERIFIER_ROLE

## Advanced Usage

### Upgrading to FULL_VERIFIED Level

To upgrade to level 3 (FULL_VERIFIED), similar steps are required but with a higher level:

```javascript
// First approval (if not already done)
await identityContract.connect(firstVerifier).approveVerification(tokenId, 1);

// Second verifier approves to FULL_VERIFIED level
await identityContract.connect(secondVerifier).approveVerification(tokenId, 3);
```

### Verification Expiration

Verifications in the VerificationRegistry have an expiration date:

```javascript
// Set expiration to 1 year from now
const expirationTime = Math.floor(Date.now() / 1000) + 31536000;
await verificationContract.confirmVerification(verificationId, true, resultMetadata, expirationTime);
```

When a verification expires, the identity will maintain its verification level until explicitly downgraded or re-verified.