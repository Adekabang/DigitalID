// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/access/Ownable.sol';
import './DigitalIdentityNFT.sol';

contract ReputationSystem is Ownable {
    DigitalIdentityNFT public digitalIdentity;

    struct ReputationScore {
        uint256 score;
        bool isBanned;
        uint256 lastUpdate;
        uint256 decayStartTime;
        uint256 totalPositivePoints;
        uint256 totalNegativePoints;
        uint256 activityCount;
    }

    struct WeightConfig {
        uint256 positiveWeight;
        uint256 negativeWeight;
        uint256 decayRate;
        uint256 decayPeriod;
        uint256 activityMultiplier;
    }

    mapping(address => ReputationScore) public reputationScores;
    WeightConfig public weightConfig;

    uint256 public constant INITIAL_SCORE = 100;
    uint256 public constant MIN_SCORE = 0;
    uint256 public constant MAX_SCORE = 1000;
    uint256 public constant BAN_THRESHOLD = 50;
    uint256 public constant SCALE_FACTOR = 1e18;

    event ScoreUpdated(
        address indexed user,
        uint256 newScore,
        uint256 decayedPoints,
        uint256 weightedPoints
    );
    event WeightConfigUpdated(
        uint256 positiveWeight,
        uint256 negativeWeight,
        uint256 decayRate,
        uint256 decayPeriod,
        uint256 activityMultiplier
    );
    event UserBanned(address indexed user);
    event UserUnbanned(address indexed user);

    constructor(address _digitalIdentityAddress) {
        digitalIdentity = DigitalIdentityNFT(_digitalIdentityAddress);

        // Initialize default weight configuration
        weightConfig = WeightConfig({
            positiveWeight: 1 * SCALE_FACTOR, // 1.0x for positive actions
            negativeWeight: 2 * SCALE_FACTOR, // 2.0x for negative actions
            decayRate: (1 * SCALE_FACTOR) / 100, // 0.01x per period
            decayPeriod: 30 days, // 30 day decay period
            activityMultiplier: (5 * SCALE_FACTOR) / 100 // 0.05x per activity
        });
    }

    function updateWeightConfig(
        uint256 _positiveWeight,
        uint256 _negativeWeight,
        uint256 _decayRate,
        uint256 _decayPeriod,
        uint256 _activityMultiplier
    ) external onlyOwner {
        require(_decayPeriod > 0, 'Decay period must be positive');
        require(_decayRate < SCALE_FACTOR, 'Decay rate must be less than 1');

        weightConfig = WeightConfig({
            positiveWeight: _positiveWeight,
            negativeWeight: _negativeWeight,
            decayRate: _decayRate,
            decayPeriod: _decayPeriod,
            activityMultiplier: _activityMultiplier
        });

        emit WeightConfigUpdated(
            _positiveWeight,
            _negativeWeight,
            _decayRate,
            _decayPeriod,
            _activityMultiplier
        );
    }

    function initializeUserScore(address user) external onlyOwner {
        require(
            digitalIdentity.hasIdentity(user),
            'User must have digital identity'
        );
        require(
            reputationScores[user].lastUpdate == 0,
            'Score already initialized'
        );

        reputationScores[user] = ReputationScore({
            score: INITIAL_SCORE,
            isBanned: false,
            lastUpdate: block.timestamp,
            decayStartTime: block.timestamp,
            totalPositivePoints: 0,
            totalNegativePoints: 0,
            activityCount: 0
        });

        emit ScoreUpdated(user, INITIAL_SCORE, 0, 0);
    }

    function calculateDecay(
        ReputationScore memory score
    ) internal view returns (uint256) {
        if (block.timestamp <= score.decayStartTime) {
            return 0;
        }

        uint256 periodsPassed = (block.timestamp - score.decayStartTime) /
            weightConfig.decayPeriod;
        if (periodsPassed == 0) {
            return 0;
        }

        uint256 decayFactor = SCALE_FACTOR;
        for (uint256 i = 0; i < periodsPassed; i++) {
            decayFactor =
                (decayFactor * (SCALE_FACTOR - weightConfig.decayRate)) /
                SCALE_FACTOR;
        }

        uint256 decayedScore = (score.score * decayFactor) / SCALE_FACTOR;
        return score.score - decayedScore;
    }

    function calculateWeightedPoints(
        int256 points,
        ReputationScore memory score
    ) internal view returns (int256) {
        uint256 activityBonus = (score.activityCount *
            weightConfig.activityMultiplier) / SCALE_FACTOR;
        uint256 weight = points > 0
            ? weightConfig.positiveWeight
            : weightConfig.negativeWeight;

        int256 weightedPoints = (points * int256(weight)) /
            int256(SCALE_FACTOR);
        return
            weightedPoints +
            (points > 0 ? int256(activityBonus) : -int256(activityBonus));
    }

    function updateScore(address user, int256 points) external onlyOwner {
        require(
            digitalIdentity.hasIdentity(user),
            'User must have digital identity'
        );

        ReputationScore storage userScore = reputationScores[user];
        require(userScore.lastUpdate > 0, 'Score not initialized');

        // Calculate decay
        uint256 decayedPoints = calculateDecay(userScore);
        int256 currentScore = int256(userScore.score) - int256(decayedPoints);

        // Update activity metrics
        userScore.activityCount++;
        if (points > 0) {
            userScore.totalPositivePoints += uint256(points);
        } else {
            userScore.totalNegativePoints += uint256(-points);
        }

        // Calculate weighted points
        int256 weightedPoints = calculateWeightedPoints(points, userScore);
        int256 newScore = currentScore + weightedPoints;

        // Apply bounds
        if (newScore < int256(MIN_SCORE)) {
            userScore.score = MIN_SCORE;
        } else if (newScore > int256(MAX_SCORE)) {
            userScore.score = MAX_SCORE;
        } else {
            userScore.score = uint256(newScore);
        }

        userScore.lastUpdate = block.timestamp;
        userScore.decayStartTime = block.timestamp;

        // Check ban status
        if (userScore.score < BAN_THRESHOLD && !userScore.isBanned) {
            userScore.isBanned = true;
            emit UserBanned(user);
        } else if (userScore.score >= BAN_THRESHOLD && userScore.isBanned) {
            userScore.isBanned = false;
            emit UserUnbanned(user);
        }

        emit ScoreUpdated(
            user,
            userScore.score,
            decayedPoints,
            uint256(weightedPoints)
        );
    }

    function getUserScore(address user) external view returns (uint256) {
        ReputationScore memory score = reputationScores[user];
        uint256 decayedPoints = calculateDecay(score);
        return
            score.score > decayedPoints
                ? score.score - decayedPoints
                : MIN_SCORE;
    }

    function getUserFullScore(
        address user
    )
        external
        view
        returns (
            uint256 score,
            bool isBanned,
            uint256 lastUpdate,
            uint256 totalPositivePoints,
            uint256 totalNegativePoints,
            uint256 activityCount,
            uint256 decayedPoints
        )
    {
        ReputationScore memory userScore = reputationScores[user];
        uint256 decay = calculateDecay(userScore);

        return (
            userScore.score > decay ? userScore.score - decay : MIN_SCORE,
            userScore.isBanned,
            userScore.lastUpdate,
            userScore.totalPositivePoints,
            userScore.totalNegativePoints,
            userScore.activityCount,
            decay
        );
    }

    function getWeightConfig() external view returns (WeightConfig memory) {
        return weightConfig;
    }
}
