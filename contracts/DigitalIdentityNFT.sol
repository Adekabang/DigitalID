// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/utils/Counters.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
import '@openzeppelin/contracts/utils/Base64.sol';

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

    // --- Add this view function ---
    /**
     * @notice Returns the current highest assigned token ID.
     * @dev Useful for understanding the total number of minted tokens.
     */
    function getCurrentTokenId() external view returns (uint256) {
        return _tokenIds.current();
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

    /**
     * @notice Returns a verification level as a string representation
     * @param level The verification level enum value
     * @return A string representing the verification level
     */
    function _verificationLevelToString(
        VerificationLevel level
    ) internal pure returns (string memory) {
        if (level == VerificationLevel.UNVERIFIED) return 'UNVERIFIED';
        if (level == VerificationLevel.BASIC_VERIFIED) return 'BASIC VERIFIED';
        if (level == VerificationLevel.KYC_VERIFIED) return 'KYC VERIFIED';
        if (level == VerificationLevel.FULL_VERIFIED) return 'FULLY VERIFIED';
        return 'UNKNOWN';
    }

    /**
     * @notice Returns the color associated with a verification level
     * @param level The verification level enum value
     * @return A hex color code string
     */
    function _getVerificationLevelColor(
        VerificationLevel level
    ) internal pure returns (string memory) {
        if (level == VerificationLevel.UNVERIFIED) return '#CCCCCC';
        if (level == VerificationLevel.BASIC_VERIFIED) return '#66CC77';
        if (level == VerificationLevel.KYC_VERIFIED) return '#3399FF';
        if (level == VerificationLevel.FULL_VERIFIED) return '#9966CC';
        return '#FFFFFF';
    }

    /**
     * @notice Generates an SVG image for the token
     * @param tokenId The token ID
     * @return SVG string representation of the identity badge
     */
    function _generateSVG(
        uint256 tokenId
    ) internal view returns (string memory) {
        require(_exists(tokenId), 'Token does not exist');

        // Break this function into smaller parts to avoid stack depth issues
        string memory part1 = _generateSVGPart1(tokenId);
        string memory part2 = _generateSVGPart2(tokenId);

        return string(abi.encodePacked(part1, part2));
    }

    function _generateSVGPart1(
        uint256 tokenId
    ) internal view returns (string memory) {
        Identity storage identity = identities[tokenId];
        string memory shortAddress = _formatAddress(ownerOf(tokenId));

        return
            string(
                abi.encodePacked(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
                    '<rect width="100%" height="100%" fill="#f9f9f9" />',
                    '<rect x="20" y="20" width="310" height="310" rx="15" fill="white" stroke="#333333" stroke-width="2" />',
                    // Title and border
                    '<rect x="35" y="35" width="280" height="50" rx="10" fill="#333333" />',
                    '<text x="175" y="65" font-family="Arial" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle">DIGITAL IDENTITY</text>',
                    // DID and Address
                    '<text x="175" y="105" font-family="Arial" font-size="14" fill="#333333" text-anchor="middle">ID: ',
                    Strings.toString(tokenId),
                    '</text>',
                    '<text x="175" y="125" font-family="Arial" font-size="12" fill="#666666" text-anchor="middle">',
                    identity.did,
                    '</text>',
                    '<text x="175" y="145" font-family="Arial" font-size="12" fill="#666666" text-anchor="middle">Owner: ',
                    shortAddress,
                    '</text>'
                )
            );
    }

    function _generateSVGPart2(
        uint256 tokenId
    ) internal view returns (string memory) {
        Identity storage identity = identities[tokenId];
        string memory levelString = _verificationLevelToString(
            identity.verificationLevel
        );
        string memory levelColor = _getVerificationLevelColor(
            identity.verificationLevel
        );
        string memory formattedCreationDate = _formatTimestamp(
            identity.creationDate
        );
        string memory verifierCountStr = Strings.toString(
            verificationCount[tokenId]
        );

        return
            string(
                abi.encodePacked(
                    // Verification Level
                    '<rect x="75" y="165" width="200" height="40" rx="5" fill="',
                    levelColor,
                    '" />',
                    '<text x="175" y="190" font-family="Arial" font-size="16" fill="white" text-anchor="middle" dominant-baseline="middle">',
                    levelString,
                    '</text>',
                    // Creation Date
                    '<text x="175" y="230" font-family="Arial" font-size="12" fill="#333333" text-anchor="middle">Created on: ',
                    formattedCreationDate,
                    '</text>',
                    // Recovery status
                    '<text x="175" y="260" font-family="Arial" font-size="12" fill="#333333" text-anchor="middle">',
                    identity.isRecoverable
                        ? 'Recovery Enabled'
                        : 'No Recovery Set',
                    '</text>',
                    // Footer with verification count
                    '<rect x="35" y="285" width="280" height="30" rx="5" fill="#f0f0f0" />',
                    '<text x="175" y="305" font-family="Arial" font-size="12" fill="#333333" text-anchor="middle">Verifiers: ',
                    verifierCountStr,
                    '</text>',
                    '</svg>'
                )
            );
    }

    /**
     * @notice Format an address to display only the first and last 6 characters
     * @param addr The address to format
     * @return A formatted string like 0x1234...5678
     */
    function _formatAddress(
        address addr
    ) internal pure returns (string memory) {
        string memory addrString = Strings.toHexString(
            uint256(uint160(addr)),
            20
        );
        return
            string(
                abi.encodePacked(
                    _substring(addrString, 0, 6),
                    '...',
                    _substring(addrString, 38, 42)
                )
            );
    }

    /**
     * @notice Extract a substring from a string
     * @param str The source string
     * @param startIndex Start position (inclusive)
     * @param endIndex End position (exclusive)
     * @return The extracted substring
     */
    function _substring(
        string memory str,
        uint256 startIndex,
        uint256 endIndex
    ) internal pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        bytes memory result = new bytes(endIndex - startIndex);
        for (uint256 i = startIndex; i < endIndex; i++) {
            result[i - startIndex] = strBytes[i];
        }
        return string(result);
    }

    /**
     * @notice Format a timestamp into a human-readable date
     * @param timestamp The unix timestamp
     * @return A formatted date string
     */
    function _formatTimestamp(
        uint256 timestamp
    ) internal pure returns (string memory) {
        // Simple timestamp conversion - in real app, you'd want a better date formatting
        return Strings.toString(timestamp);
    }

    /**
     * @notice Get token URI for the specified token ID
     * @dev Overrides ERC721 tokenURI function to provide on-chain metadata
     * @param tokenId The token identifier
     * @return The token URI with Base64 encoded JSON metadata
     */
    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        require(_exists(tokenId), 'URI query for nonexistent token');

        Identity storage identity = identities[tokenId];
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name": "Digital Identity #',
                        Strings.toString(tokenId),
                        '", "description": "Blockchain-based Digital Identity NFT", "image": "data:image/svg+xml;base64,',
                        Base64.encode(bytes(_generateSVG(tokenId))),
                        '", "attributes": [',
                        '{"trait_type": "DID", "value": "',
                        identity.did,
                        '"}, ',
                        '{"trait_type": "Verification Level", "value": "',
                        _verificationLevelToString(identity.verificationLevel),
                        '"}, ',
                        '{"trait_type": "Creation Date", "value": ',
                        Strings.toString(identity.creationDate),
                        '}, ',
                        '{"trait_type": "Last Update", "value": ',
                        Strings.toString(identity.lastUpdate),
                        '}, ',
                        '{"trait_type": "Recoverable", "value": "',
                        identity.isRecoverable ? 'Yes' : 'No',
                        '"}, ',
                        '{"trait_type": "Verifier Count", "value": ',
                        Strings.toString(verificationCount[tokenId]),
                        '}',
                        ']}'
                    )
                )
            )
        );

        return string(abi.encodePacked('data:application/json;base64,', json));
    }
}
