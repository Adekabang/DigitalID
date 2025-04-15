const express = require('express');
const router = express.Router();
const blockchainService = require('../services/blockchain.service');
const kycService = require('../services/kyc.service');
const logger = require('../utils/logger');

/**
 * @route GET /api/verifications/pending
 * @description Get pending verifications
 * @access Public
 */
router.get('/pending', async (req, res) => {
  try {
    logger.info('Fetching pending verifications');
    
    // Get pending verification IDs from contract
    const pendingVerifications = await blockchainService.contracts.verification.getPendingVerificationIds();
    
    // Get details for each pending verification
    const verifications = [];
    for (const verificationId of pendingVerifications) {
      try {
        const verificationData = await blockchainService.contracts.verification.getPendingVerification(verificationId);
        const details = {
          userAddress: verificationData[0],
          verificationType: verificationData[1],
          metadata: verificationData[2],
          timestamp: verificationData[3],
          status: verificationData[4]
        };
        
        verifications.push({
          id: verificationId.toString(),
          userAddress: details.userAddress,
          verificationType: details.verificationType.toString(),
          status: details.status,
          timestamp: details.timestamp.toString(),
          metadata: details.metadata
        });
      } catch (error) {
        logger.error(`Error fetching details for verification ${verificationId}:`, error);
      }
    }
    
    // Helper function to safely stringify objects that might contain BigInt values
    const safeStringify = (obj) => {
      return JSON.stringify(obj, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
      );
    };
    
    // Use the JSON.stringify with replacer, then pass to res.json
    const responseData = {
      success: true,
      data: {
        pendingCount: verifications.length,
        verifications
      }
    };
    
    return res.json(JSON.parse(JSON.stringify(responseData, 
      (key, value) => typeof value === 'bigint' ? value.toString() : value)));
  } catch (error) {
    logger.error('Error fetching pending verifications:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/verifications/:id
 * @description Get verification details by ID
 * @access Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    logger.info(`Fetching verification details for ID: ${id}`);
    
    // Check if the ID is a valid number, if not return an error
    const numericId = Number(id);
    if (isNaN(numericId) || !Number.isInteger(numericId) || numericId <= 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid verification ID: ${id}. Must be a positive integer.`
      });
    }
    
    // Get verification details
    try {
      const verificationData = await blockchainService.contracts.verification.getPendingVerification(numericId);
      const details = {
        userAddress: verificationData[0],
        verificationType: verificationData[1],
        metadata: verificationData[2],
        timestamp: verificationData[3],
        status: verificationData[4],
        result: '',
        verifier: '0x0000000000000000000000000000000000000000'
      };
      
      const responseData = {
        success: true,
        data: {
          id,
          userAddress: details.userAddress,
          verificationType: details.verificationType.toString(),
          status: details.status,
          timestamp: details.timestamp.toString(),
          metadata: details.metadata,
          result: details.result,
          verifier: details.verifier
        }
      };
      
      return res.json(JSON.parse(JSON.stringify(responseData, 
        (key, value) => typeof value === 'bigint' ? value.toString() : value)));
    } catch (error) {
      logger.error(`Error fetching verification details from blockchain for ID ${req.params.id}:`, error);
      
      return res.status(404).json({
        success: false,
        error: `Verification with ID ${req.params.id} not found or could not be retrieved`
      });
    }
  } catch (error) {
    logger.error(`Error processing verification request for ${req.params.id}:`, error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/verifications/:id/process
 * @description Manually process a verification
 * @access Private
 */
router.post('/:id/process', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved, reason } = req.body;
    
    logger.info(`Manually processing verification ${id}, approved: ${approved}`);
    
    // Check if the ID is a valid number, if not return an error
    const numericId = Number(id);
    if (isNaN(numericId) || !Number.isInteger(numericId) || numericId <= 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid verification ID: ${id}. Must be a positive integer.`
      });
    }
    
    // Get verification details
    try {
      const verificationData = await blockchainService.contracts.verification.getPendingVerification(numericId);
      const details = {
        userAddress: verificationData[0],
        verificationType: verificationData[1],
        metadata: verificationData[2],
        timestamp: verificationData[3],
        status: verificationData[4],
        result: '',
        verifier: '0x0000000000000000000000000000000000000000'
      };
      
      // Check if verification is still pending
      if (details.status !== 0) {
        return res.status(400).json({
          success: false,
          error: 'Verification is not in pending state'
        });
      }
      
      // Submit result to blockchain
      await blockchainService.executeTransaction(
        'verification',
        'confirmVerification',
        [numericId, approved, reason || '']
      );
      
      const responseData = {
        success: true,
        message: `Verification ${id} ${approved ? 'approved' : 'rejected'}`
      };
      
      return res.json(JSON.parse(JSON.stringify(responseData, 
        (key, value) => typeof value === 'bigint' ? value.toString() : value)));
    } catch (error) {
      logger.error(`Error processing verification operation for ID ${req.params.id}:`, error);
      
      return res.status(404).json({
        success: false,
        error: `Verification with ID ${req.params.id} not found or could not be processed`
      });
    }
  } catch (error) {
    logger.error(`Error in verification process endpoint for ${req.params.id}:`, error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/verifications/mock
 * @description Run a mock verification
 * @access Public
 */
router.post('/mock', async (req, res) => {
  try {
    const { address, verificationType, metadata } = req.body;
    
    if (!address || verificationType === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Address and verificationType are required'
      });
    }
    
    logger.info(`Running mock verification for ${address}, type: ${verificationType}`);
    
    // Ensure verification type is properly converted to a number
    let verificationTypeNum;
    try {
      verificationTypeNum = typeof verificationType === 'string' ? 
        parseInt(verificationType, 10) : 
        Number(verificationType);
      
      // Handle NaN case
      if (isNaN(verificationTypeNum)) {
        verificationTypeNum = 0; // Default to KYC verification type
        logger.warn(`Invalid verification type: ${verificationType}, defaulting to type 0 (KYC)`);
      }
    } catch (error) {
      logger.warn(`Error converting verification type: ${error.message}, defaulting to type 0 (KYC)`);
      verificationTypeNum = 0;
    }
    
    // Since we have VERIFIER_ROLE on the Oracle service, we'll use the direct verify method
    logger.info(`Step 1: Directly verifying the user ${address} using Oracle's VERIFIER_ROLE`);
    try {
      const metadataStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
      
      // Step 1: Process verification with KYC service first to get the result
      logger.info("Step 1a: Processing verification with KYC service");
      const result = await kycService.verifyIdentity(
        address,
        verificationTypeNum,
        metadata
      );
      
      if (!result.success) {
        logger.warn(`KYC verification failed: ${result.reason}`);
        return res.json({
          success: false,
          error: `KYC verification failed: ${result.reason}`,
          data: result
        });
      }
      
      logger.info(`KYC verification successful: ${JSON.stringify(result)}`);
      
      // Step 2: Use the verify method directly (only available to accounts with VERIFIER_ROLE)
      logger.info("Step 2: Directly calling verify method in VerificationRegistry contract");
      const verifyResult = await blockchainService.executeTransaction(
        'verification',
        'verify',
        [
          address,  // The address to verify
          verificationTypeNum,
          metadataStr,
          "0x" // Empty signature
        ]
      );
      
      if (!verifyResult || !verifyResult.success) {
        logger.error(`Failed to verify address in blockchain: ${verifyResult?.error || 'Unknown error'}`);
        return res.status(500).json({
          success: false,
          error: `Failed to verify address: ${verifyResult?.error || 'Unknown error'}`
        });
      }
      
      logger.info(`Address verified in blockchain with transaction hash: ${verifyResult.transactionHash}`);
      
      // Wait a moment to ensure the transaction is processed
      logger.info("Step 3: Waiting for verification transaction to be processed");
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Compute the verification ID (same way the contract computes it)
      const ethers = require('ethers');
      const verificationId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['address', 'uint8'],
          [address, verificationTypeNum]
        )
      );
      
      logger.info(`Verification ID: ${verificationId}`);
      
      // Step 4: Get the token ID for the address and proceed with approving in the DigitalIdentityNFT contract
      const tokenId = await blockchainService.contracts.identity.addressToTokenId(address);
      logger.info(`Got token ID for address ${address}: ${tokenId}`);
      
      // Step 5: Approve verification in DigitalIdentityNFT contract
      logger.info(`Step 5: Approving verification for token ID ${tokenId} to BASIC_VERIFIED level`);
      const approveResult = await blockchainService.executeTransaction(
        'identity',
        'approveVerification',
        [tokenId, 1] // Level 1 = BASIC_VERIFIED
      );
      
      if (!approveResult || !approveResult.success) {
        logger.error(`Failed to approve verification in DigitalIdentityNFT: ${approveResult?.error || 'Unknown error'}`);
        return res.status(500).json({
          success: false,
          error: `Failed to approve verification: ${approveResult?.error || 'Unknown error'}`,
          verificationResult: result,
          verifyResult: verifyResult
        });
      }
      
      logger.info(`DigitalIdentityNFT verification approved with transaction hash: ${approveResult.transactionHash}`);
      
      // Step 6: Check current verification level
      const identityDetails = await blockchainService.contracts.identity.getFormattedIdentityDetails(tokenId);
      logger.info(`Current verification level after approval: ${identityDetails.verificationLevel} (${identityDetails.verificationLevelName})`);
      
      // Return success response with all data
      return res.json({
        success: true,
        message: "Verification process completed successfully",
        data: {
          result,
          verificationId,
          tokenId: tokenId.toString(),
          verificationLevel: identityDetails.verificationLevel,
          verificationLevelName: identityDetails.verificationLevelName,
          transactions: {
            verify: verifyResult.transactionHash,
            approve: approveResult.transactionHash
          }
        }
      });
    } catch (error) {
      logger.error(`Error in verification process: ${error.message}`, error);
      return res.status(500).json({
        success: false,
        error: `Error in verification process: ${error.message}`
      });
    }
  } catch (error) {
    logger.error('Error running mock verification:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/verifications/request
 * @description Request a verification through the oracle
 * @access Public
 */
router.post('/request', async (req, res) => {
  try {
    const { address, verificationType, metadata } = req.body;
    
    if (!address || verificationType === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Address and verificationType are required'
      });
    }
    
    logger.info(`Requesting verification for ${address}, type: ${verificationType}`);
    
    // Prepare metadata
    const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    const metadataStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata);
    
    try {
      // Request verification from contract
      const result = await blockchainService.executeTransaction(
        'verification',
        'requestVerification',
        [
          verificationType,
          metadataStr,
          "0x" // Empty signature for now
        ],
        { from: address } // This is just for logging, actual signer is set in blockchain service
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: `Failed to request verification: ${result.error || 'Unknown error'}`
        });
      }
      
      // Extract verification ID from transaction receipt
      logger.info(`Verification requested, transaction hash: ${result.transactionHash}`);
      
      // Return success
      return res.json({
        success: true,
        message: "Verification requested successfully",
        transactionHash: result.transactionHash
      });
    } catch (error) {
      logger.error(`Error requesting verification: ${error.message}`);
      
      return res.status(500).json({
        success: false,
        error: `Error requesting verification: ${error.message}`
      });
    }
  } catch (error) {
    logger.error('Error in verification request endpoint:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/verifications/second-approval
 * @description Add a second verifier approval to upgrade verification level
 * @access Private
 */
router.post('/second-approval', async (req, res) => {
  try {
    const { tokenId, targetLevel } = req.body;
    
    if (!tokenId) {
      return res.status(400).json({
        success: false,
        error: 'TokenId is required'
      });
    }
    
    // Default to KYC level if not specified
    const verificationLevel = targetLevel || 2; // 2 = KYC_VERIFIED
    
    logger.info(`Adding second verifier approval for token ${tokenId}, level ${verificationLevel} - DIRECT METHOD`);
    
    try {
      // Get current verification level before we start
      const beforeDetails = await blockchainService.contracts.identity.getFormattedIdentityDetails(tokenId);
      logger.info(`Current verification level before approval: ${beforeDetails.verificationLevel} (${beforeDetails.verificationLevelName})`);
      
      // Get current verification count
      const verificationCount = await blockchainService.contracts.identity.verificationCount(tokenId);
      logger.info(`Current verification count: ${verificationCount}`);
      
      // Check if we're already at or above the target level
      if (beforeDetails.verificationLevel >= verificationLevel) {
        logger.info(`Token ${tokenId} is already at verification level ${beforeDetails.verificationLevel} (${beforeDetails.verificationLevelName}), which is >= the target level ${verificationLevel}`);
        return res.json({
          success: true,
          message: `Token ${tokenId} is already at verification level ${beforeDetails.verificationLevelName}`,
          verificationLevel: beforeDetails.verificationLevel,
          verificationLevelName: beforeDetails.verificationLevelName,
          alreadyVerified: true
        });
      }
      
      // Get VERIFIER_ROLE from contract
      const verifierRole = await blockchainService.contracts.identity.VERIFIER_ROLE();
      logger.info(`VERIFIER_ROLE hash: ${verifierRole}`);
      
      // Using ethers.js directly (not the hardhat import)
      const ethers = require('ethers');
      
      // Create an array of private keys for Hardhat accounts
      // These are the default private keys used by Hardhat
      const hardhatPrivateKeys = [
        // Account #0 - Default deployer/admin
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", 
        // Account #1 - User
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
        // Account #2 - Second verifier 
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
      ];
      
      // Use the private key for the second verifier (Account #2)
      const secondVerifierPrivateKey = hardhatPrivateKeys[2];
      logger.info(`Using second verifier private key (truncated): ${secondVerifierPrivateKey.substring(0, 10)}...`);
      
      // Create a new provider
      let provider;
      try {
        provider = new ethers.JsonRpcProvider('http://localhost:8545');
        logger.info(`Connected to JSON-RPC provider at http://localhost:8545`);
      } catch (providerError) {
        logger.error(`Error creating provider: ${providerError.message}`);
        throw providerError;
      }
      
      // Create a wallet for the second verifier
      let secondVerifierWallet;
      try {
        secondVerifierWallet = new ethers.Wallet(secondVerifierPrivateKey, provider);
        logger.info(`Created second verifier wallet with address: ${secondVerifierWallet.address}`);
      } catch (walletError) {
        logger.error(`Error creating wallet: ${walletError.message}`);
        throw walletError;
      }
      
      // Get contract ABI and address
      const identityContractABI = blockchainService.contracts.identity.interface.fragments;
      const identityContractAddress = await blockchainService.contracts.identity.getAddress();
      logger.info(`Identity contract address: ${identityContractAddress}`);
      
      // Create contract instance with second verifier as signer
      let identityContractWithSecondVerifier;
      try {
        identityContractWithSecondVerifier = new ethers.Contract(
          identityContractAddress,
          identityContractABI,
          secondVerifierWallet
        );
        logger.info(`Created identity contract instance with second verifier as signer`);
      } catch (contractError) {
        logger.error(`Error creating contract instance: ${contractError.message}`);
        throw contractError;
      }
      
      // Check if second verifier has VERIFIER_ROLE
      let hasRole;
      try {
        hasRole = await identityContractWithSecondVerifier.hasRole(verifierRole, secondVerifierWallet.address);
        logger.info(`Second verifier has VERIFIER_ROLE: ${hasRole}`);
      } catch (roleCheckError) {
        logger.error(`Error checking role: ${roleCheckError.message}`);
        throw roleCheckError;
      }
      
      // Grant VERIFIER_ROLE to second verifier if needed
      if (!hasRole) {
        logger.info(`Granting VERIFIER_ROLE to second verifier: ${secondVerifierWallet.address}`);
        
        try {
          const grantRoleTx = await blockchainService.executeTransaction(
            'identity',
            'grantRole',
            [verifierRole, secondVerifierWallet.address]
          );
          
          if (!grantRoleTx.success) {
            logger.error(`Failed to grant VERIFIER_ROLE to second verifier: ${grantRoleTx.error}`);
            throw new Error(`Failed to grant VERIFIER_ROLE: ${grantRoleTx.error}`);
          }
          
          logger.info(`Successfully granted VERIFIER_ROLE to second verifier, tx hash: ${grantRoleTx.transactionHash}`);
          
          // Verify role was granted
          hasRole = await identityContractWithSecondVerifier.hasRole(verifierRole, secondVerifierWallet.address);
          logger.info(`Second verifier has VERIFIER_ROLE after granting: ${hasRole}`);
          
          if (!hasRole) {
            throw new Error("Failed to grant VERIFIER_ROLE to second verifier");
          }
        } catch (grantRoleError) {
          logger.error(`Error granting role: ${grantRoleError.message}`);
          throw grantRoleError;
        }
      }
      
      // Approve verification as second verifier
      logger.info(`Approving verification as second verifier for token: ${tokenId}, level: ${verificationLevel}`);
      
      let tx;
      try {
        tx = await identityContractWithSecondVerifier.approveVerification(
          tokenId,
          verificationLevel
        );
        
        logger.info(`Transaction submitted: ${tx.hash}`);
        
        // Wait for the transaction to be confirmed
        const receipt = await tx.wait();
        logger.info(`Transaction confirmed in block ${receipt.blockNumber}, tx hash: ${tx.hash}`);
      } catch (txError) {
        logger.error(`Error submitting transaction: ${txError.message}`);
        throw txError;
      }
      
      // Wait a moment to ensure the transaction is fully processed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get verification level after approval
      const afterDetails = await blockchainService.contracts.identity.getFormattedIdentityDetails(tokenId);
      logger.info(`Verification level after approval: ${afterDetails.verificationLevel} (${afterDetails.verificationLevelName})`);
      
      // Get verification count after approval
      const afterVerificationCount = await blockchainService.contracts.identity.verificationCount(tokenId);
      logger.info(`Verification count after approval: ${afterVerificationCount}`);
      
      // Check if the verification level increased or if we already have enough verifications
      const success = afterDetails.verificationLevel >= verificationLevel;
      const verificationCountIncreased = afterVerificationCount > verificationCount;
      
      logger.info(`Success: ${success}, Verification count increased: ${verificationCountIncreased}`);
      
      // Helper function to safely stringify BigInt values
      const safeStringify = (obj) => {
        return JSON.stringify(obj, (key, value) => 
          typeof value === 'bigint' ? value.toString() : value
        );
      };
      
      // Create response object with all BigInt values converted to strings
      const responseObj = {
        success: true,
        message: success
          ? `Successfully upgraded token ${tokenId} to verification level ${afterDetails.verificationLevelName}`
          : verificationCountIncreased
            ? `Approval added successfully but verification level is still ${afterDetails.verificationLevelName}. This may require more verifiers.`
            : `Verification was processed but the level did not change. This may be because this verifier already approved.`,
        verificationLevel: typeof afterDetails.verificationLevel === 'bigint' 
          ? afterDetails.verificationLevel.toString() 
          : afterDetails.verificationLevel,
        verificationLevelName: afterDetails.verificationLevelName,
        beforeLevel: typeof beforeDetails.verificationLevel === 'bigint' 
          ? beforeDetails.verificationLevel.toString() 
          : beforeDetails.verificationLevel,
        beforeVerificationCount: typeof verificationCount === 'bigint' 
          ? verificationCount.toString() 
          : verificationCount,
        afterVerificationCount: typeof afterVerificationCount === 'bigint' 
          ? afterVerificationCount.toString() 
          : afterVerificationCount,
        targetLevel: verificationLevel,
        secondVerifierAddress: secondVerifierWallet.address,
        transactionHash: tx.hash
      };
      
      // Parse and re-stringify to handle any nested BigInt values
      return res.json(JSON.parse(safeStringify(responseObj)));
    } catch (error) {
      logger.error(`Error in second verifier approval process: ${error.message}`, error);
      
      return res.status(500).json({
        success: false,
        error: `Error adding second verifier approval: ${error.message}`
      });
    }
  } catch (error) {
    logger.error('Error in second verifier approval endpoint:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;