/**
 * Configuration constants for the scoring system.
 * 
 * Score = Base + SpeedBonus(t) + StreakBonus + DifficultyWeight
 */
const SCORING_CONFIG = {
    BASE_POINTS: 100,
    MAX_SPEED_BONUS: 50,
    STREAK_BONUS_PER_LEVEL: 10,
    MAX_STREAK_LEVEL: 5,
    DIFFICULTY_MULTIPLIER: {
        easy: 1.0,
        medium: 1.2,
        hard: 1.5
    },
    WRONG_ANSWER_POINTS: 0,
    NETWORK_GRACE_MS: 250, // allow answers received slightly after deadline
    MAX_LATENCY_COMPENSATION_MS: 500 // cap on how much ping we forgive
};

/**
 * Calculates the score for an answer.
 * 
 * @param {boolean} isCorrect - whether the chosen option was correct
 * @param {number} serverStartTimeMs - when the question officially opened on the server
 * @param {number} serverReceiptTimeMs - when the server received the answer
 * @param {number} timeLimitMs - total allowed time for the question
 * @param {number} currentStreak - the player's current consecutive correct answers
 * @param {string} difficulty - 'easy', 'medium', or 'hard'
 * @param {number} roundTripLatencyMs - the player's measured ping
 * @param {boolean} hasDoublePoints - whether double points powerup is active
 * @returns {object} { points, isLate, compensatedElapsedMs }
 */
function calculateScore(
    isCorrect, 
    serverStartTimeMs, 
    serverReceiptTimeMs, 
    timeLimitMs, 
    currentStreak = 0, 
    difficulty = 'medium',
    roundTripLatencyMs = 0,
    hasDoublePoints = false,
    hasTimeFreeze = false
) {
    // 1. Compensate for latency (subtract half RTT, capped at MAX)
    const compensation = Math.min(roundTripLatencyMs / 2, SCORING_CONFIG.MAX_LATENCY_COMPENSATION_MS);
    
    // 2. Calculate elapsed time
    let compensatedElapsedMs = 0;
    if (!hasTimeFreeze) {
        const rawElapsedMs = serverReceiptTimeMs - serverStartTimeMs;
        compensatedElapsedMs = rawElapsedMs - compensation;
        if (compensatedElapsedMs < 0) compensatedElapsedMs = 0;
        compensatedElapsedMs = Math.round(compensatedElapsedMs);
    }

    // 3. Check if answer is too late (beyond deadline + network grace)
    const deadlineMs = timeLimitMs + SCORING_CONFIG.NETWORK_GRACE_MS;
    const isLate = compensatedElapsedMs > deadlineMs;

    if (isLate || !isCorrect) {
        return {
            points: SCORING_CONFIG.WRONG_ANSWER_POINTS,
            isLate,
            compensatedElapsedMs
        };
    }

    // 4. Base Score
    let score = SCORING_CONFIG.BASE_POINTS;

    // 5. Speed Bonus (linear decay)
    // Formula: MaxBonus * (1 - (Elapsed / TimeLimit))
    const speedRatio = Math.max(0, 1 - (compensatedElapsedMs / timeLimitMs));
    const speedBonus = Math.floor(SCORING_CONFIG.MAX_SPEED_BONUS * speedRatio);
    score += speedBonus;

    // 6. Streak Bonus
    const effectiveStreak = Math.min(currentStreak, SCORING_CONFIG.MAX_STREAK_LEVEL);
    const streakBonus = effectiveStreak * SCORING_CONFIG.STREAK_BONUS_PER_LEVEL;
    score += streakBonus;

    // 7. Difficulty Multiplier
    const multiplier = SCORING_CONFIG.DIFFICULTY_MULTIPLIER[difficulty.toLowerCase()] || 1.0;
    score = Math.floor(score * multiplier);

    // 8. Power-ups
    if (hasDoublePoints) {
        score *= 2;
    }

    return {
        points: score,
        isLate: false,
        compensatedElapsedMs
    };
}

module.exports = {
    SCORING_CONFIG,
    calculateScore
};
