const hre = require("hardhat");
const fs = require("fs");

async function main() {
    // Read deployed addresses
    const addresses = JSON.parse(fs.readFileSync("deployed-addresses.json"));

    // Get contract instances
    const DigitalIdentityNFT = await hre.ethers.getContractFactory("DigitalIdentityNFT");
    const ReputationSystem = await hre.ethers.getContractFactory("ReputationSystem");
    const ModeratorControl = await hre.ethers.getContractFactory("ModeratorControl");

    const digitalIdentityNFT = DigitalIdentityNFT.attach(addresses.digitalIdentityNFT);
    const reputationSystem = ReputationSystem.attach(addresses.reputationSystem);
    const moderatorControl = ModeratorControl.attach(addresses.moderatorControl);

    // Get signers
    const [deployer, user1] = await hre.ethers.getSigners();
    console.log("Interacting with contracts using account:", deployer.address);

    // Create a new digital identity
    console.log("Creating new digital identity...");
    const tx = await moderatorControl.createIdentity(user1.address, "did:example:123");
    await tx.wait();
    console.log("Digital identity created for:", user1.address);

    // Initialize user score
    console.log("Initializing user score...");
    const tx2 = await moderatorControl.initializeUserScore(user1.address);
    await tx2.wait();
    console.log("User score initialized");

    // Get user reputation status
    const status = await moderatorControl.getUserReputationStatus(user1.address);
    console.log("User reputation status:", {
        score: status[0].toString(),
        isBanned: status[1],
        lastUpdate: status[2].toString()
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
