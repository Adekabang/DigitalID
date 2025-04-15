const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

// Helper function to load ABI file with fallback
function loadABIWithFallback(contractName) {
  try {
    // Try to load from oracle/abis directory
    const abiPath = path.join(__dirname, '../../abis', `${contractName}.json`);
    if (fs.existsSync(abiPath)) {
      const abi = require(abiPath);
      logger.info(`Loaded ABI for ${contractName} from oracle/abis directory`);
      return abi;
    }
    
    // Fallback to main project artifacts
    const artifactPath = path.join(__dirname, '../../../artifacts/contracts', `${contractName}.sol/${contractName}.json`);
    if (fs.existsSync(artifactPath)) {
      const abi = require(artifactPath);
      logger.info(`Loaded ABI for ${contractName} from main project artifacts`);
      return abi;
    }
    
    // If still not found, use mock ABI for development
    if (process.env.NODE_ENV === 'development') {
      logger.warn(`ABI not found for ${contractName}, using mock ABI for development`);
      
      // Create a minimal mock ABI with basic events and functions that the oracle needs
      const mockAbi = {
        abi: [
          // Basic ERC721 events
          {
            "anonymous": false,
            "inputs": [
              { "indexed": true, "name": "tokenId", "type": "uint256" },
              { "indexed": true, "name": "owner", "type": "address" },
              { "indexed": true, "name": "did", "type": "string" }
            ],
            "name": "IdentityCreated",
            "type": "event"
          },
          // Verification events
          {
            "anonymous": false,
            "inputs": [
              { "indexed": true, "name": "userAddress", "type": "address" },
              { "indexed": true, "name": "verificationId", "type": "uint256" },
              { "indexed": false, "name": "verificationType", "type": "uint8" },
              { "indexed": false, "name": "metadata", "type": "string" }
            ],
            "name": "VerificationRequested",
            "type": "event"
          },
          // Moderation events
          {
            "anonymous": false,
            "inputs": [
              { "indexed": true, "name": "caseId", "type": "uint256" },
              { "indexed": true, "name": "userAddress", "type": "address" },
              { "indexed": false, "name": "actionType", "type": "uint8" },
              { "indexed": false, "name": "reason", "type": "string" },
              { "indexed": true, "name": "moderator", "type": "address" }
            ],
            "name": "ModerationActionCreated",
            "type": "event"
          },
          // Function to get pending verification IDs
          {
            "inputs": [],
            "name": "getPendingVerificationIds",
            "outputs": [
              {
                "internalType": "uint256[]",
                "name": "",
                "type": "uint256[]"
              }
            ],
            "stateMutability": "view",
            "type": "function"
          },
          // Function to get pending verification details
          {
            "inputs": [
              {
                "internalType": "uint256",
                "name": "verificationId",
                "type": "uint256"
              }
            ],
            "name": "getPendingVerification",
            "outputs": [
              {
                "internalType": "address",
                "name": "user",
                "type": "address"
              },
              {
                "internalType": "uint8",
                "name": "verificationType",
                "type": "uint8"
              },
              {
                "internalType": "string",
                "name": "metadata",
                "type": "string"
              },
              {
                "internalType": "uint256",
                "name": "requestTimestamp",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "status",
                "type": "uint256"
              }
            ],
            "stateMutability": "view",
            "type": "function"
          },
          // Function to get verification details (legacy support)
          {
            "inputs": [
              {
                "internalType": "uint256",
                "name": "verificationId",
                "type": "uint256"
              }
            ],
            "name": "getVerification",
            "outputs": [
              {
                "internalType": "address",
                "name": "userAddress",
                "type": "address"
              },
              {
                "internalType": "uint8",
                "name": "verificationType",
                "type": "uint8"
              },
              {
                "internalType": "string",
                "name": "metadata",
                "type": "string"
              },
              {
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
              },
              {
                "internalType": "uint8",
                "name": "status",
                "type": "uint8"
              }
            ],
            "stateMutability": "view",
            "type": "function"
          },
          // Function to confirm verification
          {
            "inputs": [
              {
                "internalType": "uint256",
                "name": "verificationId",
                "type": "uint256"
              },
              {
                "internalType": "bool",
                "name": "isVerified",
                "type": "bool"
              },
              {
                "internalType": "string",
                "name": "resultMetadata",
                "type": "string"
              }
            ],
            "name": "confirmVerification",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
          }
        ]
      };
      return mockAbi;
    }
    
    throw new Error(`ABI not found for ${contractName}`);
  } catch (error) {
    logger.error(`Error loading ABI for ${contractName}:`, error);
    
    // In development mode, return a mock ABI even if there's an error
    if (process.env.NODE_ENV === 'development') {
      logger.warn(`Returning empty mock ABI for ${contractName} due to error`);
      return { abi: [] };
    }
    
    throw error;
  }
}

