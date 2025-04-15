const cron = require('node-cron');
const blockchainService = require('./blockchain.service');
const kycService = require('./kyc.service');
const logger = require('../utils/logger');
const config = require('../config');

// Helper function to safely stringify objects that might contain BigInt values
const safeStringify = (obj) => {
  try {
    return JSON.stringify(obj, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    );
  } catch (e) {
    return `[Error serializing data: ${e.message}]`;
  }
};

class OracleService {
  constructor() {
    this.tasks = {};
    this.eventHandlers = {};
    this.isInitialized = false;
  }
  
  // Initialize the oracle service
  async initialize() {
    try {
      logger.info('Initializing Oracle Service');
      
      // Check for development mode
      if (process.env.NODE_ENV === 'development') {
        logger.info('Running in development mode - some features may be simulated');
      }
      
      try {
        // Register event handlers
        this._registerEventHandlers();
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('Failed to register event handlers in development mode:', error.message);
          logger.warn('Continuing with limited functionality in development mode');
        } else {
          throw error;
        }
      }
      
      // Start scheduled tasks
      this._startScheduledTasks();
      
      // Set initialization flag
      this.isInitialized = true;
      
      logger.info('Oracle Service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Oracle Service:', error);
      throw error;
    }
  }
  
  // Register for blockchain events
  _registerEventHandlers() {
    logger.info('Registering blockchain event handlers');
    
    // Register for verification requests
    this.eventHandlers.verificationRequested = blockchainService.registerEventListener(
      'verification', 
      'VerificationRequested',
      this.handleVerificationRequest.bind(this)
    );
    
    // Register for moderation actions
    this.eventHandlers.moderationAction = blockchainService.registerEventListener(
      'moderation',
      'ModerationActionCreated',
      this.handleModerationAction.bind(this)
    );
    
    // Register for identity created events
    this.eventHandlers.identityCreated = blockchainService.registerEventListener(
      'identity',
      'IdentityCreated',
      this.handleIdentityCreated.bind(this)
    );
  }
  
  // Start scheduled tasks (using node-cron)
  _startScheduledTasks() {
    logger.info('Starting scheduled tasks');
    
    // Schedule verification check task
    this.tasks.verificationCheck = cron.schedule(
      config.oracle.updateInterval,
      () => this.checkPendingVerifications(),
      { scheduled: true }
    );
    
    // Schedule event polling task (to catch missed events)
    this.tasks.eventPolling = cron.schedule(
      '*/5 * * * *', // Every 5 minutes
      () => this.pollForMissedEvents(),
      { scheduled: true }
    );
    
    logger.info('Scheduled tasks started');
  }
  
  // Stop the oracle service
  stop() {
    logger.info('Stopping Oracle Service');
    
    // Stop all scheduled tasks
    Object.values(this.tasks).forEach(task => {
      if (task && typeof task.stop === 'function') {
        task.stop();
      }
    });
    
    // Remove all event listeners
    Object.keys(this.eventHandlers).forEach(key => {
      const [contractName, eventName] = key.split('.');
      blockchainService.removeEventListener(contractName, eventName);
    });
    
    this.isInitialized = false;
    logger.info('Oracle Service stopped');
  }
  
  // Handle verification request event
  async handleVerificationRequest(userAddress, verificationId, verificationType, metadata) {
    try {
      // Convert BigInt values to strings
      const verificationIdStr = typeof verificationId === 'bigint' ? verificationId.toString() : verificationId;
      const verificationTypeStr = typeof verificationType === 'bigint' ? verificationType.toString() : verificationType;
      
      logger.info(`Verification requested for user ${userAddress}, type: ${verificationTypeStr}, id: ${verificationIdStr}`);
      
      // Process verification request asynchronously
      setTimeout(async () => {
        try {
          // In development mode, handle missing contracts
          let verificationDetails = null;
          
          if (process.env.NODE_ENV === 'development' && 
              (!blockchainService.contracts.verification || 
               !blockchainService.contracts.verification.getPendingVerification)) {
            
            logger.info(`Development mode: Using mock verification details`);
            verificationDetails = {
              id: verificationIdStr,
              userAddress: userAddress,
              verificationType: verificationTypeStr,
              status: 0, // Pending
              metadata: metadata
            };
          } else {
            // Get verification details from chain
            try {
              const verificationData = await blockchainService.contracts.verification.getPendingVerification(verificationId);
              verificationDetails = {
                id: verificationId,
                userAddress: verificationData[0],
                verificationType: verificationData[1],
                metadata: verificationData[2],
                requestTimestamp: verificationData[3],
                status: verificationData[4]
              };
              
              // Check if verification is already processed
              if (verificationDetails.status !== 0) {
                logger.info(`Verification ${verificationIdStr} has status ${verificationDetails.status}, not pending. Skipping processing.`);
                return; // Skip processing this verification since it's not pending
              }
            } catch (error) {
              logger.error(`Error fetching verification details for ${verificationIdStr}: ${error.message}`);
              logger.info(`Skipping verification request processing for ${verificationIdStr}`);
              return; // Skip processing this verification
            }
          }
          
          // Send verification request to KYC service
          // Ensure verification type is properly converted to a number
          let verificationTypeNum;
          try {
            verificationTypeNum = typeof verificationTypeStr === 'string' ? 
              parseInt(verificationTypeStr, 10) : 
              Number(verificationTypeStr);
            
            // Handle NaN case
            if (isNaN(verificationTypeNum)) {
              verificationTypeNum = 0; // Default to KYC verification type
              logger.warn(`Invalid verification type: ${verificationTypeStr}, defaulting to type 0 (KYC)`);
            }
          } catch (error) {
            logger.warn(`Error converting verification type: ${error.message}, defaulting to type 0 (KYC)`);
            verificationTypeNum = 0;
          }
          
          const verificationResult = await kycService.verifyIdentity(
            userAddress,
            verificationTypeNum,
            metadata
          );
          
          if (verificationResult.success) {
            // Submit verification confirmation to blockchain
            try {
              const result = await blockchainService.executeTransaction(
                'verification',
                'confirmVerification',
                [verificationId, true, safeStringify(verificationResult.data)]
              );
              
              if (result.success === false && result.unrecoverable) {
                logger.warn(`Unrecoverable error for verification ${verificationIdStr}: ${result.error}`);
                // No need to try again - this was an expected error like "Verification not pending"
              } else {
                logger.info(`Verification confirmed for user ${userAddress}, id: ${verificationIdStr}`);
                logger.debug('Transaction result:', result);
                
                // Update verification level in the DigitalIdentityNFT contract
                try {
                  // Get the token ID for the user
                  const tokenId = await blockchainService.contracts.identity.addressToTokenId(userAddress);
                  logger.info(`Updating verification level for tokenId ${tokenId} for user ${userAddress}`);
                  
                  // Determine the verification level based on verification type
                  // VerificationType in VerificationRegistry: KYC (0), DOCUMENT (1), BIOMETRIC (2), TWO_FACTOR (3), SOCIAL (4)
                  // VerificationLevel in DigitalIdentityNFT: UNVERIFIED (0), BASIC_VERIFIED (1), KYC_VERIFIED (2), FULL_VERIFIED (3)
                  
                  let newLevel = 1; // Default to BASIC_VERIFIED
                  
                  if (verificationTypeNum === 0) { // KYC verification
                    newLevel = 2; // KYC_VERIFIED
                  } else if (verificationTypeNum >= 2) { // BIOMETRIC or higher
                    newLevel = 3; // FULL_VERIFIED
                  }
                  
                  // Step 1: First approve to BASIC_VERIFIED (level 1)
                  let firstApprovalResult;
                  try {
                    firstApprovalResult = await blockchainService.executeTransaction(
                      'identity',
                      'approveVerification',
                      [tokenId, 1] // BASIC_VERIFIED first
                    );
                    
                    if (firstApprovalResult.success) {
                      logger.info(`First approval successful (BASIC_VERIFIED) for user ${userAddress}`);
                    } else if (firstApprovalResult.error && firstApprovalResult.error.includes("Verifier already approved")) {
                      logger.info(`Verifier already approved this identity, proceeding to next step`);
                    } else {
                      logger.warn(`Failed first approval for user ${userAddress}: ${firstApprovalResult.error || 'Unknown error'}`);
                    }
                  } catch (error) {
                    logger.error(`Error in first approval: ${error.message}`);
                  }
                  
                  // Step 2: Get a second verifier address or use a backup approach
                  try {
                    // Check current verification count
                    const verificationCount = await blockchainService.contracts.identity.verificationCount(tokenId);
                    logger.info(`Current verification count for token ${tokenId}: ${verificationCount}`);
                    
                    // If we already have 2+ verifications, we can try to upgrade directly to KYC level
                    if (verificationCount >= 2) {
                      logger.info(`Token ${tokenId} already has ${verificationCount} verifications, attempting direct upgrade`);
                      
                      const finalResult = await blockchainService.executeTransaction(
                        'identity',
                        'approveVerification',
                        [tokenId, newLevel]
                      );
                      
                      if (finalResult.success) {
                        logger.info(`Successfully updated verification level to ${newLevel} for user ${userAddress}`);
                      } else {
                        logger.warn(`Failed to update to level ${newLevel}: ${finalResult.error || 'Unknown error'}`);
                      }
                    } else {
                      // We need a second verifier
                      logger.info(`Need a second verifier approval for token ${tokenId}`);
                      
                      // In a real implementation, you would have multiple verifier addresses
                      // For now, we'll create a note that this needs a second verifier
                      logger.warn(`TOKEN ${tokenId} NEEDS SECOND VERIFIER APPROVAL - Please run manual verification`);
                      
                      // Attempt to get network accounts for testing
                      try {
                        const accounts = await blockchainService.provider.listAccounts();
                        if (accounts && accounts.length > 2) {
                          // Find an account that isn't the oracle's address
                          const secondVerifierAddress = accounts.find(addr => 
                            addr.toLowerCase() !== blockchainService.signer.address.toLowerCase()
                          );
                          
                          if (secondVerifierAddress) {
                            logger.info(`Found potential second verifier: ${secondVerifierAddress}`);
                            logger.info(`Manual step needed: Grant VERIFIER_ROLE to ${secondVerifierAddress} and call approveVerification`);
                          }
                        }
                      } catch (listError) {
                        logger.warn(`Could not list accounts for second verifier: ${listError.message}`);
                      }
                    }
                  } catch (secondVerifierError) {
                    logger.error(`Error in second verifier logic: ${secondVerifierError.message}`);
                  }
                } catch (error) {
                  logger.error(`Error updating verification level for user ${userAddress}:`, error.message);
                }
              }
              
              // Log success for monitoring
              try {
                const verification = await blockchainService.contracts.verification.getPendingVerification(verificationId);
                logger.info(`Verification status after confirmation: ${verification[4]}`);
              } catch (e) {
                logger.warn(`Could not fetch updated verification status: ${e.message}`);
              }
            } catch (error) {
              logger.error(`Error confirming verification ${verificationIdStr}:`, error);
              logger.error(`Transaction would have confirmed with data: ${safeStringify(verificationResult.data)}`);
            }
          } else {
            // Submit verification rejection to blockchain
            try {
              const result = await blockchainService.executeTransaction(
                'verification',
                'confirmVerification',
                [verificationId, false, safeStringify(verificationResult.reason)]
              );
              
              if (result.success === false && result.unrecoverable) {
                logger.warn(`Unrecoverable error for verification ${verificationIdStr}: ${result.error}`);
                // No need to try again - this was an expected error like "Verification not pending"
              } else {
                logger.info(`Verification rejected for user ${userAddress}, id: ${verificationIdStr}`);
                logger.debug('Transaction result:', result);
              }
              
              // Log failure for monitoring
              try {
                const verification = await blockchainService.contracts.verification.getPendingVerification(verificationId);
                logger.info(`Verification status after rejection: ${verification[4]}`);
              } catch (e) {
                logger.warn(`Could not fetch updated verification status: ${e.message}`);
              }
            } catch (error) {
              logger.error(`Error rejecting verification ${verificationIdStr}:`, error);
              logger.error(`Transaction would have rejected with reason: ${JSON.stringify(verificationResult.reason)}`);
            }
          }
        } catch (error) {
          logger.error(`Error processing verification request for ${userAddress}:`, error);
          
          // Submit verification error to blockchain
          try {
            await blockchainService.executeTransaction(
              'verification',
              'confirmVerification',
              [verificationId, false, safeStringify({ error: error.message })]
            );
          } catch (submitError) {
            logger.error(`Failed to submit verification error for ${userAddress}:`, submitError);
          }
        }
      }, 0);
    } catch (error) {
      // Convert BigInt to string for safe error logging
      const verificationIdStr = typeof verificationId === 'bigint' ? verificationId.toString() : verificationId;
      logger.error(`Error handling verification request for ${userAddress} (id: ${verificationIdStr}):`, error);
    }
  }
  
  // Handle moderation action event
  async handleModerationAction(caseId, userAddress, actionType, reason, moderator) {
    try {
      // Convert BigInt values to strings for safe logging
      const caseIdStr = typeof caseId === 'bigint' ? caseId.toString() : caseId;
      const actionTypeStr = typeof actionType === 'bigint' ? actionType.toString() : actionType;
      
      logger.info(`Moderation action detected for user ${userAddress}, case: ${caseIdStr}, type: ${actionTypeStr}`);
      
      // Process moderation action asynchronously
      setTimeout(async () => {
        try {
          // In development mode, handle missing contracts
          let caseDetails = null;
          
          if (process.env.NODE_ENV === 'development' && 
              (!blockchainService.contracts.moderation || 
               !blockchainService.contracts.moderation.getCaseDetails)) {
            
            logger.info(`Development mode: Using mock case details for case ${caseIdStr}`);
            caseDetails = {
              id: caseIdStr,
              userAddress: userAddress,
              actionType: actionTypeStr,
              reason: reason,
              moderator: moderator,
              status: 1 // Active
            };
          } else {
            // Get case details from chain
            caseDetails = await blockchainService.contracts.moderation.getCaseDetails(caseId);
          }
          
          // Record the moderation action in off-chain database
          // For now, just log the action
          logger.info(`Recording moderation action for case ${caseIdStr}:`, {
            userAddress,
            actionType: actionTypeStr,
            reason,
            moderator,
            timestamp: new Date().toISOString()
          });
          
          // In a real implementation, this would store data in a database
          // and potentially trigger additional actions based on the moderation type
        } catch (error) {
          logger.error(`Error processing moderation action for case ${caseIdStr}:`, error);
          
          // In development mode, still log basic info
          if (process.env.NODE_ENV === 'development') {
            logger.info(`Recording basic moderation action in development mode:`, {
              caseId: caseIdStr,
              userAddress,
              actionType: actionTypeStr,
              reason,
              moderator,
              timestamp: new Date().toISOString()
            });
          }
        }
      }, 0);
    } catch (error) {
      // Convert BigInt to string for safe error logging
      const caseIdStr = typeof caseId === 'bigint' ? caseId.toString() : caseId;
      logger.error(`Error handling moderation action for case ${caseIdStr}:`, error);
    }
  }
  
  // Handle identity created event
  async handleIdentityCreated(tokenId, owner, did) {
    try {
      // Convert BigInt to string for safe logging
      const tokenIdStr = typeof tokenId === 'bigint' ? tokenId.toString() : tokenId;
      
      logger.info(`New identity created: TokenID ${tokenIdStr}, Owner: ${owner}, DID: ${did}`);
      
      // Process identity creation asynchronously
      setTimeout(async () => {
        try {
          // In development mode, handle missing contracts
          if (process.env.NODE_ENV === 'development' && 
              (!blockchainService.contracts.identity || 
               !blockchainService.contracts.identity.identities)) {
            
            logger.info(`Recording new identity (development mode):`, {
              tokenId: tokenIdStr,
              owner,
              did,
              creationDate: new Date().toISOString(),
              verificationLevel: 0
            });
            return;
          }
          
          // Fetch identity details from the contract
          const identity = await blockchainService.contracts.identity.identities(tokenId);
          
          // Record the new identity in off-chain database
          // For now, just log the identity
          logger.info(`Recording new identity:`, {
            tokenId: tokenIdStr,
            owner,
            did,
            creationDate: new Date().toISOString(),
            verificationLevel: identity && identity.verificationLevel ? 
              identity.verificationLevel.toString() : "0"
          });
          
          // In a real implementation, this would store identity data in a database
          // and potentially trigger initial verification or KYC process
        } catch (error) {
          logger.error(`Error processing identity creation for token ${tokenIdStr}:`, error);
          
          // In development mode, log a simplified identity
          if (process.env.NODE_ENV === 'development') {
            logger.info(`Recording simplified identity in development mode:`, {
              tokenId: tokenIdStr,
              owner,
              did,
              creationDate: new Date().toISOString(),
              verificationLevel: "0"
            });
          }
        }
      }, 0);
    } catch (error) {
      // Convert BigInt to string for safe error logging
      const tokenIdStr = typeof tokenId === 'bigint' ? tokenId.toString() : tokenId;
      logger.error(`Error handling identity creation for token ${tokenIdStr}:`, error);
    }
  }
  
  // Check for pending verifications
  async checkPendingVerifications() {
    try {
      logger.info('Checking for pending verifications');
      
      // In development mode, handle missing contracts
      let pendingVerifications = [];
      
      if (process.env.NODE_ENV === 'development' && 
          (!blockchainService.contracts.verification || 
           !blockchainService.contracts.verification.getPendingVerificationIds)) {
        
        logger.info('Development mode: Using empty pending verifications list');
      } else {
        // Get pending verification IDs from contract
        pendingVerifications = await blockchainService.contracts.verification.getPendingVerificationIds();
      }
      
      logger.info(`Found ${pendingVerifications.length} pending verifications`);
      
      // Process each pending verification
      for (const verificationId of pendingVerifications) {
        try {
          // Convert BigInt to string for safe logging
          const verificationIdStr = typeof verificationId === 'bigint' ? verificationId.toString() : verificationId;
          
          // Get verification details
          let details = null;
          
          if (process.env.NODE_ENV === 'development' && 
              (!blockchainService.contracts.verification || 
               !blockchainService.contracts.verification.getPendingVerification)) {
            
            logger.info(`Development mode: Using mock verification details for ${verificationIdStr}`);
            details = {
              id: verificationId,
              userAddress: '0x0000000000000000000000000000000000000000',
              verificationType: 1,
              status: 0, // Pending
              metadata: '{}'
            };
          } else {
            // Get verification details from chain
            const verificationData = await blockchainService.contracts.verification.getPendingVerification(verificationId);
            details = {
              userAddress: verificationData[0],
              verificationType: verificationData[1],
              metadata: verificationData[2],
              requestTimestamp: verificationData[3],
              status: verificationData[4]
            };
          }
          
          // Process verification if it's still pending
          if (details.status === 0) { // 0 = Pending
            logger.info(`Processing pending verification ${verificationIdStr}`);
            
            // Check one more time if the verification is still pending
            try {
              const latestStatus = await blockchainService.contracts.verification.getPendingVerification(verificationId);
              if (latestStatus[4] !== 0) {
                logger.info(`Verification ${verificationIdStr} status changed to ${latestStatus[4]}, skipping processing.`);
                continue; // Skip to the next verification
              }
            } catch (error) {
              logger.warn(`Could not recheck verification status for ${verificationIdStr}: ${error.message}`);
              // Continue with processing anyway
            }
            
            // Ensure verification type is properly converted to a number
            let verificationTypeNum;
            try {
              const vType = details.verificationType;
              verificationTypeNum = typeof vType === 'bigint' ? 
                Number(vType) : 
                typeof vType === 'string' ? 
                  parseInt(vType, 10) : 
                  Number(vType);
              
              // Handle NaN case
              if (isNaN(verificationTypeNum)) {
                verificationTypeNum = 0; // Default to KYC verification type
                logger.warn(`Invalid verification type: ${details.verificationType}, defaulting to type 0 (KYC)`);
              }
            } catch (error) {
              logger.warn(`Error converting verification type: ${error.message}, defaulting to type 0 (KYC)`);
              verificationTypeNum = 0;
            }
            
            // Simulate KYC verification call
            const verificationResult = await kycService.verifyIdentity(
              details.userAddress,
              verificationTypeNum,
              details.metadata
            );
            
            if (verificationResult.success) {
              // Submit verification confirmation to blockchain
              try {
                const result = await blockchainService.executeTransaction(
                  'verification',
                  'confirmVerification',
                  [verificationId, true, safeStringify(verificationResult.data)]
                );
                
                if (result.success === false && result.unrecoverable) {
                  logger.warn(`Unrecoverable error for verification ${verificationIdStr}: ${result.error}`);
                  // No need to try again - this was an expected error like "Verification not pending"
                } else {
                  logger.info(`Pending verification confirmed for id: ${verificationIdStr}`);
                  logger.debug('Transaction result:', result);
                  
                  // Update verification level in the DigitalIdentityNFT contract
                  try {
                    const userAddress = details.userAddress;
                    // Get the token ID for the user
                    const tokenId = await blockchainService.contracts.identity.addressToTokenId(userAddress);
                    logger.info(`Updating verification level for tokenId ${tokenId} for user ${userAddress}`);
                    
                    // Determine the verification level based on verification type
                    // VerificationType in VerificationRegistry: KYC (0), DOCUMENT (1), BIOMETRIC (2), TWO_FACTOR (3), SOCIAL (4)
                    // VerificationLevel in DigitalIdentityNFT: UNVERIFIED (0), BASIC_VERIFIED (1), KYC_VERIFIED (2), FULL_VERIFIED (3)
                    
                    let newLevel = 1; // Default to BASIC_VERIFIED
                    
                    if (verificationTypeNum === 0) { // KYC verification
                      newLevel = 2; // KYC_VERIFIED
                    } else if (verificationTypeNum >= 2) { // BIOMETRIC or higher
                      newLevel = 3; // FULL_VERIFIED
                    }
                    
                    // Step 1: First approve to BASIC_VERIFIED (level 1)
                    let firstApprovalResult;
                    try {
                      firstApprovalResult = await blockchainService.executeTransaction(
                        'identity',
                        'approveVerification',
                        [tokenId, 1] // BASIC_VERIFIED first
                      );
                      
                      if (firstApprovalResult.success) {
                        logger.info(`First approval successful (BASIC_VERIFIED) for user ${userAddress}`);
                      } else if (firstApprovalResult.error && firstApprovalResult.error.includes("Verifier already approved")) {
                        logger.info(`Verifier already approved this identity, proceeding to next step`);
                      } else {
                        logger.warn(`Failed first approval for user ${userAddress}: ${firstApprovalResult.error || 'Unknown error'}`);
                      }
                    } catch (error) {
                      logger.error(`Error in first approval: ${error.message}`);
                    }
                    
                    // Step 2: Get a second verifier address or use a backup approach
                    try {
                      // Check current verification count
                      const verificationCount = await blockchainService.contracts.identity.verificationCount(tokenId);
                      logger.info(`Current verification count for token ${tokenId}: ${verificationCount}`);
                      
                      // If we already have 2+ verifications, we can try to upgrade directly to KYC level
                      if (verificationCount >= 2) {
                        logger.info(`Token ${tokenId} already has ${verificationCount} verifications, attempting direct upgrade`);
                        
                        const finalResult = await blockchainService.executeTransaction(
                          'identity',
                          'approveVerification',
                          [tokenId, newLevel]
                        );
                        
                        if (finalResult.success) {
                          logger.info(`Successfully updated verification level to ${newLevel} for user ${userAddress}`);
                        } else {
                          logger.warn(`Failed to update to level ${newLevel}: ${finalResult.error || 'Unknown error'}`);
                        }
                      } else {
                        // We need a second verifier
                        logger.info(`Need a second verifier approval for token ${tokenId}`);
                        
                        // In a real implementation, you would have multiple verifier addresses
                        // For now, we'll create a note that this needs a second verifier
                        logger.warn(`TOKEN ${tokenId} NEEDS SECOND VERIFIER APPROVAL - Please run manual verification`);
                      }
                    } catch (secondVerifierError) {
                      logger.error(`Error in second verifier logic: ${secondVerifierError.message}`);
                    }
                  } catch (error) {
                    logger.error(`Error updating verification level:`, error.message);
                  }
                }
                
                // Log success for monitoring
                const verification = await blockchainService.contracts.verification.getPendingVerification(verificationId);
                logger.info(`Verification status after confirmation: ${verification[4]}`);
              } catch (error) {
                logger.error(`Error confirming verification ${verificationIdStr}:`, error);
                
                // Using the global safeStringify function defined at the top of the file
                
                logger.error(`Transaction would have confirmed with data: ${safeStringify(verificationResult.data)}`);
              }
            } else {
              // Submit verification rejection to blockchain
              try {
                const result = await blockchainService.executeTransaction(
                  'verification',
                  'confirmVerification',
                  [verificationId, false, safeStringify(verificationResult.reason)]
                );
                
                if (result.success === false && result.unrecoverable) {
                  logger.warn(`Unrecoverable error for verification ${verificationIdStr}: ${result.error}`);
                  // No need to try again - this was an expected error like "Verification not pending"
                } else {
                  logger.info(`Pending verification rejected for id: ${verificationIdStr}`);
                  logger.debug('Transaction result:', result);
                }
                
                // Log failure for monitoring
                const verification = await blockchainService.contracts.verification.getPendingVerification(verificationId);
                logger.info(`Verification status after rejection: ${verification[4]}`);
              } catch (error) {
                logger.error(`Error rejecting verification ${verificationIdStr}:`, error);
                
                // Using the global safeStringify function defined at the top of the file
                
                logger.error(`Transaction would have rejected with reason: ${safeStringify(verificationResult.reason)}`);
              }
            }
          }
        } catch (error) {
          // Convert BigInt to string for safe error logging
          const verificationIdStr = typeof verificationId === 'bigint' ? verificationId.toString() : verificationId;
          logger.error(`Error processing pending verification ${verificationIdStr}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error checking pending verifications:', error);
    }
  }
  
  // Poll for missed events
  async pollForMissedEvents() {
    try {
      logger.info('Polling for missed events');
      
      // Poll for missed verification requests
      let verificationEvents = [];
      
      try {
        verificationEvents = await blockchainService.pollForEvents(
          'verification',
          'VerificationRequested'
        );
        
        logger.info(`Found ${verificationEvents.length} missed verification events`);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn(`Development mode: Error polling for verification events: ${error.message}`);
        } else {
          throw error;
        }
      }
      
      // Process each missed verification
      for (const event of verificationEvents) {
        try {
          const [userAddress, verificationId, verificationType, metadata] = event.args;
          
          // Convert BigInt values to strings for safe logging
          const verificationIdStr = typeof verificationId === 'bigint' ? verificationId.toString() : verificationId;
          
          // Check if verification is still pending
          let verification = { status: 0 }; // Default to pending in development mode
          
          if (!blockchainService.contracts.verification || 
              !blockchainService.contracts.verification.getPendingVerification) {
            if (process.env.NODE_ENV === 'development') {
              logger.info(`Development mode: Using mock pending status for verification ${verificationIdStr}`);
            } else {
              throw new Error('Verification contract not available');
            }
          } else {
            const verificationData = await blockchainService.contracts.verification.getPendingVerification(verificationId);
            verification = {
              userAddress: verificationData[0],
              verificationType: verificationData[1],
              metadata: verificationData[2],
              requestTimestamp: verificationData[3],
              status: verificationData[4]
            };
          }
          
          if (verification.status === 0) { // 0 = Pending
            logger.info(`Processing missed verification event for id: ${verificationIdStr}`);
            
            this.handleVerificationRequest(userAddress, verificationId, verificationType, metadata);
          }
        } catch (error) {
          logger.error(`Error processing missed verification event:`, error);
        }
      }
      
      // Poll for missed moderation actions
      let moderationEvents = [];
      
      try {
        moderationEvents = await blockchainService.pollForEvents(
          'moderation',
          'ModerationActionCreated'
        );
        
        logger.info(`Found ${moderationEvents.length} missed moderation events`);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn(`Development mode: Error polling for moderation events: ${error.message}`);
        } else {
          throw error;
        }
      }
      
      // Process each missed moderation action
      for (const event of moderationEvents) {
        try {
          const [caseId, userAddress, actionType, reason, moderator] = event.args;
          
          // Convert BigInt values to strings for safe logging
          const caseIdStr = typeof caseId === 'bigint' ? caseId.toString() : caseId;
          
          logger.info(`Processing missed moderation event for case: ${caseIdStr}`);
          
          this.handleModerationAction(caseId, userAddress, actionType, reason, moderator);
        } catch (error) {
          logger.error(`Error processing missed moderation event:`, error);
        }
      }
    } catch (error) {
      logger.error('Error polling for missed events:', error);
    }
  }
}

// Create singleton instance
const oracleService = new OracleService();

module.exports = oracleService;