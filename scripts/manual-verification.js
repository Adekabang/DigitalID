const { ethers } = require("hardhat");

async function main() {
  // Get signers
  const [admin, user1] = await ethers.getSigners();
  
  console.log("Admin/Oracle address:", admin.address);
  console.log("Test user address:", user1.address);
  
  // Get contract addresses
  const addressesFile = require("../deployed-addresses.json");
  
  // Normalize addresses
  const addresses = {};
  addresses.identity = addressesFile.DigitalIdentityNFT || 
                     addressesFile.digitalIdentityNFT;
  
  addresses.verification = addressesFile.VerificationRegistry || 
                         addressesFile.verificationRegistry;
  
  console.log("Normalized addresses:", addresses);
  
  // Connect to contracts
  const DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
  const identityContract = await DigitalIdentityNFT.attach(addresses.identity);
  
  const VerificationRegistry = await ethers.getContractFactory("VerificationRegistry");
  const verificationContract = await VerificationRegistry.attach(addresses.verification);
  
  // Step 1: Check if user has an identity
  const hasIdentity = await identityContract.hasIdentity(user1.address);
  console.log(`User has identity: ${hasIdentity}`);
  
  let tokenId;
  if (hasIdentity) {
    tokenId = await identityContract.addressToTokenId(user1.address);
    console.log(`User's token ID: ${tokenId}`);
    
    // Get current verification level
    const details = await identityContract.getFormattedIdentityDetails(tokenId);
    console.log(`Current verification level: ${details.verificationLevel}`);
  } else {
    console.log("Creating new identity...");
    
    // Create identity
    const metadataKeys = ["name", "email", "createdAt"];
    const metadataValues = ["Test User", "user@example.com", new Date().toISOString()];
    
    const tx = await identityContract.connect(admin).createIdentity(
      user1.address,
      "did:ethr:" + user1.address,
      metadataKeys,
      metadataValues
    );
    
    await tx.wait();
    console.log("Identity created");
    
    tokenId = await identityContract.addressToTokenId(user1.address);
    console.log(`User's token ID: ${tokenId}`);
  }
  
  // Step 2: Request verification
  console.log("\nRequesting KYC verification...");
  
  const metadata = JSON.stringify({
    fullName: "Test User",
    dateOfBirth: "1990-01-01",
    documentType: "passport",
    documentId: "AB123456",
    nationality: "USA",
    verificationRequest: new Date().toISOString()
  });
  
  const requestTx = await verificationContract.connect(user1).requestVerification(
    0, // KYC verification type
    metadata,
    "0x" // Empty signature
  );
  
  const receipt = await requestTx.wait();
  
  // Get verification ID from event
  const event = receipt.logs
    .filter(log => log.topics[0] === verificationContract.interface.getEventTopic("VerificationRequested"))
    .map(log => verificationContract.interface.parseLog(log))[0];
  
  if (!event) {
    console.error("Failed to find VerificationRequested event");
    process.exit(1);
  }
  
  const verificationId = event.args.verificationId;
  console.log(`Verification ID: ${verificationId}`);
  
  // Step 3: Manually process verification (simulating oracle)
  console.log("\nManually confirming verification as admin/oracle...");
  
  const resultMetadata = JSON.stringify({
    verificationId: `manual-sim-${Date.now()}`,
    level: 2,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });
  
  try {
    // First confirm in VerificationRegistry
    const confirmTx = await verificationContract.connect(admin).confirmVerification(
      verificationId,
      true, // isVerified
      resultMetadata
    );
    
    await confirmTx.wait();
    console.log("Verification confirmed in VerificationRegistry");
    
    // Step 4: Manually update verification level in DigitalIdentityNFT
    console.log("\nUpdating verification level in DigitalIdentityNFT...");
    console.log("First verifier approval...");
    
    try {
      const approveTx1 = await identityContract.connect(admin).approveVerification(
        tokenId,
        1 // First approve to BASIC_VERIFIED level
      );
      
      await approveTx1.wait();
      console.log("First approval successful (BASIC_VERIFIED)");
      
      // Check verification count
      const verifierCount = await identityContract.verificationCount(tokenId);
      console.log(`Current verifier count: ${verifierCount}`);
      
      // Create a second signer to approve (using the third account from hardhat)
      const [, , secondVerifier] = await ethers.getSigners();
      console.log(`Using second verifier: ${secondVerifier.address}`);
      
      // Grant VERIFIER_ROLE to second verifier
      const verifierRole = await identityContract.VERIFIER_ROLE();
      const hasRole = await identityContract.hasRole(verifierRole, secondVerifier.address);
      
      if (!hasRole) {
        console.log("Granting VERIFIER_ROLE to second verifier...");
        await identityContract.connect(admin).grantRole(verifierRole, secondVerifier.address);
        console.log("Role granted to second verifier");
      }
      
      // Second verifier approval
      console.log("Second verifier approval...");
      const approveTx2 = await identityContract.connect(secondVerifier).approveVerification(
        tokenId,
        2 // KYC_VERIFIED level
      );
      
      await approveTx2.wait();
      console.log("Second approval successful (KYC_VERIFIED)");
    } catch (error) {
      console.error("Error updating verification level:", error.message);
      
      // Check if already verified by this verifier
      if (error.message.includes("Verifier already approved")) {
        console.log("This verifier has already approved. Let's try with another verifier...");
        
        // Create a second signer to approve (using the third account from hardhat)
        const [, , secondVerifier] = await ethers.getSigners();
        console.log(`Using second verifier: ${secondVerifier.address}`);
        
        // Grant VERIFIER_ROLE to second verifier
        const verifierRole = await identityContract.VERIFIER_ROLE();
        await identityContract.connect(admin).grantRole(verifierRole, secondVerifier.address);
        console.log("Role granted to second verifier");
        
        // Second verifier approval
        console.log("Second verifier approval...");
        const approveTx2 = await identityContract.connect(secondVerifier).approveVerification(
          tokenId,
          2 // KYC_VERIFIED level
        );
        
        await approveTx2.wait();
        console.log("Second approval successful (KYC_VERIFIED)");
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error("Error processing verification:", error.message);
    
    if (error.message.includes("Verification not pending")) {
      console.log("\nError indicates verification is already processed.");
      console.log("Continuing with verification level check...");
    } else {
      throw error;
    }
  }
  
  // Step 5: Check final verification status
  console.log("\nChecking final verification status...");
  
  // Check in VerificationRegistry
  const verificationStatus = await verificationContract.getVerificationStatus(user1.address, 0);
  console.log(`Verification status in VerificationRegistry: ${verificationStatus.isVerified ? "VERIFIED" : "NOT VERIFIED"}`);
  
  // Check in DigitalIdentityNFT
  const finalDetails = await identityContract.getFormattedIdentityDetails(tokenId);
  console.log(`Verification level in DigitalIdentityNFT: ${finalDetails.verificationLevel}`);
  
  if (verificationStatus.isVerified && finalDetails.verificationLevel === "KYC VERIFIED") {
    console.log("\n✅ Success! Verification is complete and level is updated.");
  } else if (verificationStatus.isVerified && finalDetails.verificationLevel !== "KYC VERIFIED") {
    console.log("\n⚠️ Verification is confirmed but level is not updated properly.");
  } else if (!verificationStatus.isVerified && finalDetails.verificationLevel === "KYC VERIFIED") {
    console.log("\n⚠️ Inconsistent state: Verification not confirmed but level is updated.");
  } else {
    console.log("\n❌ Verification failed. Neither contract shows verification.");
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });