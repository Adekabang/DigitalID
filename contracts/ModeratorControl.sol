// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./DigitalIdentityNFT.sol";
import "./ReputationSystem.sol";

contract ModeratorControl is AccessControl, Pausable {
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    DigitalIdentityNFT public digitalIdentity;
    ReputationSystem public reputationSystem;

    // Moderation thresholds
    uint256 public constant WARNING_THRESHOLD = 70;
    uint256 public constant RESTRICTION_THRESHOLD = 50;
    uint256 public constant SEVERE_RESTRICTION_THRESHOLD = 30;

    // Moderation action types
    enum ActionType {
        WARNING,
        RESTRICTION,
        SEVERE_RESTRICTION,
        BAN,
        UNBAN
    }

    // Moderation case structure
    struct ModerationCase {
        address user;
        ActionType actionType;
        string reason;
        uint256 timestamp;
        address moderator;
        bool isResolved;
    }

    // Mapping to store moderation cases
    mapping(uint256 => ModerationCase) public moderationCases;
    uint256 public caseCount;

    // Mapping to track user restrictions
    mapping(address => ActionType) public userRestrictions;

    // Events
    event CaseCreated(
        uint256 indexed caseId,
        address indexed user,
        ActionType actionType,
        string reason
    );
    event CaseResolved(uint256 indexed caseId, address indexed moderator);
    event RestrictionApplied(
        address indexed user,
        ActionType actionType,
        string reason
    );
    event RestrictionRemoved(address indexed user);

    constructor(address _digitalIdentityAddress, address _reputationAddress) {
        digitalIdentity = DigitalIdentityNFT(_digitalIdentityAddress);
        reputationSystem = ReputationSystem(_reputationAddress);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MODERATOR_ROLE, msg.sender);
        _setupRole(ORACLE_ROLE, msg.sender);
    }

    modifier onlyModeratorOrOracle() {
        require(
            hasRole(MODERATOR_ROLE, msg.sender) ||
                hasRole(ORACLE_ROLE, msg.sender),
            "Caller must be moderator or oracle"
        );
        _;
    }

    function createModerationCase(
        address user,
        ActionType actionType,
        string memory reason
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        _applyRestriction(user, actionType, reason);
    }

    function _applyRestriction(
        address user,
        ActionType actionType,
        string memory reason
    ) internal {
        require(
            digitalIdentity.hasIdentity(user),
            "User must have digital identity"
        );

        userRestrictions[user] = actionType;

        // Update reputation score based on action type
        int256 scoreAdjustment;
        if (actionType == ActionType.WARNING) {
            scoreAdjustment = -10;
        } else if (actionType == ActionType.RESTRICTION) {
            scoreAdjustment = -25;
        } else if (actionType == ActionType.SEVERE_RESTRICTION) {
            scoreAdjustment = -50;
        } else if (actionType == ActionType.BAN) {
            scoreAdjustment = -100;
        }

        if (scoreAdjustment != 0) {
            reputationSystem.updateScore(user, scoreAdjustment);
        }

        // Create a new moderation case
        uint256 caseId = caseCount++;
        moderationCases[caseId] = ModerationCase({
            user: user,
            actionType: actionType,
            reason: reason,
            timestamp: block.timestamp,
            moderator: msg.sender,
            isResolved: false
        });

        emit CaseCreated(caseId, user, actionType, reason);
        emit RestrictionApplied(user, actionType, reason);
    }

    function evaluateUserRestrictions(
        address user
    ) external onlyModeratorOrOracle {
        uint256 score = reputationSystem.getUserScore(user);

        if (score <= SEVERE_RESTRICTION_THRESHOLD) {
            _applyRestriction(
                user,
                ActionType.SEVERE_RESTRICTION,
                "Score below severe threshold"
            );
        } else if (score <= RESTRICTION_THRESHOLD) {
            _applyRestriction(
                user,
                ActionType.RESTRICTION,
                "Score below restriction threshold"
            );
        } else if (score <= WARNING_THRESHOLD) {
            _applyRestriction(
                user,
                ActionType.WARNING,
                "Score below warning threshold"
            );
        }
    }

    function removeRestriction(address user) external onlyRole(MODERATOR_ROLE) {
        require(
            userRestrictions[user] != ActionType.BAN,
            "Cannot remove ban directly"
        );
        delete userRestrictions[user];
        emit RestrictionRemoved(user);
    }

    function initializeUserScore(
        address user
    ) external onlyRole(MODERATOR_ROLE) {
        reputationSystem.initializeUserScore(user);
    }

    function getUserReputationStatus(
        address user
    ) external view returns (uint256 score, bool isBanned, uint256 lastUpdate) {
        ReputationSystem.ReputationScore memory userScore = reputationSystem
            .getUserFullScore(user);
        return (userScore.score, userScore.isBanned, userScore.lastUpdate);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function getTotalCases() external view returns (uint256) {
        return caseCount;
    }

    function getCaseDetails(
        uint256 caseId
    )
        external
        view
        returns (
            address user,
            ActionType actionType,
            string memory reason,
            uint256 timestamp,
            address moderator,
            bool isResolved
        )
    {
        ModerationCase storage case_ = moderationCases[caseId];
        return (
            case_.user,
            case_.actionType,
            case_.reason,
            case_.timestamp,
            case_.moderator,
            case_.isResolved
        );
    }

    function createIdentity(
        address user,
        string memory did
    ) external onlyRole(MODERATOR_ROLE) {
        digitalIdentity.createIdentity(user, did);
    }
}
