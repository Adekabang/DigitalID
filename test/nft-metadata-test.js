const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DigitalIdentityNFT Metadata", function () {
    let DigitalIdentityNFT;
    let digitalIdentityNFT;
    let owner;
    let user;
    let tokenId;

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();

        // Deploy NFT contract
        DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
        digitalIdentityNFT = await DigitalIdentityNFT.deploy();
        await digitalIdentityNFT.deployed();
        
        // Unpause the contract
        await digitalIdentityNFT.unpause();
        
        // Create an identity
        const did = "did:example:123456";
        const emptyKeys = [];
        const emptyValues = [];
        
        const tx = await digitalIdentityNFT.createIdentity(
            user.address, 
            did, 
            emptyKeys, 
            emptyValues
        );
        await tx.wait();
        
        // Get the token ID
        tokenId = await digitalIdentityNFT.addressToTokenId(user.address);
    });

    it("Should return valid tokenURI", async function () {
        const tokenURI = await digitalIdentityNFT.tokenURI(tokenId);
        
        expect(tokenURI).to.be.a('string');
        expect(tokenURI).to.include('data:application/json;base64,');
        
        // Extract and decode the base64 JSON
        const base64Json = tokenURI.replace('data:application/json;base64,', '');
        const jsonString = Buffer.from(base64Json, 'base64').toString('utf-8');
        const metadata = JSON.parse(jsonString);
        
        // Verify metadata structure
        expect(metadata).to.have.property('name');
        expect(metadata).to.have.property('description');
        expect(metadata).to.have.property('image');
        expect(metadata).to.have.property('attributes');
        
        // Verify image data
        expect(metadata.image).to.include('data:image/svg+xml;base64,');
        
        // Verify attributes
        const attributesMap = {};
        metadata.attributes.forEach(attr => {
            attributesMap[attr.trait_type] = attr.value;
        });
        
        expect(attributesMap).to.have.property('DID', 'did:example:123456');
        expect(attributesMap).to.have.property('Verification Level', 'UNVERIFIED');
        expect(attributesMap).to.have.property('Recoverable', 'No');
        
        console.log("✅ TokenURI contains valid metadata");
    });
    
    it("Should reflect verification level changes in tokenURI", async function () {
        // Approve verification to BASIC_VERIFIED level
        await digitalIdentityNFT.approveVerification(tokenId, 1); // BASIC_VERIFIED
        
        const tokenURI = await digitalIdentityNFT.tokenURI(tokenId);
        const base64Json = tokenURI.replace('data:application/json;base64,', '');
        const jsonString = Buffer.from(base64Json, 'base64').toString('utf-8');
        const metadata = JSON.parse(jsonString);
        
        // Find verification level attribute
        const verificationAttr = metadata.attributes.find(attr => attr.trait_type === 'Verification Level');
        expect(verificationAttr.value).to.equal('BASIC VERIFIED');
        
        console.log("✅ TokenURI reflects verification level changes");
    });

    it("Should reflect recovery status changes in tokenURI", async function () {
        // Set recovery address
        await digitalIdentityNFT.connect(user).setRecoveryAddress(tokenId, owner.address);
        
        const tokenURI = await digitalIdentityNFT.tokenURI(tokenId);
        const base64Json = tokenURI.replace('data:application/json;base64,', '');
        const jsonString = Buffer.from(base64Json, 'base64').toString('utf-8');
        const metadata = JSON.parse(jsonString);
        
        // Find recoverable attribute
        const recoverableAttr = metadata.attributes.find(attr => attr.trait_type === 'Recoverable');
        expect(recoverableAttr.value).to.equal('Yes');
        
        console.log("✅ TokenURI reflects recovery status changes");
    });
});