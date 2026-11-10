/**
 * antiCheat.js — Suspicious Activity Monitor
 *
 * Server-authoritative anti-cheat detection.
 * Records suspicious events with risk scores.
 * Does NOT auto-ban — requires admin review for serious penalties.
 *
 * Risk Score scale: 1 (low) → 10 (critical)
 * Events are logged, not acted upon automatically.
 */

const { pool } = require('../db');

// Thresholds — do not expose to clients
const THRESHOLDS = {
    MIN_ANSWER_MS: 400,          // Faster than this is suspicious (even on fast connection)
    IMPOSSIBLE_ANSWER_MS: 100,   // Near-impossible human reaction
    MAX_RECONNECTS_PER_MINUTE: 5,
    RATE_LIMIT_BURST: 10,        // Answers per 30s before flagging
};

// In-memory tracking (per-socket, cleared on disconnect)
class AntiCheatMonitor {
    constructor() {
        // Map: studentId → { reconnects: [{ts}], answerTimes: [ms], rateEvents: [ts] }
        this.sessionData = new Map();
    }

    _getSession(studentId) {
        if (!this.sessionData.has(studentId)) {
            this.sessionData.set(studentId, {
                reconnects: [],
                answerTimes: [],
                rateEvents: [],
                duplicateAttempts: 0,
                lastAnswerTs: 0,
            });
        }
        return this.sessionData.get(studentId);
    }

    clearSession(studentId) {
        this.sessionData.delete(studentId);
    }

    /**
     * Log a suspicious event to DB with organizer and tournament association.
     * @param {object} opts
     */
    async logEvent({ studentId, roomId, tournamentId, organizerId, eventType, riskScore, details }) {
        try {
            let finalOrganizerId = organizerId;
            let finalTournamentId = tournamentId;

            // Automatically resolve organizer_id and tournament_id from room_id if missing
            if (roomId && (!finalOrganizerId || !finalTournamentId)) {
                const roomRes = await pool.query(
                    `SELECT r.teacher_id, tm.tournament_id
                     FROM rooms r
                     LEFT JOIN tournament_matches tm ON tm.room_id = r.id
                     WHERE r.id = $1`,
                    [roomId]
                );
                if (roomRes.rows.length > 0) {
                    finalOrganizerId = finalOrganizerId || roomRes.rows[0].teacher_id;
                    finalTournamentId = finalTournamentId || roomRes.rows[0].tournament_id;
                }
            }

            const riskLevel = riskScore >= 8 ? 'critical' : riskScore >= 5 ? 'high' : riskScore >= 3 ? 'medium' : 'low';

            await pool.query(
                `INSERT INTO suspicious_activity_logs
                    (student_id, room_id, tournament_id, organizer_id, event_type, risk_score, risk_level, details)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    studentId || null,
                    roomId || null,
                    finalTournamentId || null,
                    finalOrganizerId || null,
                    eventType,
                    riskScore,
                    riskLevel,
                    JSON.stringify(details || {})
                ]
            );
        } catch (err) {
            console.error('[AntiCheat] Failed to log event:', err.message);
        }
    }

    /**
     * Check answer timing for suspicious patterns.
     * Returns { flagged: bool, riskScore, reason }
     */
    async checkAnswer({ studentId, roomId, elapsedMs, questionIndex }) {
        const result = { flagged: false, riskScore: 0, reason: null };
        if (!studentId) return result;

        const session = this._getSession(studentId);
        session.answerTimes.push(elapsedMs);

        // Check 1: Impossible speed
        if (elapsedMs > 0 && elapsedMs < THRESHOLDS.IMPOSSIBLE_ANSWER_MS) {
            result.flagged = true;
            result.riskScore = 8;
            result.reason = 'impossible_speed';
            await this.logEvent({
                studentId, roomId, eventType: 'impossible_speed',
                riskScore: 8,
                details: { elapsed_ms: elapsedMs, threshold_ms: THRESHOLDS.IMPOSSIBLE_ANSWER_MS, question_index: questionIndex }
            });
        }
        // Check 2: Consistently very fast (all answers < 400ms and more than 3 answers)
        else if (session.answerTimes.length >= 3) {
            const recentFast = session.answerTimes.slice(-3).filter(t => t < THRESHOLDS.MIN_ANSWER_MS && t > 0);
            if (recentFast.length === 3) {
                result.flagged = true;
                result.riskScore = 5;
                result.reason = 'consistently_fast';
                await this.logEvent({
                    studentId, roomId, eventType: 'suspicious_speed_pattern',
                    riskScore: 5,
                    details: { recent_times_ms: session.answerTimes.slice(-3), question_index: questionIndex }
                });
            }
        }

        return result;
    }

    /**
     * Track duplicate answer attempts.
     */
    async trackDuplicateAnswer({ studentId, roomId, questionIndex }) {
        if (!studentId) return;
        const session = this._getSession(studentId);
        session.duplicateAttempts = (session.duplicateAttempts || 0) + 1;

        if (session.duplicateAttempts >= 3) {
            await this.logEvent({
                studentId, roomId, eventType: 'repeated_duplicate_answers',
                riskScore: 4,
                details: { attempt_count: session.duplicateAttempts, question_index: questionIndex }
            });
        }
    }

    /**
     * Track reconnection patterns.
     */
    async trackReconnect({ studentId, roomId }) {
        if (!studentId) return;
        const session = this._getSession(studentId);
        const now = Date.now();
        session.reconnects = session.reconnects.filter(ts => now - ts < 60000); // last 1 min
        session.reconnects.push(now);

        if (session.reconnects.length >= THRESHOLDS.MAX_RECONNECTS_PER_MINUTE) {
            await this.logEvent({
                studentId, roomId, eventType: 'reconnect_abuse',
                riskScore: 3,
                details: { reconnects_in_last_minute: session.reconnects.length }
            });
        }
    }

    /**
     * Track rate limit violations.
     */
    async trackRateLimit({ studentId, roomId, eventType }) {
        if (!studentId) return;
        await this.logEvent({
            studentId, roomId, eventType: `rate_limit_${eventType}`,
            riskScore: 2,
            details: { event: eventType }
        });
    }

    /**
     * Track unauthorized room access attempts.
     */
    async trackUnauthorizedAccess({ studentId, roomId, detail }) {
        if (!studentId) return;
        await this.logEvent({
            studentId, roomId, eventType: 'unauthorized_access',
            riskScore: 6,
            details: { detail }
        });
    }
}

// Singleton
const antiCheatMonitor = new AntiCheatMonitor();

/**
 * Get suspicious activity logs with strict multi-organizer isolation.
 * If organizerId is supplied, only logs owned by that organizer are returned.
 */
async function getSuspiciousLogs({ studentId, roomId, tournamentId, organizerId, eventType, riskLevel, reviewed, limit = 50, offset = 0 }) {
    const conditions = [];
    const params = [];

    // Multi-organizer strict data isolation
    if (organizerId) {
        conditions.push(`sal.organizer_id = $${params.length + 1}`);
        params.push(organizerId);
    }
    if (studentId) { conditions.push(`sal.student_id = $${params.length + 1}`); params.push(studentId); }
    if (roomId) { conditions.push(`sal.room_id = $${params.length + 1}`); params.push(roomId); }
    if (tournamentId) { conditions.push(`sal.tournament_id = $${params.length + 1}`); params.push(tournamentId); }
    if (eventType) { conditions.push(`sal.event_type = $${params.length + 1}`); params.push(eventType); }
    if (riskLevel) { conditions.push(`sal.risk_level = $${params.length + 1}`); params.push(riskLevel); }
    if (reviewed !== undefined) { conditions.push(`sal.reviewed = $${params.length + 1}`); params.push(reviewed); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const res = await pool.query(
        `SELECT sal.*,
                s.email AS student_email, s.display_name AS student_name,
                r.code AS room_code, r.battle_name,
                tour.name AS tournament_name,
                tchr.display_name AS organizer_name
         FROM suspicious_activity_logs sal
         LEFT JOIN students s ON s.id = sal.student_id
         LEFT JOIN rooms r ON r.id = sal.room_id
         LEFT JOIN tournaments tour ON tour.id = sal.tournament_id
         LEFT JOIN teachers tchr ON tchr.id = sal.organizer_id
         ${where}
         ORDER BY sal.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
    );

    const countRes = await pool.query(
        `SELECT COUNT(*) FROM suspicious_activity_logs sal ${where}`,
        params
    );

    return { logs: res.rows, total: parseInt(countRes.rows[0].count) };
}

/**
 * Get aggregated statistics for the Organizer or Super Admin dashboard
 */
async function getAntiCheatStats(organizerId = null) {
    let where = '';
    const params = [];
    if (organizerId) {
        where = 'WHERE organizer_id = $1';
        params.push(organizerId);
    }

    const res = await pool.query(
        `SELECT
            COUNT(*)::int AS total_flagged,
            COUNT(CASE WHEN risk_score >= 8 THEN 1 END)::int AS critical_risk_count,
            COUNT(CASE WHEN risk_score >= 5 AND risk_score < 8 THEN 1 END)::int AS high_risk_count,
            COUNT(CASE WHEN reviewed = FALSE THEN 1 END)::int AS pending_reviews,
            COUNT(CASE WHEN reviewed = TRUE THEN 1 END)::int AS resolved_reviews,
            COUNT(DISTINCT student_id)::int AS flagged_players_count,
            COUNT(DISTINCT room_id)::int AS flagged_battles_count
         FROM suspicious_activity_logs
         ${where}`,
        params
    );

    return res.rows[0];
}

/**
 * Mark a suspicious activity log as reviewed with resolution action
 */
async function markReviewed({ logId, reviewNote, resolutionAction, reviewerTeacherId }) {
    await pool.query(
        `UPDATE suspicious_activity_logs
         SET reviewed = TRUE, review_note = $1, resolution_action = $2, reviewed_by = $3
         WHERE id = $4`,
        [reviewNote || null, resolutionAction || 'cleared', reviewerTeacherId || null, logId]
    );
}

module.exports = {
    antiCheatMonitor,
    getSuspiciousLogs,
    getAntiCheatStats,
    markReviewed,
};

