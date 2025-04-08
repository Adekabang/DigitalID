// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/access/IAccessControl.sol';
import './ModeratorControl.sol';
import './ReputationSystem.sol';

contract AppealSystem is AccessControl {
    bytes32 public constant MODERATOR_ROLE = keccak256('MODERATOR_ROLE');
    bytes32 public constant APPEAL_REVIEWER_ROLE =
        keccak256('APPEAL_REVIEWER_ROLE');

    ModeratorControl public moderatorControl;
    ReputationSystem public reputationSystem;

    // Mapping to track all reviewers
    mapping(address => bool) public isReviewer;
    address[] public reviewers;

    // Appeal status enumeration
    enum AppealStatus {
        PENDING,
        APPROVED,
        REJECTED,
        UNDER_REVIEW
    }

    // Appeal structure
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

    // Mapping from user address to their appeals
    mapping(address => Appeal[]) public userAppeals;
    // Mapping from appeal index to reviewer votes (reviewer address => bool)
    mapping(uint256 => mapping(address => bool)) public appealVotes;
    // Mapping from appeal index to vote count
    mapping(uint256 => uint256) public appealVoteCount;

    // Configuration
    uint256 public constant APPEAL_REVIEW_PERIOD = 7 days;
    uint256 public constant MIN_VOTES_REQUIRED = 3;
    uint256 public constant APPEAL_COOLDOWN_PERIOD = 30 days;
    uint256 public constant REPUTATION_BONUS_ON_SUCCESSFUL_APPEAL = 20;

    // Events
    event AppealSubmitted(
        address indexed user,
        uint256 indexed appealIndex,
        uint256 timestamp
    );
    event AppealReviewed(
        address indexed user,
        uint256 indexed appealIndex,
        AppealStatus status,
        address reviewer
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

    constructor(address _moderatorControl, address _reputationSystem) {
        moderatorControl = ModeratorControl(_moderatorControl);
        reputationSystem = ReputationSystem(_reputationSystem);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MODERATOR_ROLE, msg.sender);
        _setupRole(APPEAL_REVIEWER_ROLE, msg.sender);

        // Add the deployer as the first reviewer
        _addReviewer(msg.sender);
    }

    // Function to add a reviewer
    function addReviewer(
        address reviewer
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _addReviewer(reviewer);
    }

    // Internal function to add a reviewer
    function _addReviewer(address reviewer) internal {
        require(!isReviewer[reviewer], 'Already a reviewer');
        isReviewer[reviewer] = true;
        reviewers.push(reviewer);
        _grantRole(APPEAL_REVIEWER_ROLE, reviewer);
        emit ReviewerAdded(reviewer);
    }

    // Function to remove a reviewer
    function removeReviewer(
        address reviewer
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isReviewer[reviewer], 'Not a reviewer');
        isReviewer[reviewer] = false;

        // Remove from the array
        for (uint256 i = 0; i < reviewers.length; i++) {
            if (reviewers[i] == reviewer) {
                reviewers[i] = reviewers[reviewers.length - 1];
                reviewers.pop();
                break;
            }
        }

        _revokeRole(APPEAL_REVIEWER_ROLE, reviewer);
        emit ReviewerRemoved(reviewer);
    }

    function submitAppeal(
        string memory reason,
        string memory evidence,
        uint256 caseId
    ) external {
        require(
            moderatorControl.userRestrictions(msg.sender) !=
                ModeratorControl.ActionType.UNBAN,
            'No active restriction to appeal'
        );

        // Check if user has any recent appeals
        if (userAppeals[msg.sender].length > 0) {
            Appeal storage lastAppeal = userAppeals[msg.sender][
                userAppeals[msg.sender].length - 1
            ];
            require(
                block.timestamp >=
                    lastAppeal.timestamp + APPEAL_COOLDOWN_PERIOD,
                'Must wait for cooldown period'
            );
        }

        Appeal memory newAppeal = Appeal({
            user: msg.sender,
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

        userAppeals[msg.sender].push(newAppeal);

        emit AppealSubmitted(
            msg.sender,
            userAppeals[msg.sender].length - 1,
            block.timestamp
        );
    }

    function reviewAppeal(
        address user,
        uint256 appealIndex,
        bool approved,
        string memory notes
    ) external onlyRole(APPEAL_REVIEWER_ROLE) {
        require(
            appealIndex < userAppeals[user].length,
            'Appeal does not exist'
        );
        Appeal storage appeal = userAppeals[user][appealIndex];

        require(
            appeal.status == AppealStatus.PENDING,
            'Appeal not in pending status'
        );
        require(
            block.timestamp <= appeal.appealDeadline,
            'Review period expired'
        );
        require(
            !appealVotes[appealIndex][msg.sender],
            'Already voted on this appeal'
        );

        // Record the vote
        appealVotes[appealIndex][msg.sender] = approved;
        appealVoteCount[appealIndex]++;

        emit AppealVoteSubmitted(msg.sender, appealIndex, approved);

        // If we have enough votes, process the appeal
        if (appealVoteCount[appealIndex] >= MIN_VOTES_REQUIRED) {
            processAppealVotes(user, appealIndex, notes);
        }
    }

    function processAppealVotes(
        address user,
        uint256 appealIndex,
        string memory notes
    ) internal {
        Appeal storage appeal = userAppeals[user][appealIndex];
        uint256 approvalCount = 0;
        uint256 totalVotes = appealVoteCount[appealIndex];

        // Count approval votes from active reviewers
        for (uint256 i = 0; i < reviewers.length; i++) {
            if (appealVotes[appealIndex][reviewers[i]]) {
                approvalCount++;
            }
        }

        // Determine if appeal is approved (more than 50% approval)
        bool isApproved = (approvalCount * 100) > (totalVotes * 50);

        appeal.status = isApproved
            ? AppealStatus.APPROVED
            : AppealStatus.REJECTED;
        appeal.reviewer = msg.sender;
        appeal.reviewNotes = notes;
        appeal.reviewTimestamp = block.timestamp;

        if (isApproved) {
            // Remove restrictions and grant reputation bonus
            moderatorControl.removeRestriction(user);
            reputationSystem.updateScore(
                user,
                int256(REPUTATION_BONUS_ON_SUCCESSFUL_APPEAL)
            );
        }

        emit AppealStatusUpdated(user, appealIndex, appeal.status);
        emit AppealReviewed(user, appealIndex, appeal.status, msg.sender);
    }

    function getAppealDetails(
        address user,
        uint256 appealIndex
    ) external view returns (Appeal memory) {
        require(
            appealIndex < userAppeals[user].length,
            'Appeal does not exist'
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
}