// Load Contract ABIs
let identityABI, verificationABI, moderationABI;

try {
  identityABI = loadABIWithFallback('DigitalIdentityNFT');
  verificationABI = loadABIWithFallback('VerificationRegistry');
  moderationABI = loadABIWithFallback('ModeratorControl');
} catch (error) {
  logger.error('Error loading contract ABIs:', error);
}

class BlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.contracts = {};
    this.listeners = {};
    this.lastProcessedBlock = 0;
    
    // Initialize blockchain connection
    this.initialize();
  }
  
  // Initialize blockchain connection and contract instances
  async initialize() {
    try {
      // Connect to blockchain
      this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      
      // Create signer from private key
      if (!config.blockchain.privateKey) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('Private key not found in configuration, using default development key');
          // Use a hardhat dev private key
          this.signer = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', this.provider);
        } else {
          throw new Error('Private key not found in configuration');
        }
      } else {
        this.signer = new ethers.Wallet(config.blockchain.privateKey, this.provider);
      }
      
      // Get contract addresses
      const { identity, verification, moderation } = config.blockchain.contracts;
      
      // In development mode, use placeholder addresses if missing
      if (process.env.NODE_ENV === 'development') {
        if (!identity || identity === '0x0000000000000000000000000000000000000000') {
          logger.warn('Using mock identity contract address for development');
          config.blockchain.contracts.identity = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
        }
        
        if (!verification || verification === '0x0000000000000000000000000000000000000000') {
          logger.warn('Using mock verification contract address for development');
          config.blockchain.contracts.verification = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
        }
        
        if (!moderation || moderation === '0x0000000000000000000000000000000000000000') {
          logger.warn('Using mock moderation contract address for development');
          config.blockchain.contracts.moderation = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
        }
      } 
      // In production, validate contract addresses
      else if (!identity || !verification || !moderation || 
               identity === '0x0000000000000000000000000000000000000000' ||
               verification === '0x0000000000000000000000000000000000000000' ||
               moderation === '0x0000000000000000000000000000000000000000') {
        throw new Error('Missing or invalid contract addresses in configuration');
      }
      
      // Initialize contract instances with error handling
      try {
        // Get updated addresses after potential development mode updates
        const updatedAddresses = config.blockchain.contracts;
        
        if (updatedAddresses.identity && identityABI && identityABI.abi) {
          this.contracts.identity = new ethers.Contract(updatedAddresses.identity, identityABI.abi, this.signer);
          logger.info(`Identity contract initialized at ${updatedAddresses.identity}`);
        } else {
          logger.warn('Identity contract not initialized due to missing address or ABI');
        }
        
        if (updatedAddresses.verification && verificationABI && verificationABI.abi) {
          this.contracts.verification = new ethers.Contract(updatedAddresses.verification, verificationABI.abi, this.signer);
          logger.info(`Verification contract initialized at ${updatedAddresses.verification}`);
        } else {
          logger.warn('Verification contract not initialized due to missing address or ABI');
        }
        
        if (updatedAddresses.moderation && moderationABI && moderationABI.abi) {
          this.contracts.moderation = new ethers.Contract(updatedAddresses.moderation, moderationABI.abi, this.signer);
          logger.info(`Moderation contract initialized at ${updatedAddresses.moderation}`);
        } else {
          logger.warn('Moderation contract not initialized due to missing address or ABI');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('Error initializing contract instances in development mode:', error.message);
          logger.warn('Continuing with partial or mock contract functionality');
        } else {
          logger.error('Error initializing contract instances:', error);
          throw error;
        }
      }
      
      // Get current block
      try {
        this.lastProcessedBlock = await this.provider.getBlockNumber();
        logger.info(`Current block: ${this.lastProcessedBlock}`);
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          logger.warn('Could not get current block number:', error.message);
          logger.warn('Using block 0 as starting point in development mode');
          this.lastProcessedBlock = 0;
        } else {
          throw error;
        }
      }
      
      logger.info(`Blockchain connection initialized. Connected to ${config.blockchain.rpcUrl}`);
      logger.info(`Using signer address: ${this.signer.address}`);
      
      // Check if the oracle has the VERIFIER_ROLE and request it if not
      try {
        if (this.contracts.verification) {
          const verifierRole = await this.contracts.verification.VERIFIER_ROLE();
          const hasRole = await this.contracts.verification.hasRole(verifierRole, this.signer.address);
          
          if (!hasRole) {
            logger.warn(`Oracle address ${this.signer.address} does not have VERIFIER_ROLE. Verification confirmations may fail.`);
            logger.warn('Please grant the oracle the VERIFIER_ROLE using the admin account.');
          } else {
            logger.info(`Oracle has VERIFIER_ROLE. Verification confirmations should work properly.`);
          }
        }
      } catch (error) {
        logger.warn(`Could not check oracle permissions: ${error.message}`);
      }
    } catch (error) {
      logger.error('Failed to initialize blockchain connection:', error);
      
      if (process.env.NODE_ENV === 'development') {
        logger.warn('Running in development mode with limited functionality');
        // Set up minimal functionality for development
        this.contracts = {};
      } else {
        throw error;
      }
    }
  }
  
  // Get signer address
  getSignerAddress() {
    return this.signer.address;
  }
  
  // Register for blockchain events
  registerEventListener(contractName, eventName, callback) {
    if (!this.contracts[contractName]) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn(`Contract ${contractName} not found for event ${eventName}, creating mock event listener for development`);
        
        // Return a mock listener key for development
        const listenerKey = `${contractName}.${eventName}`;
        return listenerKey;
      } else {
        throw new Error(`Contract ${contractName} not found`);
      }
    }
    
    const listenerKey = `${contractName}.${eventName}`;
    logger.info(`Registering event listener for ${listenerKey}`);
    
    // Remove existing listener if it exists
    if (this.listeners[listenerKey]) {
      this.contracts[contractName].off(eventName, this.listeners[listenerKey]);
    }
    
    // Create new listener
    const listener = (...args) => {
      logger.info(`Event detected: ${listenerKey}`);
      callback(...args);
    };
    
    // Register listener
    this.contracts[contractName].on(eventName, listener);
    this.listeners[listenerKey] = listener;
    
    return listenerKey;
  }
  
  // Remove event listener
  removeEventListener(contractName, eventName) {
    const listenerKey = `${contractName}.${eventName}`;
    
    if (this.listeners[listenerKey]) {
      this.contracts[contractName].off(eventName, this.listeners[listenerKey]);
      delete this.listeners[listenerKey];
      logger.info(`Removed event listener for ${listenerKey}`);
      return true;
    }
    
    return false;
  }
  
  // Poll for events (useful for handling missed events)
  async pollForEvents(contractName, eventName, filter = {}, fromBlock = null) {
    try {
      // Special handling for development mode
      if (process.env.NODE_ENV === 'development') {
        if (!this.contracts[contractName]) {
          logger.warn(`Contract ${contractName} not found for polling events, returning empty array in development mode`);
          return [];
        }
        
        try {
          const startBlock = fromBlock || this.lastProcessedBlock;
          const currentBlock = await this.provider.getBlockNumber();
          
          logger.info(`Polling for ${contractName}.${eventName} events from block ${startBlock} to ${currentBlock}`);
          
          // In development mode, handle errors in queryFilter gracefully
          try {
            // Query for events
            const events = await this.contracts[contractName].queryFilter(eventName, startBlock, currentBlock);
            
            // Update last processed block
            this.lastProcessedBlock = currentBlock;
            
            return events;
          } catch (error) {
            logger.warn(`Development mode: Error querying for events ${contractName}.${eventName}: ${error.message}`);
            return [];
          }
        } catch (error) {
          logger.warn(`Development mode: Error getting block number: ${error.message}`);
          return [];
        }
      }
      
      // Production mode - stricter error handling
      if (!this.contracts[contractName]) {
        throw new Error(`Contract ${contractName} not found`);
      }
      
      const startBlock = fromBlock || this.lastProcessedBlock;
      const currentBlock = await this.provider.getBlockNumber();
      
      logger.info(`Polling for ${contractName}.${eventName} events from block ${startBlock} to ${currentBlock}`);
      
      // Query for events
      const events = await this.contracts[contractName].queryFilter(eventName, startBlock, currentBlock);
      
      // Update last processed block
      this.lastProcessedBlock = currentBlock;
      
      return events;
    } catch (error) {
      logger.error(`Error polling for events ${contractName}.${eventName}:`, error);
      
      if (process.env.NODE_ENV === 'development') {
        return [];
      }
      
      throw error;
    }
  }
  
  // Execute a transaction with retry logic
  async executeTransaction(contractName, methodName, args = [], options = {}) {
    // Handle development mode with missing contracts
    if (!this.contracts[contractName]) {
      if (process.env.NODE_ENV === 'development') {
        logger.warn(`Contract ${contractName} not found for method ${methodName}, simulating transaction in development`);
        
        // Mock successful transaction response
        return {
          success: true,
          transactionHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
          blockNumber: this.lastProcessedBlock + 1,
          gasUsed: "100000",
          development: true
        };
      } else {
        throw new Error(`Contract ${contractName} not found`);
      }
    }
    
    const contract = this.contracts[contractName];
    let retries = 0;
    
    while (retries <= config.oracle.maxRetries) {
      try {
        logger.info(`Executing ${contractName}.${methodName} with args:`, args);
        
        // Check if method exists on contract
        if (typeof contract[methodName] !== 'function') {
          if (process.env.NODE_ENV === 'development') {
            logger.warn(`Method ${methodName} not found on contract ${contractName}, simulating transaction in development`);
            
            // Mock successful transaction response
            return {
              success: true,
              transactionHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
              blockNumber: this.lastProcessedBlock + 1,
              gasUsed: "100000",
              development: true
            };
          } else {
            throw new Error(`Method ${methodName} not found on contract ${contractName}`);
          }
        }
        
        // Prepare transaction options
        const txOptions = {
          gasLimit: options.gasLimit || config.blockchain.gasLimit,
          ...options
        };
        
        // Execute transaction
        const tx = await contract[methodName](...args, txOptions);
        logger.info(`Transaction submitted: ${tx.hash}`);
        
        // Wait for confirmation
        const receipt = await tx.wait(config.blockchain.confirmations);
        logger.info(`Transaction confirmed: ${tx.hash}, block: ${receipt.blockNumber}`);
        
        return {
          success: true,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        };
      } catch (error) {
        // Check for specific known errors that shouldn't be retried
        const errorMessage = error.message || '';
        const errorData = error.data?.message || '';
        const fullErrorText = errorMessage + ' ' + errorData;
        
        // Don't retry specific errors that won't resolve with retries
        const knownUnrecoverableErrors = [
          'Verification not pending',
          'verification is not in pending state',
          'already verified',
          'already completed'
        ];
        
        const isUnrecoverableError = knownUnrecoverableErrors.some(msg => 
          fullErrorText.toLowerCase().includes(msg.toLowerCase())
        );
        
        if (isUnrecoverableError) {
          logger.warn(`Skipping retries for ${contractName}.${methodName}: ${fullErrorText}`);
          
          // Return a structured response indicating the specific error
          return {
            success: false,
            error: fullErrorText,
            unrecoverable: true,
            status: 'skipped',
            method: methodName,
            args: JSON.stringify(args, (key, value) => 
              typeof value === 'bigint' ? value.toString() : value
            )
          };
        }
        
        logger.error(`Error executing ${contractName}.${methodName} (attempt ${retries + 1}/${config.oracle.maxRetries + 1}):`, error);
        
        // In development, simulate successful transaction after the final retry
        if (process.env.NODE_ENV === 'development' && retries === config.oracle.maxRetries) {
          logger.warn(`Maximum retries reached, simulating successful transaction in development mode`);
          
          return {
            success: true,
            transactionHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
            blockNumber: this.lastProcessedBlock + 1,
            gasUsed: "100000",
            development: true
          };
        }
        
        retries++;
        
        if (retries <= config.oracle.maxRetries) {
          logger.info(`Retrying in ${config.oracle.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, config.oracle.retryDelay));
        } else {
          throw error;
        }
      }
    }
  }
  /**
   * Execute a transaction as a second verifier
   * This is specifically for the multi-verifier approval flow
   */
  async executeAsSecondVerifier(contractName, methodName, args = [], options = {}) {
    try {
      logger.info(`Executing ${contractName}.${methodName} as second verifier with args:`, args);
      
      // Check if contract exists
      if (!this.contracts[contractName]) {
        throw new Error(`Contract ${contractName} not found`);
      }
      
      // Get the contract object
      const contract = this.contracts[contractName];
      
      // Check if method exists
      if (typeof contract[methodName] !== 'function') {
        throw new Error(`Method ${methodName} not found on contract ${contractName}`);
      }
      
      // In development, we can use one of the test accounts
      // In production, you'd need a secure way to handle the private key
      // of the second verifier, potentially from a secure keystore or HSM
      if (process.env.NODE_ENV === 'development') {
        // Get provider
        const provider = this.provider;
        
        // Get a list of accounts
        const accounts = await provider.listAccounts();
        
        if (!accounts || accounts.length < 3) {
          throw new Error("Not enough accounts available for second verifier");
        }
        
        // Use the third account as second verifier
        const secondVerifierAddress = accounts[2];
        logger.info(`Using account ${secondVerifierAddress} as second verifier`);
        
        // Create second verifier signer (ethers version 6+)
        // Create a new wallet with the right private key for the second verifier
        // In Hardhat, the private keys follow a pattern
        const secondVerifierKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"; // Hardhat account #2
        const secondVerifier = new ethers.Wallet(secondVerifierKey, provider);
        
        // Check if second verifier has the VERIFIER_ROLE
        const verifierRole = await contract.VERIFIER_ROLE();
        const hasRole = await contract.hasRole(verifierRole, secondVerifierAddress);
        
        if (!hasRole) {
          logger.info("Second verifier doesn't have VERIFIER_ROLE, granting now");
          
          // Grant the role using original signer (must have admin role)
          const grantRoleTx = await contract.connect(this.signer).grantRole(
            verifierRole,
            secondVerifierAddress
          );
          
          await grantRoleTx.wait();
          logger.info(`VERIFIER_ROLE granted to ${secondVerifierAddress}`);
        }
        
        // Execute transaction with second verifier
        const tx = await contract.connect(secondVerifier)[methodName](...args, {
          gasLimit: options.gasLimit || config.blockchain.gasLimit,
          ...options
        });
        
        logger.info(`Transaction submitted by second verifier: ${tx.hash}`);
        
        // Wait for confirmations
        const receipt = await tx.wait(config.blockchain.confirmations);
        logger.info(`Transaction confirmed: ${tx.hash}, block: ${receipt.blockNumber}`);
        
        return {
          success: true,
          transactionHash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString()
        };
      } else {
        // For production, you would implement a secure way to handle the second verifier
        throw new Error("Second verifier execution not implemented for production");
      }
    } catch (error) {
      logger.error(`Error executing ${contractName}.${methodName} as second verifier:`, error);
      throw error;
    }
  }
}

// Create singleton instance
const blockchainService = new BlockchainService();

module.exports = blockchainService;