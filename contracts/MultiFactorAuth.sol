// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import './IDigitalIdentityNFT.sol';

contract MultiFactorAuth is AccessControl, Pausable {
    using ECDSA for bytes32;

    bytes32 public constant MFA_VERIFIER_ROLE = keccak256('MFA_VERIFIER_ROLE');
    IDigitalIdentityNFT public digitalIdentity;

    // MFA Factor Types
    enum FactorType {
        NONE,
        EMAIL,
        PHONE,
        AUTHENTICATOR,
        BIOMETRIC,
        HARDWARE_KEY
    }

    // MFA Status
    struct MFAStatus {
        bool isEnabled;
        FactorType[] enabledFactors;
        uint256 lastVerified;
        address verifier;
        mapping(FactorType => bool) factorStatus;
        mapping(FactorType => uint256) factorTimestamp;
    }

    // Auth Session
    struct AuthSession {
        bytes32 sessionId;
        uint256 timestamp;
        uint256 expiryTime;
        bool isValid;
        FactorType[] completedFactors;
        mapping(FactorType => bool) factorCompletion;
    }

    // Mappings
    mapping(address => MFAStatus) public mfaStatus;
    mapping(address => AuthSession) public currentSession;
    mapping(bytes32 => bool) public usedChallenges;

    // Events
    event MFAEnabled(address indexed user, FactorType[] factors);
    event FactorVerified(address indexed user, FactorType factor);
    event SessionCreated(address indexed user, bytes32 sessionId);
    event SessionCompleted(address indexed user, bytes32 sessionId);
    event MFADisabled(address indexed user);
    event FactorAdded(address indexed user, FactorType factor);
    event FactorRemoved(address indexed user, FactorType factor);

    constructor(address _digitalIdentity) {
        digitalIdentity = IDigitalIdentityNFT(_digitalIdentity);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MFA_VERIFIER_ROLE, msg.sender);
    }

    // Enable MFA with specific factors
    function enableMFA(FactorType[] calldata factors) external whenNotPaused {
        require(
            digitalIdentity.hasIdentity(msg.sender),
            'Must have digital identity'
        );
        require(!mfaStatus[msg.sender].isEnabled, 'MFA already enabled');
        require(factors.length > 0, 'No factors specified');

        MFAStatus storage status = mfaStatus[msg.sender];
        status.isEnabled = true;

        for (uint256 i = 0; i < factors.length; i++) {
            require(factors[i] != FactorType.NONE, 'Invalid factor');
            status.enabledFactors.push(factors[i]);
            status.factorStatus[factors[i]] = false;
        }

        emit MFAEnabled(msg.sender, factors);
    }

    // Start a new authentication session
    function startAuthSession() external whenNotPaused returns (bytes32) {
        require(mfaStatus[msg.sender].isEnabled, 'MFA not enabled');

        bytes32 sessionId = keccak256(
            abi.encodePacked(
                msg.sender,
                block.timestamp,
                blockhash(block.number - 1)
            )
        );

        AuthSession storage session = currentSession[msg.sender];
        session.sessionId = sessionId;
        session.timestamp = block.timestamp;
        session.expiryTime = block.timestamp + 15 minutes;
        session.isValid = true;

        delete session.completedFactors;

        emit SessionCreated(msg.sender, sessionId);
        return sessionId;
    }

    // Verify a specific factor in the current session
    function verifyFactor(
        FactorType factor,
        bytes32 challenge,
        bytes memory signature
    ) external whenNotPaused {
        require(mfaStatus[msg.sender].isEnabled, 'MFA not enabled');
        require(currentSession[msg.sender].isValid, 'No valid session');
        require(
            block.timestamp <= currentSession[msg.sender].expiryTime,
            'Session expired'
        );
        require(!usedChallenges[challenge], 'Challenge already used');

        // Verify the challenge signature
        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, factor, challenge)
        );
        require(
            messageHash.toEthSignedMessageHash().recover(signature) ==
                msg.sender,
            'Invalid signature'
        );

        AuthSession storage session = currentSession[msg.sender];
        require(!session.factorCompletion[factor], 'Factor already completed');

        // Mark challenge as used
        usedChallenges[challenge] = true;

        // Mark factor as completed
        session.factorCompletion[factor] = true;
        session.completedFactors.push(factor);

        emit FactorVerified(msg.sender, factor);

        // Check if all required factors are completed
        if (_areAllFactorsCompleted(msg.sender)) {
            _completeSession(msg.sender);
        }
    }

    // Add a new factor to existing MFA setup
    function addFactor(FactorType factor) external whenNotPaused {
        require(mfaStatus[msg.sender].isEnabled, 'MFA not enabled');
        require(factor != FactorType.NONE, 'Invalid factor');
        require(
            !mfaStatus[msg.sender].factorStatus[factor],
            'Factor already enabled'
        );

        MFAStatus storage status = mfaStatus[msg.sender];
        status.enabledFactors.push(factor);
        status.factorStatus[factor] = false;

        emit FactorAdded(msg.sender, factor);
    }

    // Remove a factor from MFA setup
    function removeFactor(FactorType factor) external whenNotPaused {
        require(mfaStatus[msg.sender].isEnabled, 'MFA not enabled');
        require(
            mfaStatus[msg.sender].enabledFactors.length > 1,
            'Cannot remove last factor'
        );

        MFAStatus storage status = mfaStatus[msg.sender];

        // Remove factor from array
        uint256 length = status.enabledFactors.length;
        for (uint256 i = 0; i < length; i++) {
            if (status.enabledFactors[i] == factor) {
                status.enabledFactors[i] = status.enabledFactors[length - 1];
                status.enabledFactors.pop();
                break;
            }
        }

        status.factorStatus[factor] = false;
        status.factorTimestamp[factor] = 0;

        emit FactorRemoved(msg.sender, factor);
    }

    // Disable MFA completely
    function disableMFA() external whenNotPaused {
        require(mfaStatus[msg.sender].isEnabled, 'MFA not enabled');

        delete mfaStatus[msg.sender];
        emit MFADisabled(msg.sender);
    }

    // Internal helper functions
    function _areAllFactorsCompleted(
        address user
    ) internal view returns (bool) {
        AuthSession storage session = currentSession[user];
        MFAStatus storage status = mfaStatus[user];

        for (uint256 i = 0; i < status.enabledFactors.length; i++) {
            if (!session.factorCompletion[status.enabledFactors[i]]) {
                return false;
            }
        }
        return true;
    }

    function _completeSession(address user) internal {
        AuthSession storage session = currentSession[user];
        session.isValid = false;

        // Update MFA status
        MFAStatus storage status = mfaStatus[user];
        status.lastVerified = block.timestamp;

        emit SessionCompleted(user, session.sessionId);
    }

    // View functions
    function getEnabledFactors(
        address user
    ) external view returns (FactorType[] memory) {
        return mfaStatus[user].enabledFactors;
    }

    function getSessionStatus(
        address user
    )
        external
        view
        returns (
            bool isValid,
            uint256 timestamp,
            uint256 expiryTime,
            FactorType[] memory completedFactors
        )
    {
        AuthSession storage session = currentSession[user];
        return (
            session.isValid,
            session.timestamp,
            session.expiryTime,
            session.completedFactors
        );
    }

    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
