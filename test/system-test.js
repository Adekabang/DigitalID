const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Digital Identity System", function () {
    let DigitalIdentityNFT;
    let ReputationSystem;
    let ModeratorControl;
    let digitalIdentityNFT;
    let reputationSystem;
    let moderatorControl;
    let owner;
    let moderator;
    let user1;
    let user2;

    beforeEach(async function () {
        // Get signers
        [owner, moderator, user1, user2] = await ethers.getSigners();

        // Deploy contracts
        DigitalIdentityNFT = await ethers.getContractFactory("DigitalIdentityNFT");
        digitalIdentityNFT = await DigitalIdentityNFT.deploy();
        await digitalIdentityNFT.deployed();

        ReputationSystem = await ethers.getContractFactory("ReputationSystem");
        reputationSystem = await ReputationSystem.deploy(digitalIdentityNFT.address);
        await reputationSystem.deployed();

        ModeratorControl = await ethers.getContractFactory("ModeratorControl");
        moderatorControl = await ModeratorControl.deploy(
            digitalIdentityNFT.address,
            reputationSystem.address
        );
        await moderatorControl.deployed();

        // Setup permissions and ownership
        // First, grant roles in ModeratorControl
        const MODERATOR_ROLE = await moderatorControl.MODERATOR_ROLE();
        const ORACLE_ROLE = await moderatorControl.ORACLE_ROLE();
        
        await moderatorControl.grantRole(MODERATOR_ROLE, moderator.address);
        await moderatorControl.grantRole(ORACLE_ROLE, moderator.address);

        // Then transfer ownership of other contracts
        await digitalIdentityNFT.transferOwnership(moderatorControl.address);
        await reputationSystem.transferOwnership(moderatorControl.address);
    });

    describe("Digital Identity Creation", function () {
        it("Should create a digital identity NFT", async function () {
            const did = "did:example:123";
            // Use ModeratorControl to create identity instead of direct call
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
    });

    describe("Reputation System", function () {
        beforeEach(async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
            await moderatorControl.connect(moderator).initializeUserScore(user1.address);
        });

        it("Should initialize user with correct score", async function () {
            const score = await reputationSystem.getUserScore(user1.address);
            expect(score).to.equal(100); // Initial score
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
    });

    describe("Moderation Control", function () {
        beforeEach(async function () {
            const did = "did:example:123";
            await moderatorControl.connect(moderator).createIdentity(user1.address, did);
            await moderatorControl.connect(moderator).initializeUserScore(user1.address);
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
            expect(caseDetails[0]).to.equal(user1.address);
            expect(caseDetails[1]).to.equal(0); // WARNING
            expect(caseDetails[2]).to.equal("Test warning");
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
    });
});
