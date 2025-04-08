// scripts/deploy.js
const hre = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('🚀 Starting deployment process...');

    const [deployer] = await hre.ethers.getSigners();
    // For local development/testing, we assume the deployer account is the one
    // whose private key will be used by the backend service.
    const backendSignerAddress = deployer.address;

    console.log(
        `Deploying contracts with account (used as Backend Signer): ${backendSignerAddress}`,
    );
    console.log(
        'Account balance:',
        hre.ethers.utils.formatEther(await deployer.getBalance()),
        'ETH',
    );

    // --- 1. Deploy DigitalIdentityNFT ---
    console.log('\n[1/7] Deploying DigitalIdentityNFT...');
    const DigitalIdentityNFT = await hre.ethers.getContractFactory(
        'DigitalIdentityNFT',
    );
    const digitalIdentityNFT = await DigitalIdentityNFT.deploy();
    await digitalIdentityNFT.deployed();
    console.log(
        `✅ DigitalIdentityNFT deployed to: ${digitalIdentityNFT.address}`,
    );

    // --- 2. Deploy ReputationSystem ---
    console.log('\n[2/7] Deploying ReputationSystem...');
    const ReputationSystem = await hre.ethers.getContractFactory(
        'ReputationSystem',
    );
    const reputationSystem = await ReputationSystem.deploy(
        digitalIdentityNFT.address, // Pass IDigitalIdentityNFT address
    );
    await reputationSystem.deployed();
    console.log(`✅ ReputationSystem deployed to: ${reputationSystem.address}`);

    // --- 3. Deploy ModeratorControl ---
    // ModeratorControl needs addresses of DigitalIdentityNFT and ReputationSystem
    console.log('\n[3/7] Deploying ModeratorControl...');
    const ModeratorControl = await hre.ethers.getContractFactory(
        'ModeratorControl',
    );
    const moderatorControl = await ModeratorControl.deploy(
        digitalIdentityNFT.address,
        reputationSystem.address,
    );
    await moderatorControl.deployed();
    console.log(`✅ ModeratorControl deployed to: ${moderatorControl.address}`);

    // --- 4. Deploy VerificationRegistry ---
    console.log('\n[4/7] Deploying VerificationRegistry...');
    const VerificationRegistry = await hre.ethers.getContractFactory(
        'VerificationRegistry',
    );
    const verificationRegistry = await VerificationRegistry.deploy(
        digitalIdentityNFT.address, // Pass IDigitalIdentityNFT address
    );
    await verificationRegistry.deployed();
    console.log(
        `✅ VerificationRegistry deployed to: ${verificationRegistry.address}`,
    );

    // --- 5. Deploy MultiFactorAuth ---
    console.log('\n[5/7] Deploying MultiFactorAuth...');
    const MultiFactorAuth = await hre.ethers.getContractFactory(
        'MultiFactorAuth',
    );
    const multiFactorAuth = await MultiFactorAuth.deploy(
        digitalIdentityNFT.address, // Pass IDigitalIdentityNFT address
    );
    await multiFactorAuth.deployed();
    console.log(`✅ MultiFactorAuth deployed to: ${multiFactorAuth.address}`);

    // --- 6. Deploy AppealSystem ---
    // AppealSystem needs ModeratorControl and ReputationSystem addresses
    console.log('\n[6/7] Deploying AppealSystem...');
    const AppealSystem = await hre.ethers.getContractFactory('AppealSystem');
    const appealSystem = await AppealSystem.deploy(
        moderatorControl.address,
        reputationSystem.address,
    );
    await appealSystem.deployed();
    console.log(`✅ AppealSystem deployed to: ${appealSystem.address}`);

    // --- 7. Post-Deployment Setup ---
    console.log('\n[7/7] Performing Post-Deployment Setup...');
    let tx; // Transaction variable

    // 7a. Unpause DigitalIdentityNFT (it starts paused)
    console.log('  - Unpausing DigitalIdentityNFT...');
    tx = await digitalIdentityNFT.unpause();
    await tx.wait();
    console.log('    ✅ DigitalIdentityNFT unpaused.');

    // 7b. Transfer ReputationSystem ownership to ModeratorControl
    console.log('  - Transferring ReputationSystem ownership...');
    tx = await reputationSystem.transferOwnership(moderatorControl.address);
    await tx.wait();
    console.log(
        `    ✅ ReputationSystem ownership transferred to ModeratorControl (${moderatorControl.address})`,
    );

    // 7c. Grant Roles in ModeratorControl to the Backend Signer
    console.log('  - Granting roles in ModeratorControl...');
    const MODERATOR_ROLE_MC = await moderatorControl.MODERATOR_ROLE();
    const ORACLE_ROLE_MC = await moderatorControl.ORACLE_ROLE();

    console.log(
        `    Attempting to grant MODERATOR_ROLE (${MODERATOR_ROLE_MC}) to ${backendSignerAddress}...`,
    );
    tx = await moderatorControl.grantRole(
        MODERATOR_ROLE_MC,
        backendSignerAddress,
    );
    await tx.wait(); // Wait for the transaction to be mined
    console.log(`    ✅ MODERATOR_ROLE grant transaction sent and mined.`);

    // --- Verification Block (Optional but recommended) ---
    console.log(`    🔍 Verifying MODERATOR_ROLE grant...`);
    const hasModeratorRole = await moderatorControl.hasRole(
        MODERATOR_ROLE_MC,
        backendSignerAddress,
    );
    console.log(
        `    👉 Result: Backend signer (${backendSignerAddress}) has MODERATOR_ROLE? ${hasModeratorRole}`,
    );
    if (!hasModeratorRole) {
        console.error(
            '    ❌ CRITICAL FAILURE: MODERATOR_ROLE was NOT granted successfully according to hasRole check!',
        );
        throw new Error('Failed to grant or verify MODERATOR_ROLE');
    } else {
        console.log(
            '    ✅ Verification successful: MODERATOR_ROLE is confirmed granted.',
        );
    }
    // --- END VERIFICATION BLOCK ---

    console.log(
        `    Attempting to grant ORACLE_ROLE (${ORACLE_ROLE_MC}) to ${backendSignerAddress}...`,
    );
    tx = await moderatorControl.grantRole(ORACLE_ROLE_MC, backendSignerAddress); // Grant oracle too for backend actions/testing
    await tx.wait();
    console.log(`    ✅ ORACLE_ROLE grant transaction sent and mined.`);

    // 7d. Grant Roles in DigitalIdentityNFT
    console.log('  - Granting roles in DigitalIdentityNFT...');
    const VERIFIER_ROLE_NFT = await digitalIdentityNFT.VERIFIER_ROLE();
    const RECOVERY_ROLE_NFT = await digitalIdentityNFT.RECOVERY_ROLE();

    // --- FIX: Grant VERIFIER_ROLE to ModeratorControl contract ---
    // ModeratorControl contract needs this role to call digitalIdentity.createIdentity
    console.log(
        `    Attempting to grant VERIFIER_ROLE (${VERIFIER_ROLE_NFT}) to ModeratorControl (${moderatorControl.address})...`,
    );
    tx = await digitalIdentityNFT.grantRole(
        VERIFIER_ROLE_NFT,
        moderatorControl.address,
    );
    await tx.wait();
    console.log(
        `    ✅ VERIFIER_ROLE granted to ModeratorControl (${moderatorControl.address})`,
    );
    // --- End Fix ---

    // Grant RECOVERY_ROLE to VerificationRegistry contract (it calls transferIdentity)
    console.log(
        `    Attempting to grant RECOVERY_ROLE (${RECOVERY_ROLE_NFT}) to VerificationRegistry (${verificationRegistry.address})...`,
    );
    tx = await digitalIdentityNFT.grantRole(
        RECOVERY_ROLE_NFT,
        verificationRegistry.address,
    );
    await tx.wait();
    console.log(
        `    ✅ RECOVERY_ROLE granted to VerificationRegistry (${verificationRegistry.address})`,
    );

    // 7e. Grant Roles in VerificationRegistry to Backend Signer
    console.log('  - Granting roles in VerificationRegistry...');
    const VERIFIER_ROLE_VR = await verificationRegistry.VERIFIER_ROLE();
    const RECOVERY_AGENT_ROLE_VR =
        await verificationRegistry.RECOVERY_AGENT_ROLE();
    tx = await verificationRegistry.grantRole(
        VERIFIER_ROLE_VR,
        backendSignerAddress,
    );
    await tx.wait();
    console.log(`    ✅ VERIFIER_ROLE granted to Backend Signer`);
    tx = await verificationRegistry.grantRole(
        RECOVERY_AGENT_ROLE_VR,
        backendSignerAddress,
    );
    await tx.wait();
    console.log(`    ✅ RECOVERY_AGENT_ROLE granted to Backend Signer`);

    // 7f. Grant Roles in MultiFactorAuth to Backend Signer
    console.log('  - Granting roles in MultiFactorAuth...');
    const MFA_VERIFIER_ROLE_MFA = await multiFactorAuth.MFA_VERIFIER_ROLE();
    tx = await multiFactorAuth.grantRole(
        MFA_VERIFIER_ROLE_MFA,
        backendSignerAddress,
    );
    await tx.wait();
    console.log(`    ✅ MFA_VERIFIER_ROLE granted to Backend Signer`);

    // 7g. Grant Roles in AppealSystem to Backend Signer (for testing/initial admin)
    // Note: Constructor already adds deployer as reviewer & grants role, this might be redundant but ensures it.
    console.log('  - Granting roles in AppealSystem...');
    const APPEAL_REVIEWER_ROLE_AS = await appealSystem.APPEAL_REVIEWER_ROLE();
    tx = await appealSystem.grantRole(
        APPEAL_REVIEWER_ROLE_AS,
        backendSignerAddress,
    );
    await tx.wait();
    console.log(`    ✅ APPEAL_REVIEWER_ROLE granted to Backend Signer`);

    // 7h. Link AppealSystem in ModeratorControl
    console.log('  - Linking AppealSystem in ModeratorControl...');
    tx = await moderatorControl.setAppealSystem(appealSystem.address);
    await tx.wait();
    console.log(
        `    ✅ AppealSystem address set in ModeratorControl to ${appealSystem.address}`,
    );

    console.log('\n✅ Post-Deployment Setup Complete.');

    // --- Save Addresses ---
    console.log('\n💾 Saving Contract Addresses...');
    const addresses = {
        digitalIdentityNFT: digitalIdentityNFT.address,
        reputationSystem: reputationSystem.address,
        moderatorControl: moderatorControl.address,
        verificationRegistry: verificationRegistry.address,
        multiFactorAuth: multiFactorAuth.address,
        appealSystem: appealSystem.address,
        // Also save the address that was granted the key roles for the backend
        backendSignerAddress: backendSignerAddress,
    };

    const addressesDir = path.join(__dirname, '..'); // Root directory
    if (!fs.existsSync(addressesDir)) {
        fs.mkdirSync(addressesDir);
    }
    const addressesPath = path.join(addressesDir, 'deployed-addresses.json');
    fs.writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
    console.log(`✅ Addresses saved to ${addressesPath}`);

    console.log('\n🎉 Deployment finished successfully! 🎉');
    return addresses;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    });
