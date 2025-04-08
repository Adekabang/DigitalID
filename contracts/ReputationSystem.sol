// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import '@openzeppelin/contracts/access/Ownable.sol';
// Use the interface for type checking constructor argument
import './IDigitalIdentityNFT.sol';

contract ReputationSystem is Ownable {
    // Use the interface type for the dependency
    IDigitalIdentityNFT public digitalIdentity;

    // Structure to hold detailed reputation information for a user
    struct ReputationScore {
        uint256 score; // Current score (before decay calculation for views)
        bool isBanned; // Flag if user score is below ban threshold
        uint256 lastUpdate; // Timestamp of the last score modification
        uint256 decayStartTime; // Timestamp from when the current decay calculation should start
        uint256 totalPositivePoints; // Cumulative raw positive points received
        uint256 totalNegativePoints; // Cumulative raw negative points received (absolute value)
        uint256 activityCount; // Counter for user activity relevant to reputation
    }

    // Structure to hold the configurable parameters for score calculation
    struct WeightConfig {
        uint256 positiveWeight; // Multiplier for positive points (scaled by SCALE_FACTOR)
        uint256 negativeWeight; // Multiplier for negative points (scaled by SCALE_FACTOR)
        uint256 decayRate; // Percentage decay per period (scaled by SCALE_FACTOR, e.g., 1e16 for 1%)
        uint256 decayPeriod; // Duration of the decay period in seconds
        uint256 activityMultiplier; // Bonus multiplier per activity count (scaled by SCALE_FACTOR)
    }

    // Mapping from user address to their reputation details
    mapping(address => ReputationScore) public reputationScores;

    // Configuration for score calculation weights and parameters
    WeightConfig public weightConfig;

    // Constants for score boundaries and calculation scaling
    uint256 public constant INITIAL_SCORE = 100;
    uint256 public constant MIN_SCORE = 0;
    uint256 public constant MAX_SCORE = 1000; // Maximum possible score
    uint256 public constant BAN_THRESHOLD = 50; // Score below which a user is banned
    uint256 public constant SCALE_FACTOR = 1e18; // For fixed-point arithmetic (1.0)

    // Events
    event ScoreUpdated(
        address indexed user,
        uint256 newScore, // Score after update and decay applied in calculation
        int256 pointsGiven, // Raw points input
        int256 weightedAdjustment, // Actual adjustment after weighting/bonus
        uint256 decayApplied // Amount score decayed before adjustment
    );
    event WeightConfigUpdated(
        uint256 positiveWeight,
        uint256 negativeWeight,
        uint256 decayRate,
        uint256 decayPeriod,
        uint256 activityMultiplier
    );
    event UserBanned(address indexed user, uint256 score);
    event UserUnbanned(address indexed user, uint256 score);
    event ScoreInitialized(address indexed user, uint256 initialScore);

    /**
     * @notice Constructor initializes the contract with the Digital Identity NFT address.
     * @param _digitalIdentityAddress The address of the deployed DigitalIdentityNFT contract.
     */
    constructor(address _digitalIdentityAddress) {
        require(
            _digitalIdentityAddress != address(0),
            'ReputationSystem: Invalid DigitalIdentityNFT address'
        );
        digitalIdentity = IDigitalIdentityNFT(_digitalIdentityAddress);

        // Initialize default weight configuration (can be updated later by owner)
        weightConfig = WeightConfig({
            positiveWeight: 1 * SCALE_FACTOR, // 1.0x for positive actions
            negativeWeight: 2 * SCALE_FACTOR, // 2.0x for negative actions (Default)
            decayRate: (1 * SCALE_FACTOR) / 100, // 1% decay per period (0.01 * 1e18)
            decayPeriod: 30 days, // Decay period
            activityMultiplier: (5 * SCALE_FACTOR) / 1000 // 0.5% bonus per activity (0.005 * 1e18)
        });
    }

    /**
     * @notice Updates the configuration parameters for reputation calculation.
     * @dev Can only be called by the contract owner (intended to be ModeratorControl).
     * @param _positiveWeight New positive weight multiplier (scaled by 1e18).
     * @param _negativeWeight New negative weight multiplier (scaled by 1e18).
     * @param _decayRate New decay rate per period (scaled by 1e18, must be < 1e18).
     * @param _decayPeriod New duration of the decay period in seconds (must be > 0).
     * @param _activityMultiplier New activity bonus multiplier (scaled by 1e18).
     */
    function updateWeightConfig(
        uint256 _positiveWeight,
        uint256 _negativeWeight,
        uint256 _decayRate,
        uint256 _decayPeriod,
        uint256 _activityMultiplier
    ) external onlyOwner {
        require(
            _decayPeriod > 0,
            'ReputationSystem: Decay period must be positive'
        );
        require(
            _decayRate < SCALE_FACTOR,
            'ReputationSystem: Decay rate must be less than 1.0'
        );
        require(
            _positiveWeight > 0,
            'ReputationSystem: Positive weight must be > 0'
        );
        require(
            _negativeWeight > 0,
            'ReputationSystem: Negative weight must be > 0'
        );

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

    /**
     * @notice Initializes the reputation score for a user.
     * @dev Can only be called by the contract owner (ModeratorControl).
     * @dev Should be called only once per user, typically after identity creation.
     * @param user The address of the user whose score is being initialized.
     */
    function initializeUserScore(address user) external onlyOwner {
        // Check if user has an identity in the linked NFT contract
        require(
            digitalIdentity.hasIdentity(user),
            'ReputationSystem: User must have digital identity'
        );
        // Prevent re-initialization
        require(
            reputationScores[user].lastUpdate == 0,
            'ReputationSystem: Score already initialized'
        );

        reputationScores[user] = ReputationScore({
            score: INITIAL_SCORE,
            isBanned: false,
            lastUpdate: block.timestamp,
            decayStartTime: block.timestamp, // Start decay timer now
            totalPositivePoints: 0,
            totalNegativePoints: 0,
            activityCount: 0
        });

        emit ScoreInitialized(user, INITIAL_SCORE);
    }

    /**
     * @notice Calculates the amount the score should decay based on time passed.
     * @param scoreData The current reputation data of the user.
     */
    function calculateDecay(
        ReputationScore memory scoreData
    ) internal view returns (uint256 decayAmount) {
        // No decay if decay period is zero or time hasn't passed
        if (
            weightConfig.decayPeriod == 0 ||
            block.timestamp <= scoreData.decayStartTime
        ) {
            return 0;
        }

        uint256 timePassed = block.timestamp - scoreData.decayStartTime;
        uint256 periodsPassed = timePassed / weightConfig.decayPeriod;

        if (periodsPassed == 0) {
            return 0; // Not enough time passed for a full decay period
        }

        // Calculate decay using compound factor: score * (1 - decayRate)^periodsPassed
        // Use fixed-point math with SCALE_FACTOR
        uint256 decayFactor = SCALE_FACTOR; // Start with 1.0
        uint256 oneMinusRate = SCALE_FACTOR - weightConfig.decayRate;

        // Apply decay factor for each period passed
        // Use loop for simplicity, consider optimizing for very large periodsPassed if needed
        for (uint256 i = 0; i < periodsPassed; i++) {
            decayFactor = (decayFactor * oneMinusRate) / SCALE_FACTOR;
            // Prevent underflow if decayFactor becomes extremely small
            if (decayFactor == 0) break;
        }

        uint256 scoreBeforeDecay = scoreData.score;
        uint256 scoreAfterDecay = (scoreBeforeDecay * decayFactor) /
            SCALE_FACTOR;

        // Ensure score doesn't decay below MIN_SCORE implicitly
        if (scoreAfterDecay > scoreBeforeDecay) {
            return 0; // Should not happen with valid decayRate, but safety check
        }
        decayAmount = scoreBeforeDecay - scoreAfterDecay;

        // Ensure decay doesn't make score negative (though score is uint)
        if (decayAmount > scoreBeforeDecay) {
            decayAmount = scoreBeforeDecay;
        }

        return decayAmount;
    }

    /**
     * @notice Calculates the weighted point adjustment based on configuration.
     * @param points The raw points change (positive or negative).
     * @param scoreData The current reputation data of the user.
     */
    function calculateWeightedPoints(
        int256 points,
        ReputationScore memory scoreData
    ) internal view returns (int256 weightedAdjustment) {
        // Calculate activity bonus (applied positively for positive points, negatively for negative)
        // Ensure activityMultiplier isn't excessively large
        uint256 activityBonus = (scoreData.activityCount *
            weightConfig.activityMultiplier); // No division by SCALE_FACTOR yet

        uint256 weight;
        if (points > 0) {
            weight = weightConfig.positiveWeight;
            // Apply positive activity bonus
            weightedAdjustment =
                (points * int256(weight + activityBonus)) /
                int256(SCALE_FACTOR);
        } else if (points < 0) {
            weight = weightConfig.negativeWeight;
            // Apply negative activity bonus (makes penalty harsher)
            weightedAdjustment =
                (points * int256(weight + activityBonus)) /
                int256(SCALE_FACTOR);
        } else {
            // points == 0
            weightedAdjustment = 0;
        }

        return weightedAdjustment;
    }

    /**
     * @notice Updates a user's reputation score based on input points.
     * @dev Can only be called by the contract owner (ModeratorControl).
     * @dev Applies decay, calculates weighted points, updates score, checks ban status.
     * @param user The address of the user whose score is being updated.
     * @param points The raw points change (positive or negative).
     */
    function updateScore(address user, int256 points) external onlyOwner {
        require(
            digitalIdentity.hasIdentity(user),
            'ReputationSystem: User must have digital identity'
        );

        ReputationScore storage userScore = reputationScores[user];
        require(
            userScore.lastUpdate > 0,
            'ReputationSystem: Score not initialized'
        );

        // 1. Calculate and apply decay since last update
        uint256 decayApplied = calculateDecay(userScore);
        int256 currentScoreAfterDecay;
        if (userScore.score >= decayApplied) {
            currentScoreAfterDecay = int256(userScore.score - decayApplied);
        } else {
            currentScoreAfterDecay = int256(MIN_SCORE); // Cannot go below min score due to decay
        }

        // 2. Update activity metrics before calculating weighted points
        userScore.activityCount++;
        if (points > 0) {
            userScore.totalPositivePoints += uint256(points);
        } else if (points < 0) {
            // Store absolute value for totalNegativePoints
            userScore.totalNegativePoints += uint256(-points);
        }

        // 3. Calculate weighted adjustment based on input points and current state
        int256 weightedAdjustment = calculateWeightedPoints(points, userScore);

        // 4. Calculate the new score
        int256 newScoreInt = currentScoreAfterDecay + weightedAdjustment;

        // 5. Apply bounds (MIN_SCORE and MAX_SCORE)
        uint256 finalNewScore;
        if (newScoreInt < int256(MIN_SCORE)) {
            finalNewScore = MIN_SCORE;
        } else if (newScoreInt > int256(MAX_SCORE)) {
            finalNewScore = MAX_SCORE;
        } else {
            finalNewScore = uint256(newScoreInt);
        }

        // 6. Update score state
        userScore.score = finalNewScore;
        userScore.lastUpdate = block.timestamp;
        // Reset decay timer: start calculating decay from now until the next update
        userScore.decayStartTime = block.timestamp;

        // 7. Check and update ban status
        bool previousBanStatus = userScore.isBanned;
        if (finalNewScore < BAN_THRESHOLD && !previousBanStatus) {
            userScore.isBanned = true;
            emit UserBanned(user, finalNewScore);
        } else if (finalNewScore >= BAN_THRESHOLD && previousBanStatus) {
            userScore.isBanned = false;
            emit UserUnbanned(user, finalNewScore);
        }

        // 8. Emit update event
        emit ScoreUpdated(
            user,
            finalNewScore,
            points,
            weightedAdjustment,
            decayApplied
        );
    }

    /**
     * @notice Gets the user's current reputation score after applying decay.
     * @param user The address of the user.
     * @return The current calculated score.
     */
    function getUserScore(address user) external view returns (uint256) {
        ReputationScore memory scoreData = reputationScores[user];
        // Return 0 if score not initialized
        if (scoreData.lastUpdate == 0) {
            return 0;
        }
        uint256 decayAmount = calculateDecay(scoreData);
        return
            scoreData.score > decayAmount
                ? scoreData.score - decayAmount
                : MIN_SCORE;
    }

    /**
     * @notice Gets the full reputation details for a user, including the calculated current score.
     * @param user The address of the user.
     * @return score Current score after decay.
     * @return isBanned Current ban status.
     * @return lastUpdate Timestamp of last raw score update.
     * @return totalPositivePoints Cumulative positive points.
     * @return totalNegativePoints Cumulative negative points (absolute value).
     * @return activityCount Total activity count.
     * @return decayApplied Amount score decayed since last update (for info).
     */
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
            uint256 decayApplied // Renamed from decayedPoints for clarity
        )
    {
        ReputationScore memory userScore = reputationScores[user];
        // Return empty data if score not initialized
        if (userScore.lastUpdate == 0) {
            return (0, false, 0, 0, 0, 0, 0);
        }

        decayApplied = calculateDecay(userScore);
        score = userScore.score > decayApplied
            ? userScore.score - decayApplied
            : MIN_SCORE;

        return (
            score,
            userScore.isBanned, // Ban status is based on score *before* decay typically, check logic if needed
            userScore.lastUpdate,
            userScore.totalPositivePoints,
            userScore.totalNegativePoints,
            userScore.activityCount,
            decayApplied
        );
    }

    /**
     * @notice Gets the current weight configuration.
     * @return The WeightConfig struct containing current parameters.
     */
    function getWeightConfig() external view returns (WeightConfig memory) {
        return weightConfig;
    }
}
