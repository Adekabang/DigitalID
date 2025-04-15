const { ethers } = require('hardhat');

async function main() {
    // Get signers
    const [admin, user1] = await ethers.getSigners();

    console.log('Using admin account:', admin.address);
    console.log('Using test user account:', user1.address);

    // Get contract addresses
    const addressesFile = require('../deployed-addresses.json');
    console.log('Contract addresses from file:', addressesFile);
    
    // Normalize contract addresses - handle different case formats
    const addresses = {};
    
    // Identity contract
    addresses.identity = addressesFile.DigitalIdentityNFT || 
                       addressesFile.digitalIdentityNFT || 
                       addressesFile.DIGITAL_IDENTITY_NFT;
    
    // Verification contract
    addresses.verification = addressesFile.VerificationRegistry || 
                           addressesFile.verificationRegistry || 
                           addressesFile.VERIFICATION_REGISTRY;
    
    console.log("Normalized addresses:", addresses);
    
    if (!addresses.identity) {
        console.error("DigitalIdentityNFT address not found in deployed-addresses.json");
        process.exit(1);
    }
    
    if (!addresses.verification) {
        console.error("VerificationRegistry address not found in deployed-addresses.json");
        process.exit(1);
    }

    // Connect to contracts
    const DigitalIdentityNFT = await ethers.getContractFactory(
        'DigitalIdentityNFT',
    );
    const identityContract = await DigitalIdentityNFT.attach(
        addresses.identity,
    );

    const VerificationRegistry = await ethers.getContractFactory(
        'VerificationRegistry',
    );
    const verificationContract = await VerificationRegistry.attach(
        addresses.verification,
    );

    // Step 1: Check if user already has an identity
    console.log('\nStep 1: Checking if user has an identity...');
    const hasIdentity = await identityContract.hasIdentity(user1.address);

    if (!hasIdentity) {
        console.log('Creating a new identity for user:', user1.address);

        // Create identity
        const metadataKeys = ['name', 'email', 'createdAt'];
        const metadataValues = [
            'Test User',
            'user@example.com',
            new Date().toISOString(),
        ];

        const tx = await identityContract
            .connect(admin)
            .createIdentity(
                user1.address,
                'did:ethr:' + user1.address,
                metadataKeys,
                metadataValues,
            );

        await tx.wait();
        console.log('Identity created successfully');
    } else {
        console.log('User already has an identity');
    }

    // Step 2: Check initial verification level
    console.log('\nStep 2: Checking initial verification level...');
    const tokenId = await identityContract.addressToTokenId(user1.address);
    console.log('TokenId:', tokenId.toString());

    const identityDetails = await identityContract.getFormattedIdentityDetails(
        tokenId,
    );
    console.log('Verification level:', identityDetails.verificationLevel);

    // Step 3: Request verification
    console.log('\nStep 3: Requesting KYC verification...');

    const metadata = JSON.stringify({
        fullName: 'Test User',
        dateOfBirth: '1990-01-01',
        documentType: 'passport',
        documentId: 'AB123456',
        nationality: 'USA',
        verificationRequest: new Date().toISOString(),
    });

    const tx = await verificationContract.connect(user1).requestVerification(
        0, // KYC verification
        metadata,
        '0x', // Empty signature
    );

    const receipt = await tx.wait();
    console.log('Verification requested, transaction hash:', tx.hash);

    // Find verification ID from events
    const event = receipt.logs
        .filter((log) => {
            return (
                log.topics[0] ===
                verificationContract.interface.getEventTopic(
                    'VerificationRequested',
                )
            );
        })
        .map((log) => verificationContract.interface.parseLog(log))[0];

    if (!event) {
        console.error('Failed to find VerificationRequested event');
        process.exit(1);
    }

    const verificationId = event.args.verificationId;
    console.log('Verification ID:', verificationId.toString());

    console.log(
        '\nNow the oracle should detect and process this verification.',
    );
    console.log('Check the oracle logs to see the verification processing.');
    console.log(
        '\nWaiting 10 seconds for the oracle to process the verification...',
    );

    // Wait for the oracle to process the verification
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Step 4: Check final verification level
    console.log('\nStep 4: Checking final verification level...');

    const updatedDetails = await identityContract.getFormattedIdentityDetails(
        tokenId,
    );
    console.log(
        'Updated verification level:',
        updatedDetails.verificationLevel,
    );

    if (updatedDetails.verificationLevel === 'KYC VERIFIED') {
        console.log(
            '\n✅ Success! The verification level has been properly updated.',
        );
    } else if (updatedDetails.verificationLevel === 'UNVERIFIED') {
        console.log('\n❌ Verification level was not updated.');
        console.log('Please check the oracle logs for errors or wait longer.');

        // Additional wait and check
        console.log('\nWaiting 10 more seconds...');
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const finalDetails = await identityContract.getFormattedIdentityDetails(
            tokenId,
        );
        console.log(
            'Final verification level:',
            finalDetails.verificationLevel,
        );

        if (finalDetails.verificationLevel === 'KYC VERIFIED') {
            console.log(
                '\n✅ Success! The verification level has been properly updated (after waiting).',
            );
        } else {
            console.log(
                '\n❓ Verification level is still not updated. Check the oracle logs for details.',
            );
        }
    } else {
        console.log(
            `\n⚠️ Verification level was updated to ${updatedDetails.verificationLevel}, which is not expected.`,
        );
    }

    // Step 5: Check KYC verification status
    console.log(
        '\nStep 5: Checking verification status in VerificationRegistry...',
    );

    const verificationStatus = await verificationContract.getVerificationStatus(
        user1.address,
        0,
    ); // 0 = KYC
    console.log('Verification completed:', verificationStatus.isVerified);

    if (verificationStatus.isVerified) {
        console.log(
            '✅ KYC verification is confirmed in the VerificationRegistry contract',
        );
    } else {
        console.log(
            '❌ KYC verification is not confirmed in the VerificationRegistry contract',
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
