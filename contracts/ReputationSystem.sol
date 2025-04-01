// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./DigitalIdentityNFT.sol";

contract ReputationSystem is Ownable {
    DigitalIdentityNFT public digitalIdentity;

    struct ReputationScore {
        uint256 score;
        bool isBanned;
        uint256 lastUpdate;
    }

    mapping(address => ReputationScore) public reputationScores;
    uint256 public constant INITIAL_SCORE = 100;
    uint256 public constant MIN_SCORE = 0;
    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant BAN_THRESHOLD = 50;

    event ScoreUpdated(address indexed user, uint256 newScore);
    event UserBanned(address indexed user);
    event UserUnbanned(address indexed user);

    constructor(address _digitalIdentityAddress) {
        digitalIdentity = DigitalIdentityNFT(_digitalIdentityAddress);
    }

    function initializeUserScore(address user) external onlyOwner {
        require(
            digitalIdentity.hasIdentity(user),
            "User must have digital identity"
        );
        require(
            reputationScores[user].lastUpdate == 0,
            "Score already initialized"
        );

        reputationScores[user] = ReputationScore({
            score: INITIAL_SCORE,
            isBanned: false,
            lastUpdate: block.timestamp
        });

        emit ScoreUpdated(user, INITIAL_SCORE);
    }

    function updateScore(address user, int256 points) external onlyOwner {
        require(
            digitalIdentity.hasIdentity(user),
            "User must have digital identity"
        );

        ReputationScore storage userScore = reputationScores[user];
        require(userScore.lastUpdate > 0, "Score not initialized");

        int256 newScore = int256(userScore.score) + points;

        if (newScore < int256(MIN_SCORE)) {
            userScore.score = MIN_SCORE;
        } else if (newScore > int256(MAX_SCORE)) {
            userScore.score = MAX_SCORE;
        } else {
            userScore.score = uint256(newScore);
        }

        userScore.lastUpdate = block.timestamp;

        if (userScore.score < BAN_THRESHOLD && !userScore.isBanned) {
            userScore.isBanned = true;
            emit UserBanned(user);
        } else if (userScore.score >= BAN_THRESHOLD && userScore.isBanned) {
            userScore.isBanned = false;
            emit UserUnbanned(user);
        }

        emit ScoreUpdated(user, userScore.score);
    }

    function getUserScore(address user) external view returns (uint256) {
        return reputationScores[user].score;
    }

    function getUserBanStatus(address user) external view returns (bool) {
        return reputationScores[user].isBanned;
    }

    function getUserLastUpdate(address user) external view returns (uint256) {
        return reputationScores[user].lastUpdate;
    }

    function getUserFullScore(
        address user
    ) external view returns (ReputationScore memory) {
        return reputationScores[user];
    }
}
