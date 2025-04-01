// backend/scripts/create-test-identities.js
const { ethers } = require('ethers');
require('dotenv').config();

async function createTestIdentities(count = 5) {
    const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `Authenticate to Identity System: ${timestamp}`;
    const signature = await adminWallet.signMessage(message);

    console.log('\n=== Creating Test Identities ===');
    
    for (let i = 0; i < count; i++) {
        const testWallet = ethers.Wallet.createRandom();
        const did = `did:ethr:${testWallet.address}`;
        
        console.log(`\n=== Test Identity ${i + 1} ===`);
        console.log('Address:', testWallet.address);
        console.log('DID:', did);
        console.log('\ncURL Command:');
        console.log(`curl -X POST "http://localhost:3000/api/identity/create" \\
  -H "Content-Type: application/json" \\
  -H "x-signature: ${signature}" \\
  -H "x-address: ${adminWallet.address}" \\
  -H "x-timestamp: ${timestamp}" \\
  -d '{
    "address": "${testWallet.address}",
    "did": "${did}"
  }'`);
    }
}

createTestIdentities();
