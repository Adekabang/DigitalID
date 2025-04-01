const hre = require("hardhat");

async function main() {
    console.log("Starting deployment...");

    // Get the contract factories
    const DigitalIdentityNFT = await hre.ethers.getContractFactory("DigitalIdentityNFT");
    const ReputationSystem = await hre.ethers.getContractFactory("ReputationSystem");
    const ModeratorControl = await hre.ethers.getContractFactory("ModeratorControl");

    // Deploy DigitalIdentityNFT
    console.log("Deploying DigitalIdentityNFT...");
    const digitalIdentityNFT = await DigitalIdentityNFT.deploy();
    await digitalIdentityNFT.deployed();
    console.log("DigitalIdentityNFT deployed to:", digitalIdentityNFT.address);

    // Deploy ReputationSystem
    console.log("Deploying ReputationSystem...");
    const reputationSystem = await ReputationSystem.deploy(digitalIdentityNFT.address);
    await reputationSystem.deployed();
    console.log("ReputationSystem deployed to:", reputationSystem.address);

    // Deploy ModeratorControl
    console.log("Deploying ModeratorControl...");
    const moderatorControl = await ModeratorControl.deploy(
        digitalIdentityNFT.address,
        reputationSystem.address
    );
    await moderatorControl.deployed();
    console.log("ModeratorControl deployed to:", moderatorControl.address);

    // Setup initial roles and permissions
    console.log("Setting up initial roles and permissions...");

    // Grant MODERATOR_ROLE to deployer
    const MODERATOR_ROLE = await moderatorControl.MODERATOR_ROLE();
    await moderatorControl.grantRole(MODERATOR_ROLE, deployer.address);

    // Grant ownership of ReputationSystem to ModeratorControl
    await reputationSystem.transferOwnership(moderatorControl.address);

    console.log("Deployment completed!");

    // Return the contract addresses
    return {
        digitalIdentityNFT: digitalIdentityNFT.address,
        reputationSystem: reputationSystem.address,
        moderatorControl: moderatorControl.address
    };
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
