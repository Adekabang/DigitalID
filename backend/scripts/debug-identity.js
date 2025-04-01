// backend/scripts/debug-identity.js
const { ethers } = require('ethers');
require('dotenv').config();

async function debugIdentity() {
    try {
        const provider = new ethers.JsonRpcProvider('http://localhost:8545');
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        
        // Load contract addresses and ABIs
        const addresses = require('../../deployed-addresses.json');
        const DigitalIdentityNFT = require('../../artifacts/contracts/DigitalIdentityNFT.sol/DigitalIdentityNFT.json');
        
        // Connect to the contract
        const digitalIdentityNFT = new ethers.Contract(
            addresses.digitalIdentityNFT,
            DigitalIdentityNFT.abi,
            wallet
        );

        const testAddress = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";

        console.log('=== Debug Information ===');
        console.log('Contract Address:', addresses.digitalIdentityNFT);
        console.log('Test Address:', testAddress);

        // Check if identity exists
        const hasIdentity = await digitalIdentityNFT.hasIdentity(testAddress);
        console.log('Has Identity:', hasIdentity);

        // Get total supply
        const totalSupply = await digitalIdentityNFT.balanceOf(testAddress);
        console.log('Total Supply for address:', totalSupply.toString());

        // Try to create a new identity
        console.log('\nAttempting to create new identity...');
        const tx = await digitalIdentityNFT.createIdentity(
            testAddress,
            `did:ethr:${testAddress}`
        );
        console.log('Transaction hash:', tx.hash);

        // Wait for confirmation
        const receipt = await tx.wait();
        console.log('Transaction confirmed in block:', receipt.blockNumber);

        // Check identity again
        const hasIdentityAfter = await digitalIdentityNFT.hasIdentity(testAddress);
        console.log('Has Identity after creation:', hasIdentityAfter);

        if (hasIdentityAfter) {
            // Try to get identity details
            const identity = await digitalIdentityNFT.getIdentity(testAddress);
            console.log('\nIdentity Details:', {
                did: identity.did,
                isVerified: identity.isVerified,
                creationDate: identity.creationDate.toString()
            });
        }

    } catch (error) {
        console.error('Debug Error:', error);
    }
}

debugIdentity().catch(console.error);
