// backend/scripts/generate-auth-headers.js
const { ethers } = require('ethers');
require('dotenv').config();

async function generateAuthHeaders() {
    // Create admin wallet from private key
    const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    
    // Create a new random wallet for testing
    const testWallet = ethers.Wallet.createRandom();
    
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `Authenticate to Identity System: ${timestamp}`;
    const signature = await adminWallet.signMessage(message);

    console.log('\n=== Admin Wallet ===');
    console.log('Address:', adminWallet.address);
    console.log('Private Key:', adminWallet.privateKey);

    console.log('\n=== Test User Wallet ===');
    console.log('Address:', testWallet.address);
    console.log('Private Key:', testWallet.privateKey);

    console.log('\n=== Authentication Headers ===');
    console.log('x-signature:', signature);
    console.log('x-address:', adminWallet.address);
    console.log('x-timestamp:', timestamp);

    console.log('\n=== Example DID ===');
    const did = `did:ethr:${testWallet.address}`;
    console.log('DID:', did);

    console.log('\n=== Example cURL Command ===');
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

generateAuthHeaders();
