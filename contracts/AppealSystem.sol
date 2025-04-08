// contracts/AppealSystem.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/access/IAccessControl.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
// --- Add Pausable import ---
import '@openzeppelin/contracts/security/Pausable.sol';
// --- End Import ---
import './ModeratorControl.sol';
import './ReputationSystem.sol';

// --- Add Pausable to inheritance list ---
contract AppealSystem is AccessControl, EIP712, Pausable {
    using ECDSA for bytes32;

    // --- Roles ---
    bytes32 public constant MODERATOR_ROLE = keccak256('MODERATOR_ROLE');
    bytes32 public constant APPEAL_REVIEWER_ROLE =
        keccak256('APPEAL_REVIEWER_ROLE');

    // --- State Variables ---
    ModeratorControl public moderatorControl;
    ReputationSystem public reputationSystem;

    mapping(address => bool) public isReviewer;
    address[] public reviewers;

    enum AppealStatus {
        PENDING,
        APPROVED,
        REJECTED,
        UNDER_REVIEW
    }

    struct Appeal {
        address user;
        string reason;
        string evidence;
        uint256 timestamp;
        AppealStatus status;
        address reviewer;
        string reviewNotes;
        uint256 reviewTimestamp;
        uint256 caseId;
        uint256 appealDeadline;
    }

    mapping(address => Appeal[]) public userAppeals;
    mapping(uint256 => mapping(address => bool)) public appealVotes;
    mapping(uint256 => uint256) public appealVoteCount;

    // --- Configuration ---
    uint256 public constant APPEAL_REVIEW_PERIOD = 7 days;
    uint256 public constant MIN_VOTES_REQUIRED = 3;
    uint256 public constant APPEAL_COOLDOWN_PERIOD = 30 days;
    uint256 public constant REPUTATION_BONUS_ON_SUCCESSFUL_APPEAL = 20;

    // --- EIP712 Setup ---
    bytes32 public constant APPEAL_REQUEST_TYPEHASH =
        keccak256(
            'AppealRequest(address user,string reason,string evidence,uint256 caseId,uint256 nonce)'
        );
    mapping(address => uint256) public nonces;

    // --- Events ---
    // (Events remain the same)
    event AppealSubmitted(
        address indexed user,
        uint256 indexed appealIndex,
        uint256 caseId,
        uint256 timestamp
    );
    event AppealReviewed(
        address indexed user,
        uint256 indexed appealIndex,
        AppealStatus status,
        address indexed reviewer
    );
    event AppealVoteSubmitted(
        address indexed reviewer,
        uint256 indexed appealIndex,
        bool vote
    );
    event AppealStatusUpdated(
        address indexed user,
        uint256 indexed appealIndex,
        AppealStatus status
    );
    event ReviewerAdded(address indexed reviewer);
    event ReviewerRemoved(address indexed reviewer);

    constructor(
        address _moderatorControl,
        address _reputationSystem
    ) EIP712('AppealSystem', '1') {
        require(
            _moderatorControl != address(0),
            'AppealSystem: Invalid ModeratorControl address'
        );
        require(
            _reputationSystem != address(0),
            'AppealSystem: Invalid ReputationSystem address'
        );

        moderatorControl = ModeratorControl(_moderatorControl);
        reputationSystem = ReputationSystem(_reputationSystem);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MODERATOR_ROLE, msg.sender);
        _setupRole(APPEAL_REVIEWER_ROLE, msg.sender);

        _addReviewer(msg.sender);
    }

    // --- Reviewer Management ---
    // Consider adding whenNotPaused modifier here if needed
    function addReviewer(
        address reviewer
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        _addReviewer(reviewer);
    }

    function _addReviewer(address reviewer) internal {
        require(
            reviewer != address(0),
            'AppealSystem: Invalid reviewer address'
        );
        require(!isReviewer[reviewer], 'AppealSystem: Already a reviewer');
        isReviewer[reviewer] = true;
        reviewers.push(reviewer);
        grantRole(APPEAL_REVIEWER_ROLE, reviewer);
        emit ReviewerAdded(reviewer);
    }

    // Consider adding whenNotPaused modifier here if needed
    function removeReviewer(
        address reviewer
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        require(
            reviewer != address(0),
            'AppealSystem: Invalid reviewer address'
        );
        require(isReviewer[reviewer], 'AppealSystem: Not a reviewer');
        require(
            reviewers.length > 1,
            'AppealSystem: Cannot remove last reviewer'
        );

        isReviewer[reviewer] = false;
        revokeRole(APPEAL_REVIEWER_ROLE, reviewer);

        for (uint256 i = 0; i < reviewers.length; i++) {
            if (reviewers[i] == reviewer) {
                reviewers[i] = reviewers[reviewers.length - 1];
                reviewers.pop();
                break;
            }
        }
        emit ReviewerRemoved(reviewer);
    }

    // --- Appeal Submission ---
    // whenNotPaused modifier is now valid because Pausable is inherited
    function submitAppeal(
        address user,
        string memory reason,
        string memory evidence,
        uint256 caseId,
        bytes memory signature
    ) external whenNotPaused {
        // This modifier is now valid
        // ... (rest of the function logic remains the same) ...
        require(
            moderatorControl.userRestrictions(user) !=
                ModeratorControl.ActionType.UNBAN,
            'AppealSystem: No active restriction to appeal'
        );
        if (userAppeals[user].length > 0) {
            Appeal storage lastAppeal = userAppeals[user][
                userAppeals[user].length - 1
            ];
            require(
                block.timestamp >=
                    lastAppeal.timestamp + APPEAL_COOLDOWN_PERIOD,
                'AppealSystem: Must wait for cooldown period'
            );
        }

        uint256 currentNonce = nonces[user];
        bytes32 structHash = keccak256(
            abi.encode(
                APPEAL_REQUEST_TYPEHASH,
                user,
                keccak256(bytes(reason)),
                keccak256(bytes(evidence)),
                caseId,
                currentNonce
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recoveredSigner = digest.recover(signature);

        require(
            recoveredSigner != address(0),
            'AppealSystem: Invalid signature recovery'
        );
        require(
            recoveredSigner == user,
            'AppealSystem: Signature does not match user address'
        );

        nonces[user]++;

        Appeal memory newAppeal = Appeal({
            user: user,
            reason: reason,
            evidence: evidence,
            timestamp: block.timestamp,
            status: AppealStatus.PENDING,
            reviewer: address(0),
            reviewNotes: '',
            reviewTimestamp: 0,
            caseId: caseId,
            appealDeadline: block.timestamp + APPEAL_REVIEW_PERIOD
        });

        uint256 appealIndex = userAppeals[user].length;
        userAppeals[user].push(newAppeal);

        emit AppealSubmitted(user, appealIndex, caseId, block.timestamp);
    }

    // --- Appeal Review and Processing ---
    // Consider adding whenNotPaused modifier here if needed
    function reviewAppeal(
        address user,
        uint256 appealIndex,
        bool approved,
        string memory notes
    ) external onlyRole(APPEAL_REVIEWER_ROLE) whenNotPaused {
        // ... (rest of the function logic remains the same) ...
        require(
            appealIndex < userAppeals[user].length,
            'AppealSystem: Appeal does not exist'
        );
        Appeal storage appeal = userAppeals[user][appealIndex];

        require(
            appeal.status == AppealStatus.PENDING,
            'AppealSystem: Appeal not pending'
        );
        require(
            block.timestamp <= appeal.appealDeadline,
            'AppealSystem: Review period expired'
        );
        require(
            !appealVotes[appealIndex][msg.sender],
            'AppealSystem: Reviewer already voted'
        );

        appealVotes[appealIndex][msg.sender] = approved;
        appealVoteCount[appealIndex]++;

        emit AppealVoteSubmitted(msg.sender, appealIndex, approved);

        if (appealVoteCount[appealIndex] >= MIN_VOTES_REQUIRED) {
            _processAppealVotes(user, appealIndex, notes);
        }
    }

    function _processAppealVotes(
        address user,
        uint256 appealIndex,
        string memory finalNotes
    ) internal {
        // Internal functions don't need whenNotPaused
        // ... (rest of the function logic remains the same) ...
        Appeal storage appeal = userAppeals[user][appealIndex];
        require(
            appeal.status == AppealStatus.PENDING,
            'AppealSystem: Appeal already processed'
        );

        uint256 approvalVotes = 0;
        uint256 totalVotesCast = appealVoteCount[appealIndex];

        for (uint256 i = 0; i < reviewers.length; i++) {
            if (appealVotes[appealIndex][reviewers[i]]) {
                approvalVotes++;
            }
        }

        bool isApproved = (approvalVotes * 2) > totalVotesCast;

        appeal.status = isApproved
            ? AppealStatus.APPROVED
            : AppealStatus.REJECTED;
        appeal.reviewer = msg.sender;
        appeal.reviewNotes = finalNotes;
        appeal.reviewTimestamp = block.timestamp;

        if (isApproved) {
            moderatorControl.removeRestriction(user);
            reputationSystem.updateScore(
                user,
                int256(REPUTATION_BONUS_ON_SUCCESSFUL_APPEAL)
            );
        }

        emit AppealStatusUpdated(user, appealIndex, appeal.status);
        emit AppealReviewed(user, appealIndex, appeal.status, msg.sender);
    }

    // --- View Functions ---
    // (View functions remain the same - getAppealDetails, getUserAppealsCount, etc.)
    // ...

    // --- ADD Pausable Control Functions ---
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
    // --- END Pausable Control Functions ---

    // --- Existing View Functions ---
    function getAppealDetails(
        address user,
        uint256 appealIndex
    ) external view returns (Appeal memory) {
        require(
            appealIndex < userAppeals[user].length,
            'AppealSystem: Appeal does not exist'
        );
        return userAppeals[user][appealIndex];
    }

    function getUserAppealsCount(address user) external view returns (uint256) {
        return userAppeals[user].length;
    }

    function getReviewers() public view returns (address[] memory) {
        return reviewers;
    }

    function getReviewerCount() public view returns (uint256) {
        return reviewers.length;
    }

    function getUserNonce(address user) external view returns (uint256) {
        return nonces[user];
    }
}
