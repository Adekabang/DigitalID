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
    
    // Error for unauthorized transfer attempts
    error TransferNotAllowed(uint256 tokenId);

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
    
    /**
     * @dev Override the default transfer behavior to restrict transfers
     * @notice This prevents regular transfer of the NFT
     */
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override {
        // Check if the caller is the recovery role contract (for recovery process only)
        if (!hasRole(RECOVERY_ROLE, msg.sender)) {
            revert TransferNotAllowed(tokenId);
        }
        
        // If we get here, it's a recovery transfer, so proceed with the normal transfer
        super._transfer(from, to, tokenId);
    }
    
    /**
     * @dev Override approval functions to prevent any approvals
     */
    function approve(address to, uint256 tokenId) public virtual override {
        revert TransferNotAllowed(tokenId);
    }
    
    function setApprovalForAll(address operator, bool approved) public virtual override {
        revert TransferNotAllowed(0); // Using 0 as a generic token ID for the error
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
    
    /**
     * @notice Get formatted identity details with human-readable dates
     * @dev Returns the identity details with dates in YYYY-MM-DD format
     * @param tokenId The token identifier
     * @return did The decentralized identifier of the identity
     * @return isVerified Whether the identity is verified
     * @return creationDate The formatted creation date in YYYY-MM-DD format
     * @return lastUpdate The formatted last update date in YYYY-MM-DD format
     * @return verificationLevel The verification level as a human-readable string
     * @return isRecoverable Whether the identity has recovery enabled
     * @return recoveryAddress The address assigned for recovery
     * @return lastVerificationDate The formatted date of last verification or "Not verified yet"
     */
    function getFormattedIdentityDetails(
        uint256 tokenId
    )
        external
        view
        returns (
            string memory did,
            bool isVerified,
            string memory creationDate,
            string memory lastUpdate,
            string memory verificationLevel,
            bool isRecoverable,
            address recoveryAddress,
            string memory lastVerificationDate
        )
    {
        require(_exists(tokenId), 'Identity does not exist');
        Identity storage identity = identities[tokenId];

        return (
            identity.did,
            identity.isVerified,
            _formatTimestamp(identity.creationDate),
            _formatTimestamp(identity.lastUpdate),
            _verificationLevelToString(identity.verificationLevel),
            identity.isRecoverable,
            identity.recoveryAddress,
            identity.lastVerificationDate > 0 ? _formatTimestamp(identity.lastVerificationDate) : "Not verified yet"
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
        if (level == VerificationLevel.UNVERIFIED) return '#9da3af';
        if (level == VerificationLevel.BASIC_VERIFIED) return '#4ade80';
        if (level == VerificationLevel.KYC_VERIFIED) return '#3b82f6';
        if (level == VerificationLevel.FULL_VERIFIED) return '#8b5cf6';
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
                    '<defs>',
                    '<linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">',
                    '<stop offset="0%" stop-color="#f8f9fa" />',
                    '<stop offset="100%" stop-color="#e9ecef" />',
                    '</linearGradient>',
                    '</defs>',
                    '<rect width="100%" height="100%" fill="url(#bgGradient)" />',
                    '<rect x="20" y="20" width="310" height="310" rx="20" fill="white" stroke="#e0e0e0" stroke-width="2" filter="drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.1))" />',
                    // Title and border with modern gradient
                    '<linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="0%">',
                    '<stop offset="0%" stop-color="#4361ee" />',
                    '<stop offset="100%" stop-color="#3a0ca3" />',
                    '</linearGradient>',
                    '<rect x="35" y="35" width="280" height="50" rx="10" fill="url(#headerGradient)" />',
                    '<text x="175" y="65" font-family="Arial, sans-serif" font-weight="bold" font-size="20" fill="white" text-anchor="middle" dominant-baseline="middle">DIGITAL IDENTITY</text>',
                    // DID and Address
                    '<text x="175" y="105" font-family="Arial, sans-serif" font-size="14" fill="#333333" text-anchor="middle">ID: ',
                    Strings.toString(tokenId),
                    '</text>',
                    // DID with word-wrap (containing foreignObject to allow text wrapping)
                    '<foreignObject x="45" y="115" width="260" height="30">',
                    '<div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 12px; color: #666666; text-align: center; overflow-wrap: break-word; word-break: break-all;">',
                    identity.did,
                    '</div>',
                    '</foreignObject>',
                    '<text x="175" y="155" font-family="Arial, sans-serif" font-size="12" fill="#666666" text-anchor="middle">Owner: ',
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
        string memory verifierCountStr = Strings.toString(
            verificationCount[tokenId]
        );

        return
            string(
                abi.encodePacked(
                    // Verification Level with pill-like shape and light shadow
                    '<rect x="75" y="170" width="200" height="40" rx="20" fill="',
                    levelColor,
                    '" filter="drop-shadow(0px 2px 3px rgba(0, 0, 0, 0.1))" />',
                    '<text x="175" y="195" font-family="Arial, sans-serif" font-weight="bold" font-size="16" fill="white" text-anchor="middle" dominant-baseline="middle">',
                    levelString,
                    '</text>',
                    // Creation Date with modern styling
                    '<rect x="75" y="220" width="200" height="25" rx="5" fill="#f8f9fa" stroke="#e0e0e0" stroke-width="1" />',
                    '<text x="175" y="237" font-family="Arial, sans-serif" font-size="12" fill="#333333" text-anchor="middle">Created: ',
                    _formatTimestamp(identity.creationDate),
                    '</text>',
                    // Recovery status with modern styling
                    '<rect x="75" y="255" width="200" height="25" rx="5" fill="#f8f9fa" stroke="#e0e0e0" stroke-width="1" />',
                    '<text x="175" y="272" font-family="Arial, sans-serif" font-size="12" fill="#333333" text-anchor="middle">',
                    identity.isRecoverable
                        ? 'Recovery Enabled'
                        : 'No Recovery Set',
                    '</text>',
                    // Footer with verification count in modern style
                    '<rect x="35" y="290" width="280" height="30" rx="15" fill="#f0f0f0" filter="drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.05))" />',
                    '<text x="175" y="310" font-family="Arial, sans-serif" font-size="12" fill="#333333" text-anchor="middle">Verifiers: ',
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
     * @return A formatted date string in YYYY-MM-DD format
     */
    function _formatTimestamp(
        uint256 timestamp
    ) internal pure returns (string memory) {
        // Converting Unix timestamp to YYYY-MM-DD format
        // This is a simplified version since Solidity has limited date/time functionality
        
        // Get days since January 1, 1970 (Unix epoch)
        uint256 day = timestamp / 86400; // 86400 seconds in a day
        
        // Simplified algorithm to calculate year, month, day
        uint256 year = 1970;
        uint256 daysInYear = 365;
        
        // Account for leap years
        while (day > daysInYear) {
            bool isLeapYear = (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
            daysInYear = isLeapYear ? 366 : 365;
            if (day >= daysInYear) {
                day -= daysInYear;
                year++;
            }
        }
        
        // Calculate month and day
        uint8[12] memory daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        
        // Adjust February for leap year
        if (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)) {
            daysInMonth[1] = 29;
        }
        
        uint256 month = 0;
        while (month < 12 && day >= daysInMonth[month]) {
            day -= daysInMonth[month];
            month++;
        }
        
        // Add 1 to month (1-based) and day (1-based)
        month++;
        day++;
        
        // Format as YYYY-MM-DD
        return string(
            abi.encodePacked(
                Strings.toString(year),
                "-",
                month < 10 ? string(abi.encodePacked("0", Strings.toString(month))) : Strings.toString(month),
                "-",
                day < 10 ? string(abi.encodePacked("0", Strings.toString(day))) : Strings.toString(day)
            )
        );
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
