// Script to grant oracle address the VERIFIER_ROLE for interacting with the contract
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
  
  // Read oracle address from .env.development (or another source)
  let oracleAddress;
  try {
    const envFilePath = path.join(__dirname, "../oracle/.env");
    const envFile = fs.readFileSync(envFilePath, "utf-8");
    const privateKeyMatch = envFile.match(/PRIVATE_KEY=([0-9a-fA-Fx]+)/);
    
    if (privateKeyMatch && privateKeyMatch[1]) {
      const oraclePrivateKey = privateKeyMatch[1];
      const oracleWallet = new ethers.Wallet(oraclePrivateKey);
      oracleAddress = oracleWallet.address;
      console.log("Found oracle address from private key:", oracleAddress);
    } else {
      throw new Error("Could not find PRIVATE_KEY in .env file");
    }
  } catch (error) {
    console.error("Error reading oracle address:", error);
    console.error("Please enter the oracle address manually:");
    
    // For this script, we'll use a hardcoded address for demonstration
    // In a real scenario, you might want to prompt for input or read it from a config file
    oracleAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Default hardhat account
    console.log("Using default oracle address:", oracleAddress);
  }
  
  // Get admin signer
  const [deployer] = await ethers.getSigners();
  
  console.log("Using admin account:", deployer.address);
  
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
  
  // Check if oracle already has the VERIFIER_ROLE
  const VERIFIER_ROLE = await verificationContract.VERIFIER_ROLE();
  const hasRole = await verificationContract.hasRole(VERIFIER_ROLE, oracleAddress);
  
  console.log(`VERIFIER_ROLE is: ${VERIFIER_ROLE}`);
  console.log(`Oracle ${oracleAddress} has VERIFIER_ROLE: ${hasRole}`);
  
  if (hasRole) {
    console.log("Oracle already has the VERIFIER_ROLE. No action needed.");
    return;
  }
  
  // Grant the VERIFIER_ROLE to the oracle
  console.log(`Granting VERIFIER_ROLE to oracle address ${oracleAddress}...`);
  
  const tx = await verificationContract.connect(deployer).grantRole(VERIFIER_ROLE, oracleAddress);
  await tx.wait();
  
  // Verify the role was granted
  const hasRoleAfter = await verificationContract.hasRole(VERIFIER_ROLE, oracleAddress);
  
  console.log(`Oracle ${oracleAddress} has VERIFIER_ROLE after transaction: ${hasRoleAfter}`);
  
  if (hasRoleAfter) {
    console.log("✅ Successfully granted VERIFIER_ROLE to oracle!");
  } else {
    console.error("❌ Failed to grant VERIFIER_ROLE to oracle. Please check contract permissions.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });