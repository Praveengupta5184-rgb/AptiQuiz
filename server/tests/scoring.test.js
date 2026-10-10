const { calculateScore, SCORING_CONFIG } = require('../src/game/scoring');

describe('Scoring Module', () => {
    const timeLimitMs = 10000; // 10 seconds

    it('returns 0 for incorrect answer', () => {
        const result = calculateScore(false, 0, 5000, timeLimitMs);
        expect(result.points).toBe(0);
        expect(result.isLate).toBe(false);
    });

    it('calculates full speed bonus if answered instantly (0ms)', () => {
        const result = calculateScore(true, 0, 0, timeLimitMs);
        // Base(100) + Speed(50) = 150. Medium multiplier is 1.2 => 150 * 1.2 = 180
        expect(result.points).toBe(180);
    });

    it('calculates half speed bonus at exactly half time limit', () => {
        const result = calculateScore(true, 0, 5000, timeLimitMs, 0, 'easy');
        // Base(100) + Speed(25) = 125. Easy multiplier is 1.0 => 125
        expect(result.points).toBe(125);
    });

    it('caps streak bonus at max level', () => {
        const result1 = calculateScore(true, 0, 0, timeLimitMs, 5, 'easy'); // streak 5
        const result2 = calculateScore(true, 0, 0, timeLimitMs, 10, 'easy'); // streak 10
        expect(result1.points).toBe(result2.points); // Both should have max streak bonus (50)
    });

    it('applies difficulty multipliers correctly', () => {
        const easy = calculateScore(true, 0, 0, timeLimitMs, 0, 'easy').points;
        const medium = calculateScore(true, 0, 0, timeLimitMs, 0, 'medium').points;
        const hard = calculateScore(true, 0, 0, timeLimitMs, 0, 'hard').points;
        expect(easy).toBe(150); // 150 * 1.0
        expect(medium).toBe(180); // 150 * 1.2
        expect(hard).toBe(225); // 150 * 1.5
    });

    it('handles double points powerup', () => {
        const normal = calculateScore(true, 0, 0, timeLimitMs, 0, 'easy', 0, false).points;
        const doubled = calculateScore(true, 0, 0, timeLimitMs, 0, 'easy', 0, true).points;
        expect(doubled).toBe(normal * 2);
    });

    it('compensates for network latency up to max', () => {
        // Receipt time 5500, but RTT is 1000. Compensation = 500.
        // Effective elapsed should be 5000.
        const rtt = 1000;
        const result = calculateScore(true, 0, 5500, timeLimitMs, 0, 'easy', rtt);
        expect(result.compensatedElapsedMs).toBe(5000);
        expect(result.points).toBe(125); // Same as 5000ms test above
    });

    it('rejects answers beyond time limit + grace period', () => {
        const lateTime = timeLimitMs + SCORING_CONFIG.NETWORK_GRACE_MS + 10;
        const result = calculateScore(true, 0, lateTime, timeLimitMs);
        expect(result.isLate).toBe(true);
        expect(result.points).toBe(0);
    });
});
