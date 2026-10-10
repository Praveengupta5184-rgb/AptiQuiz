/**
 * Persistence — saves completed game results to PostgreSQL.
 *
 * All writes occur inside a single transaction. If any step fails,
 * the entire transaction is rolled back and the error is re-thrown.
 * The caller (SocketHandler.handleGameFinished) logs the error but does
 * NOT crash the server — the in-memory leaderboard is still valid.
 *
 * NOTE on server restarts:
 *   Active rooms exist only in process memory. If the server restarts mid-game,
 *   in-memory state is lost. The room record in the DB will remain with status
 *   'lobby' or 'active'. On next startup, stale rooms are marked 'interrupted'.
 *   Completed results (already persisted) survive server restarts.
 */

const { pool: defaultPool } = require('../../db');

/**
 * Persist final results for a finished GameRoom.
 * @param {GameRoom} room
 * @param {pg.Pool} [dbPool] — injectable for testing
 */
async function persistGameResults(room, dbPool) {
    const db = dbPool || defaultPool;
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        // Mark room finished
        await client.query(
            "UPDATE rooms SET status = 'finished' WHERE id = $1",
            [room.roomId]
        );

        // Sort players to assign ranks
        const playerEntries = Array.from(room.players.entries()); // [token, playerData]
        playerEntries.sort(([, a], [, b]) =>
            b.score - a.score || a.displayName.localeCompare(b.displayName)
        );

        let rank = 1;
        for (const [tokenHash, p] of playerEntries) {
            if (p.answers.length === 0) continue; // skip observers / joined-but-quit

            // Look up DB player id by session token
            const playerRes = await client.query(
                'SELECT id FROM room_players WHERE session_token_hash = $1 AND room_id = $2',
                [tokenHash, room.roomId]
            );
            if (playerRes.rows.length === 0) {
                rank++;
                continue; // player was never persisted (e.g. joined after DB insert)
            }
            const playerId = playerRes.rows[0].id;

            const attempted = p.answers.length;
            const correct = p.answers.filter(a => a.isCorrect).length;
            const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

            const correctAnswers = p.answers.filter(a => a.isCorrect && a.elapsed >= 0);
            const fastest = correctAnswers.length > 0
                ? Math.min(...correctAnswers.map(a => a.elapsed))
                : 0;
            const totalTime = p.answers.reduce((sum, a) => sum + (a.elapsed || 0), 0);
            const avgResponseTime = attempted > 0 ? Math.round(totalTime / attempted) : 0;

            // Topic breakdown
            const topicStats = {};
            for (const a of p.answers) {
                const q = room.questions[a.qIndex];
                const topic = q?.topic || 'General';
                if (!topicStats[topic]) topicStats[topic] = { attempted: 0, correct: 0 };
                topicStats[topic].attempted++;
                if (a.isCorrect) topicStats[topic].correct++;
            }

            // Update player score in room_players
            await client.query(
                'UPDATE room_players SET score = $1, streak = $2 WHERE id = $3',
                [p.score, p.streak, playerId]
            );

            // Upsert result
            await client.query(
                `INSERT INTO results
                   (room_id, player_id, total_score, rank, accuracy_percent, attempted, correct,
                    avg_response_time_ms, fastest_answer_ms, topic_stats)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 ON CONFLICT (player_id, room_id) DO UPDATE SET
                   total_score = EXCLUDED.total_score,
                   rank = EXCLUDED.rank,
                   accuracy_percent = EXCLUDED.accuracy_percent,
                   attempted = EXCLUDED.attempted,
                   correct = EXCLUDED.correct,
                   avg_response_time_ms = EXCLUDED.avg_response_time_ms,
                   fastest_answer_ms = EXCLUDED.fastest_answer_ms,
                   topic_stats = EXCLUDED.topic_stats`,
                [room.roomId, playerId, p.score, rank, accuracy, attempted, correct,
                    avgResponseTime, fastest, JSON.stringify(topicStats)]
            );

            rank++;
        }

        await client.query('COMMIT');
        console.log(`[Room ${room.code}] Results persisted for ${rank - 1} player(s).`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err; // re-throw so caller can log
    } finally {
        client.release();
    }
}

/**
 * On server startup: mark any rooms still showing 'active' status as 'interrupted'.
 * This is honest — we cannot pretend an in-memory game resumed.
 */
async function markInterruptedRooms(dbPool) {
    const db = dbPool || defaultPool;
    const result = await db.query(
        "UPDATE rooms SET status = 'interrupted' WHERE status = 'active' RETURNING code"
    );
    if (result.rowCount > 0) {
        console.warn(
            `[Startup] Marked ${result.rowCount} room(s) as 'interrupted' from previous crash:`,
            result.rows.map(r => r.code).join(', ')
        );
    }
}

module.exports = { persistGameResults, markInterruptedRooms };
