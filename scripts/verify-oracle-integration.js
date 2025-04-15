// Script to verify the oracle integration with the contract
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // Get the deployed contract addresses
  const deployedAddressesPath = path.join(__dirname, "../deployed-addresses.json");
  if (!fs.existsSync(deployedAddressesPath)) {
    console.error("Deployed addresses file not found. Please run deploy.js first.");
    process.exit(1);
  }

  const deployedAddresses = JSON.parse(fs.readFileSync(deployedAddressesPath, "utf-8"));
  
  // Get signers
  const [deployer, user1] = await ethers.getSigners();
  
  console.log("Using admin account:", deployer.address);
  console.log("Using test user account:", user1.address);
  
  // Connect to Verification Registry contract - handle different case formats
  const verificationAddress = deployedAddresses.VerificationRegistry || 
                           deployedAddresses.verificationRegistry;
                           
  if (!verificationAddress) {
    console.error("Error: VerificationRegistry address not found in deployed-addresses.json");
    console.error("Available contracts:", Object.keys(deployedAddresses).join(", "));
    process.exit(1);
  }
  
  console.log(`Using Verification Registry at address: ${verificationAddress}`);
  
  const VerificationRegistry = await ethers.getContractFactory("VerificationRegistry");
  const verificationContract = VerificationRegistry.attach(verificationAddress);
  
  // 1. Create a verification request
  console.log("\n1. Getting pending verification IDs...");
  const initialPendingIds = await verificationContract.getPendingVerificationIds();
  console.log(`Initial pending verification count: ${initialPendingIds.length}`);
  
  if (initialPendingIds.length > 0) {
    console.log("Pending verification IDs:", initialPendingIds.map(id => id.toString()));
    
    // Get details of the first pending verification
    const firstVerificationId = initialPendingIds[0];
    const verificationDetails = await verificationContract.getPendingVerification(firstVerificationId);
    
    console.log("\nDetails of first pending verification:");
    console.log("  User:", verificationDetails[0]);
    console.log("  Type:", verificationDetails[1]);
    console.log("  Metadata:", verificationDetails[2]);
    console.log("  Timestamp:", new Date(verificationDetails[3] * 1000).toISOString());
    console.log("  Status:", verificationDetails[4]); // 0 = Pending
  } else {
    console.log("No pending verifications found.");
  }
  
  // 2. Manually confirm a verification as the contract admin (simulating oracle)
  console.log("\n2. Manually confirming a verification (simulating oracle)...");
  
  // Create a test verification request if none exists
  let targetVerificationId;
  let shouldConfirm = true;
  
  if (initialPendingIds.length === 0) {
    console.log("Creating a test verification request first...");
    
    // Request verification
    try {
      const tx = await verificationContract.connect(user1).requestVerification(
        0, // VerificationType.KYC
        JSON.stringify({
          fullName: "Test User for Oracle Integration",
          dateOfBirth: "1990-01-01",
          documentType: "passport",
          requestTimestamp: new Date().toISOString()
        }),
        "0x" // Empty signature
      );
      
      const receipt = await tx.wait();
      
      // Find the VerificationRequested event
      const event = receipt.logs
        .filter(log => log.topics[0] === verificationContract.interface.getEventTopic("VerificationRequested"))
        .map(log => verificationContract.interface.parseLog(log))[0];
      
      if (event) {
        targetVerificationId = event.args.verificationId;
        console.log(`Created verification request with ID: ${targetVerificationId}`);
      } else {
        console.error("Failed to create verification request");
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error creating verification request: ${error.message}`);
      process.exit(1);
    }
  } else {
    // Use the first verification from the list, but check its status first
    targetVerificationId = initialPendingIds[0];
    console.log(`Using existing verification with ID: ${targetVerificationId}`);
    
    // Check the status to make sure it's still pending
    const details = await verificationContract.getPendingVerification(targetVerificationId);
    const status = details[4].toString();
    
    if (status !== "0") {
      console.log(`⚠️ Verification ${targetVerificationId} has status ${status} (not pending)`);
      console.log("Creating a new verification request instead...");
      
      try {
        const tx = await verificationContract.connect(user1).requestVerification(
          0, // VerificationType.KYC
          JSON.stringify({
            fullName: "Test User for Oracle Integration",
            dateOfBirth: "1990-01-01",
            documentType: "passport",
            requestTimestamp: new Date().toISOString()
          }),
          "0x" // Empty signature
        );
        
        const receipt = await tx.wait();
        
        // Find the VerificationRequested event
        const event = receipt.logs
          .filter(log => log.topics[0] === verificationContract.interface.getEventTopic("VerificationRequested"))
          .map(log => verificationContract.interface.parseLog(log))[0];
        
        if (event) {
          targetVerificationId = event.args.verificationId;
          console.log(`Created verification request with ID: ${targetVerificationId}`);
        } else {
          console.error("Failed to create verification request");
          process.exit(1);
        }
      } catch (error) {
        console.error(`Error creating verification request: ${error.message}`);
        console.log("Skipping confirmation step...");
        shouldConfirm = false;
      }
    }
  }
  
  if (shouldConfirm) {
    // Confirm the verification as admin (simulating oracle)
    const resultMetadata = JSON.stringify({
      verificationId: `oracle-sim-${Date.now()}`,
      level: 2,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });
    
    console.log("Confirming verification with result:", resultMetadata);
    
    try {
      const confirmTx = await verificationContract.connect(deployer).confirmVerification(
        targetVerificationId,
        true, // isVerified
        resultMetadata
      );
      
      await confirmTx.wait();
      console.log("✅ Verification confirmed successfully");
    } catch (error) {
      console.error(`❌ Error confirming verification: ${error.reason || error.message}`);
    }
  }
  
  // 3. Check the verification status
  console.log("\n3. Checking verification status after confirmation...");
  
  // Get updated verification details
  const updatedDetails = await verificationContract.getPendingVerification(targetVerificationId);
  
  console.log("Updated verification details:");
  console.log("  User:", updatedDetails[0]);
  console.log("  Type:", updatedDetails[1]);
  console.log("  Status:", updatedDetails[4]); // Should be 1 (Approved) now
  
  // Get verification status in the main mapping
  const userAddress = updatedDetails[0];
  const verificationStatus = await verificationContract.getVerificationStatus(userAddress, 0); // 0 = KYC
  
  console.log("\nVerification status in contract:");
  console.log("  Is Verified:", verificationStatus.isVerified);
  console.log("  Timestamp:", new Date(verificationStatus.timestamp * 1000).toISOString());
  console.log("  Verifier:", verificationStatus.verifier);
  console.log("  Metadata:", verificationStatus.metadata);
  
  // 4. Check pending verifications after confirmation
  console.log("\n4. Checking pending verifications after confirmation...");
  const finalPendingIds = await verificationContract.getPendingVerificationIds();
  console.log(`Final pending verification count: ${finalPendingIds.length}`);
  
  // 5. Check if the verification ID is still in the list (needs cleanup)
  const stillInList = finalPendingIds.some(id => id.toString() === targetVerificationId.toString());
  console.log(`Is confirmed verification still in pending list: ${stillInList}`);
  
  if (stillInList) {
    console.log("\nRunning cleanup to remove processed verifications...");
    const cleanupTx = await verificationContract.connect(deployer).cleanupProcessedVerifications();
    await cleanupTx.wait();
    
    const cleanedPendingIds = await verificationContract.getPendingVerificationIds();
    console.log(`Pending verification count after cleanup: ${cleanedPendingIds.length}`);
  }
  
  console.log("\nVerification integration test completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });