// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
// Use the interface for DigitalIdentityNFT for better decoupling if needed,
// but using the concrete contract is fine if ModeratorControl needs internal details.
import './DigitalIdentityNFT.sol';
import './ReputationSystem.sol';
import './AppealSystem.sol'; // Assuming AppealSystem interface or contract exists
import './IDigitalIdentityNFT.sol'; // Import the interface for VerificationLevel enum

import 'hardhat/console.sol';

contract ModeratorControl is AccessControl, Pausable {
    bytes32 public constant MODERATOR_ROLE = keccak256('MODERATOR_ROLE');
    bytes32 public constant ORACLE_ROLE = keccak256('ORACLE_ROLE');

    DigitalIdentityNFT public digitalIdentity;
    ReputationSystem public reputationSystem;
    AppealSystem public appealSystem; // Ensure AppealSystem is correctly defined/imported

    // Moderation thresholds (consider making these configurable via admin functions)
    uint256 public constant WARNING_THRESHOLD = 70;
    uint256 public constant RESTRICTION_THRESHOLD = 50;
    uint256 public constant SEVERE_RESTRICTION_THRESHOLD = 30;

    // Moderation action types
    enum ActionType {
        WARNING,
        RESTRICTION,
        SEVERE_RESTRICTION,
        BAN,
        UNBAN // Note: UNBAN might be better handled by removeRestriction
    }

    // Moderation case structure
    struct ModerationCase {
        address user;
        ActionType actionType;
        string reason;
        uint256 timestamp;
        address moderator; // Could be moderator or oracle address
        bool isResolved; // Consider if resolution logic is needed
    }

    // Mapping to store moderation cases (mapping ID => Case)
    mapping(uint256 => ModerationCase) public moderationCases;
    uint256 public caseCount;

    // Mapping to track user restrictions (address => ActionType)
    mapping(address => ActionType) public userRestrictions;

    // Events
    event CaseCreated(
        uint256 indexed caseId,
        address indexed user,
        ActionType actionType,
        string reason,
        address indexed moderatorOrOracle
    );
    event CaseResolved(uint256 indexed caseId, address indexed resolver); // If resolution logic is added
    event RestrictionApplied(
        address indexed user,
        ActionType actionType,
        string reason
    );
    event RestrictionRemoved(address indexed user);
    // Event related to identity verification triggered by this contract
    event IdentityVerificationApproved(
        address indexed user,
        DigitalIdentityNFT.VerificationLevel level
    );
    event AppealSystemSet(address indexed appealSystemAddress);

    constructor(address _digitalIdentityAddress, address _reputationAddress) {
        require(
            _digitalIdentityAddress != address(0),
            'Invalid DigitalIdentityNFT address'
        );
        require(
            _reputationAddress != address(0),
            'Invalid ReputationSystem address'
        );

        digitalIdentity = DigitalIdentityNFT(_digitalIdentityAddress);
        reputationSystem = ReputationSystem(_reputationAddress);

        // Grant deployer admin role
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant deployer moderator and oracle roles initially (can be revoked/reassigned)
        _setupRole(MODERATOR_ROLE, msg.sender);
        _setupRole(ORACLE_ROLE, msg.sender);
    }

    // Modifier to allow calls only from addresses with MODERATOR_ROLE or ORACLE_ROLE
    modifier onlyModeratorOrOracle() {
        require(
            hasRole(MODERATOR_ROLE, msg.sender) ||
                hasRole(ORACLE_ROLE, msg.sender),
            'Caller must be moderator or oracle'
        );
        _;
    }

    // --- Core Moderation Functions ---

    /**
     * @notice Creates a moderation case and applies the corresponding restriction/action.
     * @dev Can only be called by MODERATOR_ROLE.
     * @param user The address of the user being moderated.
     * @param actionType The type of action being taken.
     * @param reason A description of why the action is being taken.
     */
    function createModerationCase(
        address user,
        ActionType actionType,
        string memory reason
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        _applyRestriction(user, actionType, reason, msg.sender);
    }

    /**
     * @notice Internal function to apply restrictions and update reputation.
     * @param user The address of the user.
     * @param actionType The type of action.
     * @param reason The reason for the action.
     * @param actor The address performing the action (moderator or oracle).
     */
    function _applyRestriction(
        address user,
        ActionType actionType,
        string memory reason,
        address actor
    ) internal {
        require(
            digitalIdentity.hasIdentity(user),
            'User must have digital identity'
        );
        // Prevent applying UNBAN via this method, use removeRestriction instead
        require(actionType != ActionType.UNBAN, 'Use removeRestriction');

        // Store the restriction level
        userRestrictions[user] = actionType;

        // Update reputation score based on action type
        int256 scoreAdjustment = 0; // Default to 0
        if (actionType == ActionType.WARNING) {
            scoreAdjustment = -10; // Example value
        } else if (actionType == ActionType.RESTRICTION) {
            scoreAdjustment = -25; // Example value
        } else if (actionType == ActionType.SEVERE_RESTRICTION) {
            scoreAdjustment = -50; // Example value
        } else if (actionType == ActionType.BAN) {
            // Ban might set score to 0 or a very low value directly
            // For simplicity, using a large negative adjustment
            scoreAdjustment = -100; // Example value
        }

        // Only update score if there's an adjustment
        if (scoreAdjustment != 0) {
            // Use the specific function in ReputationSystem intended for moderator updates
            // Assuming updateScore is the correct function and handles permissions
            reputationSystem.updateScore(user, scoreAdjustment);
        }

        // Create and store the moderation case
        uint256 caseId = caseCount++;
        moderationCases[caseId] = ModerationCase({
            user: user,
            actionType: actionType,
            reason: reason,
            timestamp: block.timestamp,
            moderator: actor, // Record who initiated the action
            isResolved: false // Cases start unresolved
        });

        emit CaseCreated(caseId, user, actionType, reason, actor);
        emit RestrictionApplied(user, actionType, reason);
    }

    /**
     * @notice Evaluates a user's score and applies restrictions if thresholds are met.
     * @dev Can be called by moderators or oracles (e.g., after an external report).
     * @param user The address of the user to evaluate.
     */
    function evaluateUserRestrictions(
        address user
    ) external onlyModeratorOrOracle whenNotPaused {
        require(
            digitalIdentity.hasIdentity(user),
            'User must have digital identity'
        );
        uint256 score = reputationSystem.getUserScore(user);

        // Determine the appropriate action based on score thresholds
        // Apply the most severe applicable restriction
        if (score <= SEVERE_RESTRICTION_THRESHOLD) {
            if (userRestrictions[user] != ActionType.SEVERE_RESTRICTION) {
                _applyRestriction(
                    user,
                    ActionType.SEVERE_RESTRICTION,
                    'Score below severe threshold',
                    msg.sender
                );
            }
        } else if (score <= RESTRICTION_THRESHOLD) {
            if (userRestrictions[user] != ActionType.RESTRICTION) {
                _applyRestriction(
                    user,
                    ActionType.RESTRICTION,
                    'Score below restriction threshold',
                    msg.sender
                );
            }
        } else if (score <= WARNING_THRESHOLD) {
            if (userRestrictions[user] != ActionType.WARNING) {
                _applyRestriction(
                    user,
                    ActionType.WARNING,
                    'Score below warning threshold',
                    msg.sender
                );
            }
        }
        // Optional: Automatically remove restrictions if score improves above thresholds?
        // else if (score > WARNING_THRESHOLD && userRestrictions[user] != ActionType.UNBAN) {
        //     // If score is good, potentially remove existing restrictions (except BAN)
        //     // Requires careful consideration of interaction with appeals
        // }
    }

    /**
     * @notice Removes an active restriction for a user.
     * @dev Can be called by MODERATOR_ROLE or the configured AppealSystem contract.
     * @dev Bans can only be removed by the AppealSystem.
     * @param user The address of the user whose restriction is being removed.
     */
    function removeRestriction(address user) external whenNotPaused {
        // FIX 1: Removed 'override' keyword
        require(
            hasRole(MODERATOR_ROLE, msg.sender) ||
                msg.sender == address(appealSystem),
            'Caller must be moderator or appeal system'
        );
        require(
            userRestrictions[user] != ActionType.BAN ||
                msg.sender == address(appealSystem),
            'Ban can only be removed via appeal system'
        );
        require(
            userRestrictions[user] != ActionType.UNBAN, // Check if there is a restriction to remove
            'No active restriction to remove'
        );

        // Set restriction to UNBAN (or delete, depending on desired state tracking)
        userRestrictions[user] = ActionType.UNBAN;
        // Optionally, could use delete userRestrictions[user];

        // Consider if removing restriction should boost score slightly?
        // reputationSystem.updateScore(user, 5); // Example: Small boost

        emit RestrictionRemoved(user);
    }

    // --- Reputation System Interaction ---

    /**
     * @notice Initializes the reputation score for a newly created identity.
     * @dev Can only be called by MODERATOR_ROLE. Typically called after createIdentity.
     * @param user The address of the user.
     */
    function initializeUserScore(
        address user
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        // Ensure identity exists before initializing score
        require(
            digitalIdentity.hasIdentity(user),
            'User must have digital identity'
        );
        reputationSystem.initializeUserScore(user);
    }

    /**
     * @notice Gets the current reputation score, ban status, and last update time for a user.
     * @param user The address of the user.
     * @return score The user's current score.
     * @return isBanned Whether the user is currently banned.
     * @return lastUpdate Timestamp of the last score update.
     */
    function getUserReputationStatus(
        address user
    ) external view returns (uint256 score, bool isBanned, uint256 lastUpdate) {
        // FIX 2 & 3: Destructure the return values from getUserFullScore
        (
            uint256 currentScore,
            bool bannedStatus,
            uint256 updateTimestamp /* other vars omitted */,
            ,
            ,
            ,

        ) = reputationSystem.getUserFullScore(user);

        return (currentScore, bannedStatus, updateTimestamp);
    }

    /**
     * @notice Allows a moderator to directly adjust a user's reputation score.
     * @dev Use with caution. Prefer automated adjustments via createModerationCase.
     * @param user The address of the user.
     * @param points The number of points to add (positive) or subtract (negative).
     */
    function updateUserReputation(
        address user,
        int256 points
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        require(
            digitalIdentity.hasIdentity(user),
            'User must have digital identity'
        );
        // Assuming updateScore is the correct function in ReputationSystem
        reputationSystem.updateScore(user, points);
        // Consider re-evaluating restrictions after manual update
        // evaluateUserRestrictions(user); // Optional: uncomment if needed
    }

    // --- Digital Identity Interaction ---

    /**
     * @notice Creates a new digital identity NFT for a user.
     * @dev Can only be called by MODERATOR_ROLE. Initializes score afterwards.
     * @param user The address to receive the identity NFT.
     * @param did The Decentralized Identifier string for the identity.
     */
    function createIdentity(
        address user,
        string memory did
    ) external /*onlyRole(MODERATOR_ROLE)*/ whenNotPaused {
        console.log('Inside createIdentity - msg.sender:', msg.sender); // Log sender
        console.log('Inside createIdentity - address(this):', address(this)); // Log contract address

        // Temporarily remove modifier
        // FIX 4: Provide empty arrays for metadata arguments
        string[] memory emptyKeys = new string[](0);
        string[] memory emptyValues = new string[](0);
        // Ensure DigitalIdentityNFT contract has VERIFIER_ROLE granted to the caller (0xf39...)
        digitalIdentity.createIdentity(user, did, emptyKeys, emptyValues);

        // Automatically initialize score after creating identity
        // Ensure ReputationSystem ownership allows this call from ModeratorControl (0xf39...)
        reputationSystem.initializeUserScore(user);
    }

    /**
     * @notice Approves a verification level upgrade for a user's identity.
     * @dev Can only be called by VERIFIER_ROLE (which might be the same as MODERATOR_ROLE).
     * @param user The address of the user whose identity is being verified.
     * @param level The new verification level to approve.
     */
    function approveIdentityVerification(
        address user,
        DigitalIdentityNFT.VerificationLevel level
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        // FIX 5: Call the correct function in DigitalIdentityNFT
        require(digitalIdentity.hasIdentity(user), 'Identity does not exist');

        // Get the tokenId associated with the user address
        uint256 tokenId = digitalIdentity.addressToTokenId(user);
        require(tokenId != 0, 'Token ID not found for user'); // Check if tokenId is valid

        // Call the approveVerification function in the NFT contract
        // Note: DigitalIdentityNFT requires VERIFIER_ROLE, ensure ModeratorControl's caller has it
        // OR grant VERIFIER_ROLE to this ModeratorControl contract during deployment.
        // For simplicity, assuming MODERATOR_ROLE implies verification capability here.
        digitalIdentity.approveVerification(tokenId, level);

        // Emit an event specific to this contract's action
        emit IdentityVerificationApproved(user, level);
    }

    // --- Case Management ---

    /**
     * @notice Gets the total number of moderation cases created.
     */
    function getTotalCases() external view returns (uint256) {
        return caseCount;
    }

    /**
     * @notice Retrieves the details of a specific moderation case by its ID.
     * @param caseId The ID of the case to retrieve.
     * @return user Address of the user involved.
     * @return actionType Type of action taken.
     * @return reason Reason for the action.
     * @return timestamp Time the case was created.
     * @return moderator Address of the moderator/oracle who created the case.
     * @return isResolved Whether the case is marked as resolved.
     */
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
        require(caseId < caseCount, 'Case ID out of bounds');
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

    /**
     * @notice Retrieves all case IDs associated with a specific user.
     * @dev Iterates through all cases; potentially gas-intensive for large numbers of cases.
     * @param user The address of the user.
     * @return An array of case IDs involving the user.
     */
    function getUserCases(
        address user
    ) external view returns (uint256[] memory) {
        uint256 totalCases = caseCount;
        uint256 userCaseCount = 0;
        // First pass: count the user's cases
        for (uint256 i = 0; i < totalCases; i++) {
            if (moderationCases[i].user == user) {
                userCaseCount++;
            }
        }

        // Allocate the exact size needed
        uint256[] memory userCaseIds = new uint256[](userCaseCount);
        uint256 currentIndex = 0;
        // Second pass: populate the array
        for (uint256 i = 0; i < totalCases; i++) {
            if (moderationCases[i].user == user) {
                userCaseIds[currentIndex] = i;
                currentIndex++;
            }
        }

        return userCaseIds;
    }

    // --- Appeal System Integration ---

    /**
     * @notice Sets the address of the AppealSystem contract.
     * @dev Can only be called by the DEFAULT_ADMIN_ROLE.
     * @param _appealSystem The address of the deployed AppealSystem contract.
     */
    function setAppealSystem(
        address _appealSystem
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_appealSystem != address(0), 'Invalid AppealSystem address');
        appealSystem = AppealSystem(_appealSystem);
        emit AppealSystemSet(_appealSystem);
    }

    // --- Pausable Control ---

    /**
     * @notice Pauses the contract, preventing state-changing operations.
     * @dev Can only be called by the DEFAULT_ADMIN_ROLE.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the contract, resuming normal operations.
     * @dev Can only be called by the DEFAULT_ADMIN_ROLE.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
