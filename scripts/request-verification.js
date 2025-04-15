// Script to request verification for an identity
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
  const tx = await verificationContract.connect(user1).requestVerification(
    0, // VerificationType.KYC
    metadata,
    "0x" // Empty signature
  );
  
  const receipt = await tx.wait();
  
  // Find the VerificationRequested event
  const event = receipt.logs
    .filter(log => log.topics[0] === verificationContract.interface.getEventTopic("VerificationRequested"))
    .map(log => verificationContract.interface.parseLog(log))[0];
  
  if (event) {
    console.log("Verification requested successfully!");
    console.log("Verification ID:", event.args.verificationId.toString());
    console.log("User Address:", event.args.user);
    console.log("Verification Type:", event.args.verificationType);
    
    // Get pending verifications
    const pendingIds = await verificationContract.getPendingVerificationIds();
    console.log("Pending Verification IDs:", pendingIds.map(id => id.toString()));
    
    // Get verification details
    if (pendingIds.length > 0) {
      const verificationId = pendingIds[pendingIds.length - 1];
      const verificationDetails = await verificationContract.getPendingVerification(verificationId);
      
      console.log("Verification details:");
      console.log("  User:", verificationDetails[0]);
      console.log("  Type:", verificationDetails[1]);
      console.log("  Metadata:", verificationDetails[2]);
      console.log("  Timestamp:", new Date(verificationDetails[3] * 1000).toISOString());
      console.log("  Status:", verificationDetails[4]); // 0 = Pending
    }
  } else {
    console.error("Event not found in receipt");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });