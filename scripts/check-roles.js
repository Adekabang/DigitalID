const { ethers } = require("hardhat");

async function main() {
  // Get signers
  const [admin] = await ethers.getSigners();
  
  console.log("Admin/Oracle address:", admin.address);
  
  // Get contract addresses
  const addressesFile = require("../deployed-addresses.json");
  console.log("Contract addresses from file:", addressesFile);
  
  // Normalize addresses
  const addresses = {};
  addresses.identity = addressesFile.DigitalIdentityNFT || 
                     addressesFile.digitalIdentityNFT || 
                     addressesFile.DIGITAL_IDENTITY_NFT;
  
  addresses.verification = addressesFile.VerificationRegistry || 
                         addressesFile.verificationRegistry || 
                         addressesFile.VERIFICATION_REGISTRY;
  
  if (!addresses.identity || !addresses.verification) {
    console.error("Contract addresses not found in deployed-addresses.json");
    process.exit(1);
  }
  
  console.log("Normalized addresses:", addresses);
  
  // Connect to contracts
  const DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
  const identityContract = await DigitalIdentityNFT.attach(addresses.identity);
  
  const VerificationRegistry = await ethers.getContractFactory("VerificationRegistry");
  const verificationContract = await VerificationRegistry.attach(addresses.verification);
  
  // Check roles
  const verifierRoleInIdentity = await identityContract.VERIFIER_ROLE();
  const hasRoleInIdentity = await identityContract.hasRole(verifierRoleInIdentity, admin.address);
  
  const verifierRoleInRegistry = await verificationContract.VERIFIER_ROLE();
  const hasRoleInRegistry = await verificationContract.hasRole(verifierRoleInRegistry, admin.address);
  
  console.log("\nRole check for admin/oracle address:");
  console.log(`- VERIFIER_ROLE in DigitalIdentityNFT: ${hasRoleInIdentity ? '✅ YES' : '❌ NO'}`);
  console.log(`- VERIFIER_ROLE in VerificationRegistry: ${hasRoleInRegistry ? '✅ YES' : '❌ NO'}`);
  
  if (!hasRoleInIdentity || !hasRoleInRegistry) {
    console.log("\n⚠️ The admin/oracle address is missing roles. Granting now...");
    
    // Grant missing roles
    if (!hasRoleInIdentity) {
      console.log("Granting VERIFIER_ROLE in DigitalIdentityNFT...");
      await identityContract.grantRole(verifierRoleInIdentity, admin.address);
      console.log("Role granted successfully in DigitalIdentityNFT");
    }
    
    if (!hasRoleInRegistry) {
      console.log("Granting VERIFIER_ROLE in VerificationRegistry...");
      await verificationContract.grantRole(verifierRoleInRegistry, admin.address);
      console.log("Role granted successfully in VerificationRegistry");
    }
    
    // Verify roles again
    const newHasRoleInIdentity = await identityContract.hasRole(verifierRoleInIdentity, admin.address);
    const newHasRoleInRegistry = await verificationContract.hasRole(verifierRoleInRegistry, admin.address);
    
    console.log("\nRole check after granting:");
    console.log(`- VERIFIER_ROLE in DigitalIdentityNFT: ${newHasRoleInIdentity ? '✅ YES' : '❌ NO'}`);
    console.log(`- VERIFIER_ROLE in VerificationRegistry: ${newHasRoleInRegistry ? '✅ YES' : '❌ NO'}`);
    
    if (newHasRoleInIdentity && newHasRoleInRegistry) {
      console.log("\n✅ All necessary roles have been granted successfully.");
    } else {
      console.log("\n❌ Failed to grant some roles. Please check contract permissions.");
    }
  } else {
    console.log("\n✅ The admin/oracle address has all necessary roles.");
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });