// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import './IDigitalIdentityNFT.sol';

contract VerificationRegistry is AccessControl, Pausable {
    using ECDSA for bytes32;

    bytes32 public constant VERIFIER_ROLE = keccak256('VERIFIER_ROLE');
    bytes32 public constant RECOVERY_AGENT_ROLE =
        keccak256('RECOVERY_AGENT_ROLE');

    IDigitalIdentityNFT public digitalIdentity;

    // Verification types
    enum VerificationType {
        KYC,
        DOCUMENT,
        BIOMETRIC,
        TWO_FACTOR,
        SOCIAL
    }

    // Verification status
    struct VerificationStatus {
        bool isVerified;
        uint256 timestamp;
        address verifier;
        string metadata;
    }

    // Recovery information
    struct RecoveryInfo {
        address[] recoveryContacts;
        uint256 minConfirmations;
        uint256 timelock;
        bool isActive;
    }

    // Verification attempt
    struct VerificationAttempt {
        uint256 timestamp;
        bool success;
        string details;
    }

    // Mappings
    mapping(address => mapping(VerificationType => VerificationStatus))
        public verifications;
    mapping(address => RecoveryInfo) public recoverySettings;
    mapping(address => mapping(address => bool)) public isRecoveryContact;
    mapping(address => VerificationAttempt[]) public verificationHistory;
    mapping(address => mapping(bytes32 => bool)) public usedSignatures;

    // Recovery request
    struct RecoveryRequest {
        address oldAddress;
        address newAddress;
        uint256 timestamp;
        uint256 confirmations;
        mapping(address => bool) hasConfirmed;
        bool isExecuted;
    }

    mapping(bytes32 => RecoveryRequest) public recoveryRequests;

    // Events
    event VerificationCompleted(
        address indexed user,
        VerificationType verificationType,
        bool success
    );
    event RecoverySetupCompleted(
        address indexed user,
        address[] recoveryContacts,
        uint256 minConfirmations
    );
    event RecoveryRequestCreated(
        bytes32 indexed requestId,
        address indexed oldAddress,
        address indexed newAddress
    );
    event RecoveryConfirmation(
        bytes32 indexed requestId,
        address indexed confirmer
    );
    event RecoveryExecuted(
        bytes32 indexed requestId,
        address indexed oldAddress,
        address indexed newAddress
    );
    event VerificationAttemptLogged(
        address indexed user,
        VerificationType verificationType,
        bool success
    );

    constructor(address _digitalIdentity) {
        digitalIdentity = IDigitalIdentityNFT(_digitalIdentity);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(VERIFIER_ROLE, msg.sender);
        _setupRole(RECOVERY_AGENT_ROLE, msg.sender);
    }

    // Verification Functions
    function verify(
        address user,
        VerificationType verificationType,
        string memory metadata,
        bytes memory signature
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        require(
            digitalIdentity.hasIdentity(user),
            'User must have digital identity'
        );

        // Verify signature if provided
        if (signature.length > 0) {
            bytes32 messageHash = keccak256(
                abi.encodePacked(user, uint256(verificationType), metadata)
            );
            bytes32 signedHash = messageHash.toEthSignedMessageHash();
            require(
                !usedSignatures[user][signedHash],
                'Signature already used'
            );
            require(signedHash.recover(signature) == user, 'Invalid signature');
            usedSignatures[user][signedHash] = true;
        }

        // Update verification status
        verifications[user][verificationType] = VerificationStatus({
            isVerified: true,
            timestamp: block.timestamp,
            verifier: msg.sender,
            metadata: metadata
        });

        // Log verification attempt
        VerificationAttempt memory attempt = VerificationAttempt({
            timestamp: block.timestamp,
            success: true,
            details: metadata
        });
        verificationHistory[user].push(attempt);

        emit VerificationCompleted(user, verificationType, true);
        emit VerificationAttemptLogged(user, verificationType, true);
    }

    // Recovery Setup Functions
    function setupRecovery(
        address[] calldata recoveryContacts,
        uint256 minConfirmations,
        uint256 timelock
    ) external {
        require(
            digitalIdentity.hasIdentity(msg.sender),
            'Must have digital identity'
        );
        require(
            recoveryContacts.length >= minConfirmations,
            'Too few recovery contacts'
        );
        require(minConfirmations >= 2, 'Minimum 2 confirmations required');
        require(timelock >= 1 days, 'Timelock must be at least 1 day');

        // Clear previous recovery contacts
        if (recoverySettings[msg.sender].isActive) {
            address[] memory oldContacts = recoverySettings[msg.sender]
                .recoveryContacts;
            for (uint256 i = 0; i < oldContacts.length; i++) {
                isRecoveryContact[msg.sender][oldContacts[i]] = false;
            }
        }

        // Set new recovery contacts
        for (uint256 i = 0; i < recoveryContacts.length; i++) {
            require(
                recoveryContacts[i] != address(0),
                'Invalid recovery contact'
            );
            isRecoveryContact[msg.sender][recoveryContacts[i]] = true;
        }

        recoverySettings[msg.sender] = RecoveryInfo({
            recoveryContacts: recoveryContacts,
            minConfirmations: minConfirmations,
            timelock: timelock,
            isActive: true
        });

        emit RecoverySetupCompleted(
            msg.sender,
            recoveryContacts,
            minConfirmations
        );
    }

    // Recovery Request Functions
    function initiateRecovery(
        address oldAddress,
        address newAddress
    ) external onlyRole(RECOVERY_AGENT_ROLE) {
        require(
            digitalIdentity.hasIdentity(oldAddress),
            'Old address must have identity'
        );
        require(
            !digitalIdentity.hasIdentity(newAddress),
            'New address already has identity'
        );
        require(
            recoverySettings[oldAddress].isActive,
            'No active recovery setup'
        );

        bytes32 requestId = keccak256(
            abi.encodePacked(oldAddress, newAddress, block.timestamp)
        );

        RecoveryRequest storage request = recoveryRequests[requestId];
        request.oldAddress = oldAddress;
        request.newAddress = newAddress;
        request.timestamp = block.timestamp;
        request.confirmations = 0;
        request.isExecuted = false;

        emit RecoveryRequestCreated(requestId, oldAddress, newAddress);
    }

    function confirmRecovery(bytes32 requestId) external {
        RecoveryRequest storage request = recoveryRequests[requestId];
        require(!request.isExecuted, 'Recovery already executed');
        require(
            isRecoveryContact[request.oldAddress][msg.sender],
            'Not a recovery contact'
        );
        require(!request.hasConfirmed[msg.sender], 'Already confirmed');

        request.hasConfirmed[msg.sender] = true;
        request.confirmations++;

        emit RecoveryConfirmation(requestId, msg.sender);

        // Check if we have enough confirmations and timelock has passed
        if (
            request.confirmations >=
            recoverySettings[request.oldAddress].minConfirmations &&
            block.timestamp >=
            request.timestamp + recoverySettings[request.oldAddress].timelock
        ) {
            executeRecovery(requestId);
        }
    }

    function executeRecovery(bytes32 requestId) internal {
        RecoveryRequest storage request = recoveryRequests[requestId];
        require(!request.isExecuted, 'Recovery already executed');

        request.isExecuted = true;

        // Transfer identity using the interface method
        digitalIdentity.transferIdentity(
            request.oldAddress,
            request.newAddress
        );

        emit RecoveryExecuted(
            requestId,
            request.oldAddress,
            request.newAddress
        );
    }

    // Utility Functions
    function getVerificationStatus(
        address user,
        VerificationType verificationType
    ) external view returns (VerificationStatus memory) {
        return verifications[user][verificationType];
    }

    function getVerificationHistory(
        address user
    ) external view returns (VerificationAttempt[] memory) {
        return verificationHistory[user];
    }

    function getRecoveryContacts(
        address user
    ) external view returns (address[] memory) {
        return recoverySettings[user].recoveryContacts;
    }

    // Admin Functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
