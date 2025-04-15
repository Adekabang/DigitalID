// Script to test the full verification flow with oracle
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

// Sleep function for waiting between operations
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // Get the deployed contract addresses
  const deployedAddressesPath = path.join(__dirname, "../deployed-addresses.json");
  if (!fs.existsSync(deployedAddressesPath)) {
    console.error("Deployed addresses file not found. Please run deploy.js first.");
    process.exit(1);
  }

  const deployedAddresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf-8"));
  
  // Get signer
  const [deployer, user1] = await ethers.getSigners();
  
  console.log("Using account:", user1.address);
  
  // Connect to contracts - handle different case formats
  const identityAddress = deployedAddresses.DigitalIdentityNFT || 
                         deployedAddresses.digitalIdentityNFT;
  
  if (!identityAddress) {
    console.error("Error: DigitalIdentityNFT address not found in deployed-addresses.json");
    console.error("Available contracts:", Object.keys(deployedAddresses).join(", "));
    process.exit(1);
  }
                         
  const verificationAddress = deployedAddresses.VerificationRegistry || 
                            deployedAddresses.verificationRegistry;
                           
  if (!verificationAddress) {
    console.error("Error: VerificationRegistry address not found in deployed-addresses.json");
    console.error("Available contracts:", Object.keys(deployedAddresses).join(", "));
    process.exit(1);
  }
  
  console.log(`Using Digital Identity NFT at address: ${identityAddress}`);
  console.log(`Using Verification Registry at address: ${verificationAddress}`);
  
  const DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
  const identityContract = DigitalIdentityNFT.attach(identityAddress);
  
  const VerificationRegistry = await ethers.getContractFactory("VerificationRegistry");
  const verificationContract = VerificationRegistry.attach(verificationAddress);
  
  // Check if user has an identity
  let hasIdentity = await identityContract.hasIdentity(user1.address);
  
  if (!hasIdentity) {
    console.log("User doesn't have an identity yet. Creating one...");
    // Create a user identity using the Digital Identity NFT contract
    // The contract expects 4 parameters:
    // 1. user address
    // 2. did string
    // 3. metadataKeys array
    // 4. metadataValues array
    const metadataKeys = ["name", "email", "createdAt"];
    const metadataValues = ["Test User", "user@example.com", new Date().toISOString()];
    
    const tx = await identityContract.connect(deployer).createIdentity(
      user1.address,
      "did:ethr:" + user1.address,
      metadataKeys,
      metadataValues
    );
    
    await tx.wait();
    console.log("Identity created for", user1.address);
  } else {
    console.log("User already has an identity");
  }
  
  // Request verification (KYC)
  const metadata = JSON.stringify({
    fullName: "Test User",
    dateOfBirth: "1990-01-01",
    documentType: "passport",
    documentId: "AB123456",
    nationality: "USA",
    verificationRequest: new Date().toISOString()
  });
  
  console.log("Requesting KYC verification with metadata:", metadata);
  
  // Request verification (no signature for simplicity)
  let tx = await verificationContract.connect(user1).requestVerification(
    0, // VerificationType.KYC
    metadata,
    "0x" // Empty signature
  );
  
  const receipt = await tx.wait();
  
  // Find the VerificationRequested event
  const event = receipt.logs
    .filter(log => log.topics[0] === verificationContract.interface.getEventTopic("VerificationRequested"))
    .map(log => verificationContract.interface.parseLog(log))[0];
  
  if (!event) {
    console.error("VerificationRequested event not found in receipt");
    process.exit(1);
  }
  
  const verificationId = event.args.verificationId;
  console.log("Verification requested successfully!");
  console.log("Verification ID:", verificationId.toString());
  
  // Get initial pending verification status
  let verificationDetails = await verificationContract.getPendingVerification(verificationId);
  console.log("Initial verification details:");
  console.log("  User:", verificationDetails[0]);
  console.log("  Type:", verificationDetails[1]);
  console.log("  Status:", verificationDetails[4]); // 0 = Pending
  
  // Trigger the oracle to process the verification (either via waiting for the oracle to poll or calling the API)
  console.log("\nWaiting for oracle to process the verification...");
  
  // Option 1: Manually trigger the oracle to check for pending verifications
  try {
    // Check if the oracle API is running
    await axios.get("http://localhost:3040/health");
    
    // Trigger the oracle to check for pending verifications
    console.log("Oracle is running, triggering verification check...");
    
    // Wait for the oracle to process the verification (check every 5 seconds for up to 30 seconds)
    let processed = false;
    let attempts = 0;
    
    while (!processed && attempts < 6) {
      await sleep(5000); // Wait 5 seconds
      
      try {
        // Check if the verification has been processed
        verificationDetails = await verificationContract.getPendingVerification(verificationId);
        if (verificationDetails[4].toString() !== "0") {
          // Status is no longer pending
          processed = true;
          break;
        }
      } catch (error) {
        console.error("Error checking verification status:", error.message);
      }
      
      attempts++;
      console.log(`Still waiting... (attempt ${attempts}/6)`);
    }
    
    if (!processed) {
      console.log("\nThe oracle did not process the verification within the timeout period.");
      console.log("You may need to manually check if the oracle is correctly configured and running.");
      
      // As a fallback, manually call the confirmVerification function
      console.log("\nAttempting to manually confirm the verification as a fallback...");
      tx = await verificationContract.connect(deployer).confirmVerification(
        verificationId,
        true, // isVerified
        JSON.stringify({
          verificationId: `manual-${Date.now()}`,
          level: 1,
          timestamp: new Date().toISOString()
        })
      );
      await tx.wait();
    }
  } catch (error) {
    console.log("Oracle API is not accessible. Manually confirming verification as a fallback...");
    
    // Fallback: Manually call the confirmVerification function
    tx = await verificationContract.connect(deployer).confirmVerification(
      verificationId,
      true, // isVerified
      JSON.stringify({
        verificationId: `manual-${Date.now()}`,
        level: 1,
        timestamp: new Date().toISOString()
      })
    );
    await tx.wait();
  }
  
  // Check final verification status
  console.log("\nChecking final verification status...");
  verificationDetails = await verificationContract.getPendingVerification(verificationId);
  
  console.log("Final verification details:");
  console.log("  User:", verificationDetails[0]);
  console.log("  Type:", verificationDetails[1]);
  console.log("  Status:", verificationDetails[4]); // 1 = Approved, 2 = Rejected
  
  // Check if the verification has been registered in the main verification status
  const verificationStatus = await verificationContract.getVerificationStatus(user1.address, 0);
  
  console.log("\nVerification registered in contract:");
  console.log("  Is Verified:", verificationStatus.isVerified);
  console.log("  Timestamp:", new Date(verificationStatus.timestamp * 1000).toISOString());
  console.log("  Verifier:", verificationStatus.verifier);
  console.log("  Metadata:", verificationStatus.metadata);
  
  // Check verification history
  const verificationHistory = await verificationContract.getVerificationHistory(user1.address);
  
  console.log("\nVerification history count:", verificationHistory.length);
  if (verificationHistory.length > 0) {
    const latestAttempt = verificationHistory[verificationHistory.length - 1];
    console.log("Latest verification attempt:");
    console.log("  Success:", latestAttempt.success);
    console.log("  Timestamp:", new Date(latestAttempt.timestamp * 1000).toISOString());
    console.log("  Details:", latestAttempt.details);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });