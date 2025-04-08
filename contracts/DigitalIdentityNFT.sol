// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

contract DigitalIdentityNFT is ERC721, AccessControl, Pausable {
    using Counters for Counters.Counter;

    bytes32 public constant VERIFIER_ROLE = keccak256('VERIFIER_ROLE');
    bytes32 public constant RECOVERY_ROLE = keccak256('RECOVERY_ROLE');

    Counters.Counter private _tokenIds;

    enum VerificationLevel {
        UNVERIFIED, // Initial state
        BASIC_VERIFIED, // Email/Phone verified
        KYC_VERIFIED, // KYC completed
        FULL_VERIFIED // All verifications complete
    }

    struct Identity {
        string did;
        bool isVerified;
        uint256 creationDate;
        uint256 lastUpdate;
        VerificationLevel verificationLevel;
        mapping(string => string) metadata;
        bool isRecoverable;
        address recoveryAddress;
        uint256 lastVerificationDate;
    }

    // Main storage
    mapping(address => uint256) public addressToTokenId;
    mapping(uint256 => Identity) public identities;
    mapping(address => bool) public hasIdentity;
    mapping(string => bool) public registeredDIDs;

    // Verification tracking
    mapping(uint256 => mapping(address => bool)) public verifierApprovals;
    mapping(uint256 => uint256) public verificationCount;

    // Events
    event IdentityCreated(
        uint256 indexed tokenId,
        address indexed owner,
        string did
    );
    event IdentityVerified(uint256 indexed tokenId, VerificationLevel level);
    event MetadataUpdated(uint256 indexed tokenId, string key, string value);
    event VerificationLevelUpgraded(
        uint256 indexed tokenId,
        VerificationLevel newLevel
    );
    event RecoveryAddressSet(uint256 indexed tokenId, address recoveryAddress);
    event VerifierApproval(uint256 indexed tokenId, address indexed verifier);
    event IdentityTransferred(
        address indexed from,
        address indexed to,
        uint256 indexed tokenId,
        uint256 timestamp
    );

    constructor() ERC721('Digital Identity', 'DID') {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(VERIFIER_ROLE, msg.sender);
        _setupRole(RECOVERY_ROLE, msg.sender);
        _pause(); // Start paused for safety
    }

    // Override for compatibility between ERC721 and AccessControl
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // Modified identity creation function
    function createIdentity(
        address user,
        string memory did,
        string[] memory metadataKeys,
        string[] memory metadataValues
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused returns (uint256) {
        require(!hasIdentity[user], 'User already has an identity');
        require(!registeredDIDs[did], 'DID already registered');
        require(bytes(did).length > 0, 'DID cannot be empty');
        require(
            metadataKeys.length == metadataValues.length,
            'Metadata mismatch'
        );

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();

        _safeMint(user, newTokenId);

        Identity storage newIdentity = identities[newTokenId];
        newIdentity.did = did;
        newIdentity.isVerified = false;
        newIdentity.creationDate = block.timestamp;
        newIdentity.lastUpdate = block.timestamp;
        newIdentity.verificationLevel = VerificationLevel.UNVERIFIED;
        newIdentity.isRecoverable = false;
        newIdentity.lastVerificationDate = 0;

        // Set initial metadata
        for (uint256 i = 0; i < metadataKeys.length; i++) {
            require(bytes(metadataKeys[i]).length > 0, 'Empty metadata key');
            newIdentity.metadata[metadataKeys[i]] = metadataValues[i];
        }

        hasIdentity[user] = true;
        addressToTokenId[user] = newTokenId;
        registeredDIDs[did] = true;

        emit IdentityCreated(newTokenId, user, did);
        return newTokenId;
    }

    // New function for verification approval
    function approveVerification(
        uint256 tokenId,
        VerificationLevel newLevel
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        require(_exists(tokenId), 'Identity does not exist');
        require(
            uint256(newLevel) > uint256(identities[tokenId].verificationLevel),
            'Can only upgrade verification level'
        );
        require(
            !verifierApprovals[tokenId][msg.sender],
            'Verifier already approved'
        );

        verifierApprovals[tokenId][msg.sender] = true;
        verificationCount[tokenId]++;

        // Require 2 verifiers for higher levels
        if (uint256(newLevel) >= uint256(VerificationLevel.KYC_VERIFIED)) {
            require(
                verificationCount[tokenId] >= 2,
                'Requires multiple verifier approvals'
            );
        }

        // Update verification level
        identities[tokenId].verificationLevel = newLevel;
        identities[tokenId].lastVerificationDate = block.timestamp;
        identities[tokenId].lastUpdate = block.timestamp;

        emit VerificationLevelUpgraded(tokenId, newLevel);
        emit VerifierApproval(tokenId, msg.sender);
    }

    // Add recovery capability
    function setRecoveryAddress(
        uint256 tokenId,
        address recoveryAddress
    ) external whenNotPaused {
        require(msg.sender == ownerOf(tokenId), 'Not token owner');
        require(recoveryAddress != address(0), 'Invalid recovery address');
        require(!identities[tokenId].isRecoverable, 'Recovery already set');

        identities[tokenId].recoveryAddress = recoveryAddress;
        identities[tokenId].isRecoverable = true;
        identities[tokenId].lastUpdate = block.timestamp;

        emit RecoveryAddressSet(tokenId, recoveryAddress);
    }

    // View functions
    function getIdentityDetails(
        uint256 tokenId
    )
        external
        view
        returns (
            string memory did,
            bool isVerified,
            uint256 creationDate,
            uint256 lastUpdate,
            VerificationLevel level,
            bool isRecoverable,
            address recoveryAddress
        )
    {
        require(_exists(tokenId), 'Identity does not exist');
        Identity storage identity = identities[tokenId];

        return (
            identity.did,
            identity.isVerified,
            identity.creationDate,
            identity.lastUpdate,
            identity.verificationLevel,
            identity.isRecoverable,
            identity.recoveryAddress
        );
    }

    function getMetadata(
        uint256 tokenId,
        string memory key
    ) external view returns (string memory) {
        require(_exists(tokenId), 'Identity does not exist');
        return identities[tokenId].metadata[key];
    }

    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Transfer identity from one address to another
    function transferIdentity(
        address from,
        address to
    ) external onlyRole(RECOVERY_ROLE) whenNotPaused {
        require(hasIdentity[from], 'Source address has no identity');
        require(!hasIdentity[to], 'Target address already has identity');

        uint256 tokenId = addressToTokenId[from];
        require(_exists(tokenId), 'Identity does not exist');
        require(identities[tokenId].isRecoverable, 'Identity not recoverable');

        // Update mappings
        hasIdentity[from] = false;
        hasIdentity[to] = true;
        addressToTokenId[to] = tokenId;
        delete addressToTokenId[from];

        // Transfer the NFT
        _transfer(from, to, tokenId);

        // Update identity details
        identities[tokenId].lastUpdate = block.timestamp;

        emit IdentityTransferred(from, to, tokenId, block.timestamp);
    }
}
