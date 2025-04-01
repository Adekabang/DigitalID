const hre = require("hardhat");

async function main() {
    console.log("Starting deployment...");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

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

    // Save the contract addresses
    const addresses = {
        digitalIdentityNFT: digitalIdentityNFT.address,
        reputationSystem: reputationSystem.address,
        moderatorControl: moderatorControl.address
    };

    // Save addresses to a file
    const fs = require("fs");
    fs.writeFileSync("deployed-addresses.json", JSON.stringify(addresses, null, 2));
    console.log("Contract addresses saved to deployed-addresses.json");

    return addresses;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
