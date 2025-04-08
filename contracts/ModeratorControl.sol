// contracts/ModeratorControl.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// OpenZeppelin Contracts
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/security/Pausable.sol';

// Interfaces and Contracts
import './DigitalIdentityNFT.sol'; // Use concrete contract for interaction
import './ReputationSystem.sol'; // Use concrete contract for interaction & SCALE_FACTOR
import './AppealSystem.sol'; // Use concrete contract for interaction
import './IDigitalIdentityNFT.sol'; // Keep for enum definition if needed elsewhere, or remove

// Hardhat console for debugging (remove for production)
// import "hardhat/console.sol";

contract ModeratorControl is AccessControl, Pausable {
    // --- Roles ---
    bytes32 public constant MODERATOR_ROLE = keccak256('MODERATOR_ROLE');
    bytes32 public constant ORACLE_ROLE = keccak256('ORACLE_ROLE');
    // DEFAULT_ADMIN_ROLE is inherited from AccessControl

    // --- State Variables ---
    DigitalIdentityNFT public digitalIdentity;
    ReputationSystem public reputationSystem;
    AppealSystem public appealSystem; // Address set post-deployment

    // Moderation thresholds (consider making these configurable)
    uint256 public constant WARNING_THRESHOLD = 70;
    uint256 public constant RESTRICTION_THRESHOLD = 50;
    uint256 public constant SEVERE_RESTRICTION_THRESHOLD = 30;

    // Moderation action types enum
    enum ActionType {
        WARNING, // 0
        RESTRICTION, // 1
        SEVERE_RESTRICTION, // 2
        BAN, // 3
        UNBAN // 4 (Represents state after restriction removal)
    }

    // Moderation case structure
    struct ModerationCase {
        address user; // User subject to the case
        ActionType actionType; // Action taken
        string reason; // Reason for the action
        uint256 timestamp; // Time the case was created
        address moderator; // Address that created the case (moderator or oracle)
        bool isResolved; // Status flag (logic for resolution TBD)
    }

    // Mapping for moderation cases (case ID => Case details)
    mapping(uint256 => ModerationCase) public moderationCases;
    uint256 public caseCount; // Counter for case IDs

    // Mapping to track current restriction level for users
    mapping(address => ActionType) public userRestrictions;

    // --- Events ---
    event CaseCreated(
        uint256 indexed caseId,
        address indexed user,
        ActionType actionType,
        string reason,
        address indexed moderatorOrOracle // Record who created the case
    );
    event CaseResolved(uint256 indexed caseId, address indexed resolver); // If resolution logic is added
    event RestrictionApplied(
        address indexed user,
        ActionType actionType,
        string reason
    );
    event RestrictionRemoved(address indexed user);
    event IdentityVerificationApproved(
        address indexed user,
        DigitalIdentityNFT.VerificationLevel level // Use enum from concrete contract
    );
    event AppealSystemSet(address indexed appealSystemAddress);
    event ReputationConfigUpdated(
        // For logging weight changes
        uint256 positiveWeight,
        uint256 negativeWeight,
        uint256 decayRate,
        uint256 decayPeriod,
        uint256 activityMultiplier
    );

    // --- Constructor ---
    constructor(address _digitalIdentityAddress, address _reputationAddress) {
        require(
            _digitalIdentityAddress != address(0),
            'ModeratorControl: Invalid DigitalIdentityNFT address'
        );
        require(
            _reputationAddress != address(0),
            'ModeratorControl: Invalid ReputationSystem address'
        );

        digitalIdentity = DigitalIdentityNFT(_digitalIdentityAddress);
        reputationSystem = ReputationSystem(_reputationAddress);

        // Grant deployer admin role
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant deployer moderator and oracle roles initially (can be revoked/reassigned)
        _setupRole(MODERATOR_ROLE, msg.sender);
        _setupRole(ORACLE_ROLE, msg.sender);
    }

    // --- Modifiers ---

    /**
     * @dev Modifier to restrict functions to callers with MODERATOR_ROLE or ORACLE_ROLE.
     */
    modifier onlyModeratorOrOracle() {
        require(
            hasRole(MODERATOR_ROLE, msg.sender) ||
                hasRole(ORACLE_ROLE, msg.sender),
            'ModeratorControl: Caller must be moderator or oracle'
        );
        _;
    }

    // --- Core Moderation Functions ---

    /**
     * @notice Creates a moderation case and applies the corresponding restriction/action.
     * @dev Can only be called by MODERATOR_ROLE.
     * @param user The address of the user being moderated.
     * @param actionType The type of action being taken (WARNING, RESTRICTION, etc.).
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
     * @notice Internal function to apply restrictions, update reputation, and log the case.
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
            'ModeratorControl: User must have digital identity'
        );
        // Prevent applying UNBAN via this method, use removeRestriction instead
        require(
            actionType != ActionType.UNBAN,
            'ModeratorControl: Use removeRestriction to unban'
        );

        // Store the restriction level
        userRestrictions[user] = actionType;

        // Determine reputation score adjustment based on action type
        int256 scoreAdjustment = 0; // Default to 0
        if (actionType == ActionType.WARNING) {
            scoreAdjustment = -10; // Example value, make configurable?
        } else if (actionType == ActionType.RESTRICTION) {
            scoreAdjustment = -25; // Example value
        } else if (actionType == ActionType.SEVERE_RESTRICTION) {
            scoreAdjustment = -50; // Example value
        } else if (actionType == ActionType.BAN) {
            // Ban might set score to 0 or a very low value directly
            // Using a large negative adjustment for consistency here
            scoreAdjustment = -100; // Example value
        }

        // Only update score if there's an adjustment
        if (scoreAdjustment != 0) {
            // Call the ReputationSystem contract to update the score
            // Assumes ModeratorControl (owner) has permission via onlyOwner modifier
            reputationSystem.updateScore(user, scoreAdjustment);
        }

        // Create and store the moderation case log entry
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
            'ModeratorControl: User must have digital identity'
        );
        // Get current score (after decay) from ReputationSystem
        uint256 score = reputationSystem.getUserScore(user);

        // Determine the appropriate action based on score thresholds
        // Apply the most severe applicable restriction only if not already applied
        if (score <= SEVERE_RESTRICTION_THRESHOLD) {
            if (
                userRestrictions[user] != ActionType.SEVERE_RESTRICTION &&
                userRestrictions[user] != ActionType.BAN
            ) {
                _applyRestriction(
                    user,
                    ActionType.SEVERE_RESTRICTION,
                    'Score below severe threshold',
                    msg.sender
                );
            }
        } else if (score <= RESTRICTION_THRESHOLD) {
            if (
                userRestrictions[user] != ActionType.RESTRICTION &&
                userRestrictions[user] != ActionType.SEVERE_RESTRICTION &&
                userRestrictions[user] != ActionType.BAN
            ) {
                _applyRestriction(
                    user,
                    ActionType.RESTRICTION,
                    'Score below restriction threshold',
                    msg.sender
                );
            }
        } else if (score <= WARNING_THRESHOLD) {
            if (userRestrictions[user] == ActionType.UNBAN) {
                // Only apply warning if currently unrestricted
                _applyRestriction(
                    user,
                    ActionType.WARNING,
                    'Score below warning threshold',
                    msg.sender
                );
            }
        }
        // Optional: Automatically remove restrictions if score improves above thresholds?
        // else if (score > WARNING_THRESHOLD && userRestrictions[user] != ActionType.UNBAN && userRestrictions[user] != ActionType.BAN) {
        //     // If score is good, potentially remove existing restrictions (except BAN)
        //     removeRestriction(user); // Requires careful consideration of interaction with appeals
        // }
    }

    /**
     * @notice Removes an active restriction for a user.
     * @dev Can be called by MODERATOR_ROLE or the configured AppealSystem contract.
     * @dev Bans can only be removed by the AppealSystem.
     * @param user The address of the user whose restriction is being removed.
     */
    function removeRestriction(address user) external whenNotPaused {
        require(
            hasRole(MODERATOR_ROLE, msg.sender) ||
                (address(appealSystem) != address(0) &&
                    msg.sender == address(appealSystem)),
            'ModeratorControl: Caller must be moderator or appeal system'
        );
        require(
            userRestrictions[user] != ActionType.BAN ||
                (address(appealSystem) != address(0) &&
                    msg.sender == address(appealSystem)),
            'ModeratorControl: Ban can only be removed via appeal system'
        );
        require(
            userRestrictions[user] != ActionType.UNBAN, // Check if there is a restriction to remove
            'ModeratorControl: No active restriction to remove'
        );

        // Set restriction state to UNBAN
        userRestrictions[user] = ActionType.UNBAN;

        // Optional: Consider if removing restriction should boost score slightly?
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
        require(
            digitalIdentity.hasIdentity(user),
            'ModeratorControl: User must have digital identity to initialize score'
        );
        // Call initializeUserScore on ReputationSystem (requires ModeratorControl to be owner)
        reputationSystem.initializeUserScore(user);
    }

    /**
     * @notice Gets the current reputation score, ban status, and last update time for a user.
     * @param user The address of the user.
     * @return score The user's current score (after decay).
     * @return isBanned Whether the user is currently banned.
     * @return lastUpdate Timestamp of the last raw score update event.
     */
    function getUserReputationStatus(
        address user
    ) external view returns (uint256 score, bool isBanned, uint256 lastUpdate) {
        // Destructure the return values from getUserFullScore in ReputationSystem
        (
            uint256 currentScore,
            bool bannedStatus,
            uint256 updateTimestamp, // omit totalPositivePoints
            // omit totalNegativePoints
            // omit activityCount
            ,
            ,
            ,

        ) = // omit decayApplied
            reputationSystem.getUserFullScore(user);

        return (currentScore, bannedStatus, updateTimestamp);
    }

    /**
     * @notice Allows a moderator to directly adjust a user's reputation score.
     * @dev Use with caution. Prefer automated adjustments via createModerationCase or evaluateUserRestrictions.
     * @param user The address of the user.
     * @param points The number of points to add (positive) or subtract (negative).
     */
    function updateUserReputation(
        address user,
        int256 points
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        require(
            digitalIdentity.hasIdentity(user),
            'ModeratorControl: User must have digital identity'
        );
        // Call updateScore on ReputationSystem (requires ModeratorControl to be owner)
        reputationSystem.updateScore(user, points);
        // Consider re-evaluating restrictions after manual update
        // evaluateUserRestrictions(user); // Optional: uncomment if needed
    }

    /**
     * @notice Configures the weights and parameters used by the ReputationSystem.
     * @dev Can only be called by the DEFAULT_ADMIN_ROLE.
     * @param _positiveWeight Weight multiplier for positive score changes (scaled by 1e18).
     * @param _negativeWeight Weight multiplier for negative score changes (scaled by 1e18).
     * @param _decayRate Decay rate per period (scaled by 1e18, e.g., 1e16 for 1%).
     * @param _decayPeriod Duration of the decay period in seconds (e.g., 30 days).
     * @param _activityMultiplier Bonus multiplier per activity (scaled by 1e18).
     */
    function configureReputationWeights(
        uint256 _positiveWeight,
        uint256 _negativeWeight,
        uint256 _decayRate,
        uint256 _decayPeriod,
        uint256 _activityMultiplier
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        // Basic validation (can be enhanced)
        require(
            _positiveWeight > 0,
            'ModeratorControl: Positive weight must be > 0'
        );
        require(
            _negativeWeight > 0,
            'ModeratorControl: Negative weight must be > 0'
        );
        require(_decayPeriod > 0, 'ModeratorControl: Decay period must be > 0');
        // Access SCALE_FACTOR via the reputationSystem instance
        require(
            _decayRate < reputationSystem.SCALE_FACTOR(),
            'ModeratorControl: Decay rate must be < 1.0'
        );

        // Call the function on the owned ReputationSystem contract
        reputationSystem.updateWeightConfig(
            _positiveWeight,
            _negativeWeight,
            _decayRate,
            _decayPeriod,
            _activityMultiplier
        );

        // Emit an event from ModeratorControl as well for easier tracking
        emit ReputationConfigUpdated(
            _positiveWeight,
            _negativeWeight,
            _decayRate,
            _decayPeriod,
            _activityMultiplier
        );
    }

    // --- Digital Identity Interaction ---

    /**
     * @notice Creates a new digital identity NFT for a user and initializes their score.
     * @dev Can only be called by MODERATOR_ROLE.
     * @dev Requires ModeratorControl contract to have VERIFIER_ROLE on DigitalIdentityNFT.
     * @param user The address to receive the identity NFT.
     * @param did The Decentralized Identifier string for the identity.
     */
    function createIdentity(
        address user,
        string memory did
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        // console.log("Inside createIdentity - msg.sender:", msg.sender);
        // console.log("Inside createIdentity - address(this):", address(this));

        // Provide empty arrays for metadata arguments as required by DigitalIdentityNFT
        string[] memory emptyKeys = new string[](0);
        string[] memory emptyValues = new string[](0);
        // This call requires ModeratorControl contract to have VERIFIER_ROLE on DigitalIdentityNFT
        digitalIdentity.createIdentity(user, did, emptyKeys, emptyValues);

        // Automatically initialize score after creating identity
        // This call requires ModeratorControl contract to be owner of ReputationSystem
        reputationSystem.initializeUserScore(user);
    }

    /**
     * @notice Approves a verification level upgrade for a user's identity.
     * @dev Can only be called by MODERATOR_ROLE (assuming moderator can verify).
     * @dev Requires ModeratorControl contract to have VERIFIER_ROLE on DigitalIdentityNFT.
     * @param user The address of the user whose identity is being verified.
     * @param level The new verification level to approve (use enum from DigitalIdentityNFT).
     */
    function approveIdentityVerification(
        address user,
        DigitalIdentityNFT.VerificationLevel level // Use enum from concrete contract
    ) external onlyRole(MODERATOR_ROLE) whenNotPaused {
        require(
            digitalIdentity.hasIdentity(user),
            'ModeratorControl: Identity does not exist'
        );

        // Get the tokenId associated with the user address
        uint256 tokenId = digitalIdentity.addressToTokenId(user);
        require(tokenId != 0, 'ModeratorControl: Token ID not found for user');

        // Call the approveVerification function in the NFT contract
        // This requires ModeratorControl contract to have VERIFIER_ROLE on DigitalIdentityNFT
        digitalIdentity.approveVerification(tokenId, level);

        // Emit an event specific to this contract's action
        emit IdentityVerificationApproved(user, level);
    }

    // --- Case Management Views ---

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
        require(caseId < caseCount, 'ModeratorControl: Case ID out of bounds');
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
     * @dev Can only be called by the DEFAULT_ADMIN_ROLE. Can only be set once? Consider adding check.
     * @param _appealSystem The address of the deployed AppealSystem contract.
     */
    function setAppealSystem(
        address _appealSystem
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            _appealSystem != address(0),
            'ModeratorControl: Invalid AppealSystem address'
        );
        // Optional: require(address(appealSystem) == address(0), "AppealSystem already set");
        appealSystem = AppealSystem(_appealSystem);
        emit AppealSystemSet(_appealSystem);
    }

    // --- Pausable Control ---

    /**
     * @notice Pauses the contract, preventing state-changing operations (except unpause).
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
