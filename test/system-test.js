const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Digital Identity System", function () {
    let DigitalIdentityNFT;
    let ReputationSystem;
    let ModeratorControl;
    let AppealSystem;
    let MultiFactorAuth;
    let VerificationRegistry;
    
    let digitalIdentityNFT;
    let reputationSystem;
    let moderatorControl;
    let appealSystem;
    let multiFactorAuth;
    let verificationRegistry;
    
    let owner;
    let moderator;
    let reviewer;
    let user1;
    let user2;

    beforeEach(async function () {
        // Get signers
        [owner, moderator, reviewer, user1, user2] = await ethers.getSigners();

        // Deploy contracts
        DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
        digitalIdentityNFT = await DigitalIdentityNFT.deploy();
        await digitalIdentityNFT.deployed();
        
        // Unpause the DigitalIdentityNFT contract (it starts paused)
        await digitalIdentityNFT.unpause();

        ReputationSystem = await ethers.getContractFactory("ReputationSystem");
        reputationSystem = await ReputationSystem.deploy(digitalIdentityNFT.address);
        await reputationSystem.deployed();

        ModeratorControl = await ethers.getContractFactory("ModeratorControl");
        moderatorControl = await ModeratorControl.deploy(
            digitalIdentityNFT.address,
            reputationSystem.address
        );
        await moderatorControl.deployed();
        
        AppealSystem = await ethers.getContractFactory("AppealSystem");
        appealSystem = await AppealSystem.deploy(
            moderatorControl.address,
            reputationSystem.address
        );
        await appealSystem.deployed();
        
        MultiFactorAuth = await ethers.getContractFactory("MultiFactorAuth");
        multiFactorAuth = await MultiFactorAuth.deploy(digitalIdentityNFT.address);
        await multiFactorAuth.deployed();
        
        VerificationRegistry = await ethers.getContractFactory("VerificationRegistry");
        verificationRegistry = await VerificationRegistry.deploy(digitalIdentityNFT.address);
        await verificationRegistry.deployed();

        // Setup permissions and ownership
        // Grant roles in ModeratorControl
        const MODERATOR_ROLE = await moderatorControl.MODERATOR_ROLE();
        const ORACLE_ROLE = await moderatorControl.ORACLE_ROLE();
        const VERIFIER_ROLE = await digitalIdentityNFT.VERIFIER_ROLE();
        const APPEAL_REVIEWER_ROLE = await appealSystem.APPEAL_REVIEWER_ROLE();
        
        await moderatorControl.grantRole(MODERATOR_ROLE, moderator.address);
        await moderatorControl.grantRole(ORACLE_ROLE, moderator.address);
        
        // Set the AppealSystem in ModeratorControl
        await moderatorControl.setAppealSystem(appealSystem.address);
        
        // Grant VERIFIER_ROLE to ModeratorControl in DigitalIdentityNFT
        await digitalIdentityNFT.grantRole(VERIFIER_ROLE, moderatorControl.address);
        
        // Add reviewer to AppealSystem
        await appealSystem.addReviewer(reviewer.address);

        // Transfer ownership of other contracts
        await reputationSystem.transferOwnership(moderatorControl.address);
    });

    describe("Digital Identity Creation", function () {
        it("Should create a digital identity NFT", async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
            expect(await digitalIdentityNFT.hasIdentity(user1.address)).to.be.true;
        });

        it("Should not allow duplicate identities", async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
            await expect(
                moderatorControl.connect(moderator).createIdentity(user1.address, did)
            ).to.be.revertedWith("User already has an identity");
        });
        
        it("Should assign a token ID to the identity", async function() {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
            const tokenId = await digitalIdentityNFT.addressToTokenId(user1.address);
            expect(tokenId).to.be.gt(0);
        });
    });

    describe("Reputation System", function () {
        beforeEach(async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
        });

        it("Should initialize user with correct score", async function () {
            const score = await reputationSystem.getUserScore(user1.address);
            expect(score).to.equal(100); // Initial score is set during identity creation
        });

        it("Should update score based on restrictions", async function () {
            await moderatorControl
                .connect(moderator)
                .createModerationCase(
                    user1.address,
                    0, // WARNING
                    "Test warning"
                );

            const score = await reputationSystem.getUserScore(user1.address);
            expect(score).to.be.lt(100); // Score should be reduced
        });
        
        it("Should provide full score details", async function() {
            const fullScore = await reputationSystem.getUserFullScore(user1.address);
            expect(fullScore.score).to.equal(100);
            expect(fullScore.isBanned).to.be.false;
            expect(fullScore.totalPositivePoints).to.equal(0);
            expect(fullScore.totalNegativePoints).to.equal(0);
        });
    });

    describe("Moderation Control", function () {
        beforeEach(async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
        });

        it("Should create moderation case", async function () {
            await moderatorControl
                .connect(moderator)
                .createModerationCase(
                    user1.address,
                    0, // WARNING
                    "Test warning"
                );

            const caseCount = await moderatorControl.getTotalCases();
            expect(caseCount).to.equal(1);

            const caseDetails = await moderatorControl.getCaseDetails(0);
            expect(caseDetails.user).to.equal(user1.address);
            expect(caseDetails.actionType).to.equal(0); // WARNING
            expect(caseDetails.reason).to.equal("Test warning");
        });

        it("Should enforce restriction thresholds", async function () {
            await moderatorControl
                .connect(moderator)
                .createModerationCase(
                    user1.address,
                    2, // SEVERE_RESTRICTION
                    "Severe violation"
                );

            const restriction = await moderatorControl.userRestrictions(user1.address);
            expect(restriction).to.equal(2); // SEVERE_RESTRICTION
        });
        
        it("Should track user cases", async function() {
            await moderatorControl
                .connect(moderator)
                .createModerationCase(
                    user1.address,
                    0, // WARNING
                    "First warning"
                );
                
            await moderatorControl
                .connect(moderator)
                .createModerationCase(
                    user1.address,
                    1, // RESTRICTION
                    "Second violation"
                );
                
            const userCases = await moderatorControl.getUserCases(user1.address);
            expect(userCases.length).to.equal(2);
        });
    });
    
    describe("Identity Verification", function() {
        beforeEach(async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
        });
        
        it("Should approve identity verification", async function() {
            // Approve BASIC_VERIFIED level
            await moderatorControl.connect(moderator).approveIdentityVerification(
                user1.address,
                1 // BASIC_VERIFIED
            );
            
            const tokenId = await digitalIdentityNFT.addressToTokenId(user1.address);
            const details = await digitalIdentityNFT.getIdentityDetails(tokenId);
            expect(details.level).to.equal(1); // BASIC_VERIFIED
        });
    });
    
    describe("Appeal System", function() {
        let signature;
        
        before(async function() {
            // Create a function to generate signatures for appeals using EIP-712
            this.signAppealRequest = async function(signer, user, reason, evidence, caseId, nonce) {
                const domainType = [
                    { name: "name", type: "string" },
                    { name: "version", type: "string" },
                    { name: "chainId", type: "uint256" },
                    { name: "verifyingContract", type: "address" }
                ];

                const permitType = [
                    { name: "user", type: "address" },
                    { name: "reason", type: "string" },
                    { name: "evidence", type: "string" },
                    { name: "caseId", type: "uint256" },
                    { name: "nonce", type: "uint256" }
                ];

                const domain = {
                    name: "AppealSystem",
                    version: "1",
                    chainId: (await ethers.provider.getNetwork()).chainId,
                    verifyingContract: appealSystem.address
                };

                const message = {
                    user: user,
                    reason: reason,
                    evidence: evidence,
                    caseId: caseId,
                    nonce: nonce
                };

                // Get the EIP-712 digest
                const types = {
                    EIP712Domain: domainType,
                    AppealRequest: permitType
                };

                const signature = await signer._signTypedData(domain, { AppealRequest: permitType }, message);
                return signature;
            };
        });
        
        beforeEach(async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
            
            // Create a restriction
            await moderatorControl
                .connect(moderator)
                .createModerationCase(
                    user1.address,
                    1, // RESTRICTION
                    "Test restriction for appeal"
                );
                
            // Get user's nonce
            const nonce = await appealSystem.getUserNonce(user1.address);
            
            // Create signature for appeal
            signature = await this.signAppealRequest(
                user1,
                user1.address,
                "I believe this restriction was unfair",
                "Evidence link: https://example.com/evidence",
                0, // caseId
                nonce
            );
        });
        
        it("Should submit an appeal with valid signature", async function() {
            await appealSystem.submitAppeal(
                user1.address,
                "I believe this restriction was unfair",
                "Evidence link: https://example.com/evidence",
                0, // caseId
                signature
            );
            
            const appealsCount = await appealSystem.getUserAppealsCount(user1.address);
            expect(appealsCount).to.equal(1);
            
            const appeal = await appealSystem.getAppealDetails(user1.address, 0);
            expect(appeal.status).to.equal(0); // PENDING
        });
    });
});
