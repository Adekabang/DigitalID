const hre = require("hardhat");

async function main() {
    console.log("Starting deployment...");

    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // Deploy DigitalIdentityNFT
    const DigitalIdentityNFT = await hre.ethers.getContractFactory("DigitalIdentityNFT");
    const digitalIdentityNFT = await DigitalIdentityNFT.deploy();
    await digitalIdentityNFT.deployed();
    console.log("DigitalIdentityNFT deployed to:", digitalIdentityNFT.address);

    // Deploy ReputationSystem
    const ReputationSystem = await hre.ethers.getContractFactory("ReputationSystem");
    const reputationSystem = await ReputationSystem.deploy(digitalIdentityNFT.address);
    await reputationSystem.deployed();
    console.log("ReputationSystem deployed to:", reputationSystem.address);

    // Deploy ModeratorControl
    const ModeratorControl = await hre.ethers.getContractFactory("ModeratorControl");
    const moderatorControl = await ModeratorControl.deploy(
        digitalIdentityNFT.address,
        reputationSystem.address
    );
    await moderatorControl.deployed();
    console.log("ModeratorControl deployed to:", moderatorControl.address);

    // Setup permissions
    console.log("Setting up permissions...");
    
    // Transfer DigitalIdentityNFT ownership to ModeratorControl
    await digitalIdentityNFT.setModeratorControl(moderatorControl.address);
    console.log("DigitalIdentityNFT ownership transferred to ModeratorControl");

    // Transfer ReputationSystem ownership to ModeratorControl
    await reputationSystem.transferOwnership(moderatorControl.address);
    console.log("ReputationSystem ownership transferred to ModeratorControl");

    // Save addresses
    const addresses = {
        digitalIdentityNFT: digitalIdentityNFT.address,
        reputationSystem: reputationSystem.address,
        moderatorControl: moderatorControl.address
    };

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
