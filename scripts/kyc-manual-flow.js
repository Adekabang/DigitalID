const { ethers } = require("hardhat");

async function main() {
  console.log("===== MANUAL KYC VERIFICATION FLOW =====");
  console.log("This script demonstrates the complete KYC verification flow\n");

  // Get signers
  const [admin, user1, secondVerifier] = await ethers.getSigners();
  
  console.log("Admin/Oracle address:", admin.address);
  console.log("Test user address:", user1.address);
  console.log("Second verifier address:", secondVerifier.address);
  
  // Get contract addresses
  const addresses = require("../deployed-addresses.json");
  
  // Normalize addresses
  const identityAddr = addresses.DigitalIdentityNFT || 
                     addresses.digitalIdentityNFT;
  
  const verificationAddr = addresses.VerificationRegistry || 
                         addresses.verificationRegistry;
  
  console.log("\nContract addresses:");
  console.log("- DigitalIdentityNFT:", identityAddr);
  console.log("- VerificationRegistry:", verificationAddr);
  
  // Connect to contracts
  const DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
  const identityContract = await DigitalIdentityNFT.attach(identityAddr);
  
  const VerificationRegistry = await ethers.getContractFactory("VerificationRegistry");
  const verificationContract = await VerificationRegistry.attach(verificationAddr);
  
  // Step 1: Create a user identity if needed
  console.log("\n===== STEP 1: CREATE IDENTITY =====");
  
  let hasIdentity = await identityContract.hasIdentity(user1.address);
  let tokenId;
  
  if (hasIdentity) {
    tokenId = await identityContract.addressToTokenId(user1.address);
    console.log(`User already has identity with token ID: ${tokenId}`);
  } else {
    console.log("Creating new identity for user...");
    
    // Prepare metadata
    const metadataKeys = ["name", "email", "createdAt"];
    const metadataValues = ["Test User", "user@example.com", new Date().toISOString()];
    
    // Create identity
    const tx = await identityContract.connect(admin).createIdentity(
      user1.address,
      "did:ethr:" + user1.address,
      metadataKeys,
      metadataValues
    );
    
    await tx.wait();
    
    tokenId = await identityContract.addressToTokenId(user1.address);
    console.log(`Identity created with token ID: ${tokenId}`);
  }
  
  // Step 2: Check initial verification level
  console.log("\n===== STEP 2: CHECK INITIAL VERIFICATION LEVEL =====");
  
  const initialDetails = await identityContract.getFormattedIdentityDetails(tokenId);
  console.log(`Initial verification level: ${initialDetails.verificationLevel}`);
  
  // Step 3: Request KYC verification through VerificationRegistry
  console.log("\n===== STEP 3: REQUEST KYC VERIFICATION =====");
  
  // Prepare verification metadata
  const verificationMetadata = JSON.stringify({
    fullName: "Test User",
    dateOfBirth: "1990-01-01",
    documentType: "passport",
    documentId: "AB123456",
    nationality: "USA",
    verificationRequest: new Date().toISOString()
  });
  
  console.log("Requesting verification with metadata:", verificationMetadata);
  
  // Request verification
  const requestTx = await verificationContract.connect(user1).requestVerification(
    0, // KYC verification type
    verificationMetadata,
    "0x" // Empty signature
  );
  
  const requestReceipt = await requestTx.wait();
  
  // Get verification ID from event
  const verificationEvent = requestReceipt.events.find(e => e.event === "VerificationRequested");
  const verificationId = verificationEvent.args.verificationId;
  
  console.log(`Verification requested with ID: ${verificationId}`);
  
  // Step 4: Simulate Oracle confirming verification in VerificationRegistry
  console.log("\n===== STEP 4: ORACLE CONFIRMS VERIFICATION IN VERIFICATION REGISTRY =====");
  
  // Simulate KYC result
  const resultMetadata = JSON.stringify({
    verificationId: `manual-${Date.now()}`,
    level: 2,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });
  
  console.log("Confirming verification with result:", resultMetadata);
  
  // Confirm verification as admin/oracle
  const confirmTx = await verificationContract.connect(admin).confirmVerification(
    verificationId,
    true, // isVerified
    resultMetadata
  );
  
  await confirmTx.wait();
  console.log("Verification confirmed in VerificationRegistry");
  
  // Check verification status in VerificationRegistry
  const verificationStatus = await verificationContract.getVerificationStatus(user1.address, 0); // 0 = KYC
  console.log("Verification status in VerificationRegistry:");
  console.log("- Is verified:", verificationStatus.isVerified);
  console.log("- Verifier:", verificationStatus.verifier);
  
  // Step 5: First verifier (Oracle) approves in DigitalIdentityNFT
  console.log("\n===== STEP 5: FIRST VERIFIER (ORACLE) APPROVES IN DIGITAL IDENTITY NFT =====");
  
  // Grant VERIFIER_ROLE to admin if needed
  const verifierRole = await identityContract.VERIFIER_ROLE();
  const adminHasRole = await identityContract.hasRole(verifierRole, admin.address);
  
  if (!adminHasRole) {
    console.log("Granting VERIFIER_ROLE to admin/oracle...");
    await identityContract.connect(admin).grantRole(verifierRole, admin.address);
    console.log("Role granted to admin/oracle");
  }
  
  console.log("First verifier (Oracle) approving to BASIC_VERIFIED level...");
  
  // First verifier approves to BASIC_VERIFIED level
  const firstApproveTx = await identityContract.connect(admin).approveVerification(
    tokenId,
    1 // BASIC_VERIFIED level
  );
  
  await firstApproveTx.wait();
  console.log("First verifier approval complete");
  
  // Check verification level after first approval
  const midDetails = await identityContract.getFormattedIdentityDetails(tokenId);
  console.log(`Verification level after first approval: ${midDetails.verificationLevel}`);
  
  // Check verification count
  const verifierCount = await identityContract.verificationCount(tokenId);
  console.log(`Current verifier count: ${verifierCount}`);
  
  // Step 6: Second verifier approves in DigitalIdentityNFT
  console.log("\n===== STEP 6: SECOND VERIFIER APPROVES IN DIGITAL IDENTITY NFT =====");
  
  // Grant VERIFIER_ROLE to second verifier if needed
  const secondVerifierHasRole = await identityContract.hasRole(verifierRole, secondVerifier.address);
  
  if (!secondVerifierHasRole) {
    console.log("Granting VERIFIER_ROLE to second verifier...");
    await identityContract.connect(admin).grantRole(verifierRole, secondVerifier.address);
    console.log("Role granted to second verifier");
  }
  
  console.log("Second verifier approving to KYC_VERIFIED level...");
  
  // Second verifier approves to KYC_VERIFIED level
  const secondApproveTx = await identityContract.connect(secondVerifier).approveVerification(
    tokenId,
    2 // KYC_VERIFIED level
  );
  
  await secondApproveTx.wait();
  console.log("Second verifier approval complete");
  
  // Step 7: Check final verification level
  console.log("\n===== STEP 7: CHECK FINAL VERIFICATION LEVEL =====");
  
  const finalDetails = await identityContract.getFormattedIdentityDetails(tokenId);
  console.log(`Final verification level: ${finalDetails.verificationLevel}`);
  
  // Check verification count again
  const finalVerifierCount = await identityContract.verificationCount(tokenId);
  console.log(`Final verifier count: ${finalVerifierCount}`);
  
  console.log("\n===== KYC VERIFICATION FLOW COMPLETE =====");
  
  if (finalDetails.verificationLevel === "KYC VERIFIED") {
    console.log("✅ SUCCESS: User has been verified to KYC level");
  } else {
    console.log("❌ FAILURE: User verification failed");
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });