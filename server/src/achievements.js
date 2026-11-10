/**
 * achievements.js — Achievement Engine
 *
 * Awards badges automatically based on game results.
 * All awards happen server-side after verified results.
 * Never trusts client-sent data.
 */

const { pool } = require('../db');

/**
 * Check and award achievements for a student after a battle ends.
 * @param {object} opts
 * @param {number} opts.studentId
 * @param {number} opts.roomId
 * @param {object} opts.playerData   - in-memory player object from GameRoom
 * @param {object} opts.resultData   - { rank, total, accuracy, correct, attempted, fastest_ms }
 * @param {boolean} opts.isMvp
 * @param {object} opts.room         - GameRoom instance
 * @returns {Promise<string[]>}      - Array of newly awarded achievement codes
 */
async function checkAndAwardAchievements({ studentId, roomId, playerData, resultData, isMvp, room }) {
    if (!studentId) return [];

    const client = await pool.connect();
    const awardedCodes = [];

    try {
        await client.query('BEGIN');

        // 1. Fetch all active achievement definitions
        const defRes = await client.query(
            'SELECT * FROM achievement_definitions WHERE is_active = TRUE'
        );
        const definitions = defRes.rows;

        // 2. Fetch already earned achievements for this student
        const earnedRes = await client.query(
            'SELECT achievement_id FROM player_achievements WHERE student_id = $1',
            [studentId]
        );
        const earnedIds = new Set(earnedRes.rows.map(r => r.achievement_id));

        // 3. Load or create player profile stats
        await client.query(
            `INSERT INTO player_profiles (student_id) VALUES ($1)
             ON CONFLICT (student_id) DO NOTHING`,
            [studentId]
        );
        const profileRes = await client.query(
            'SELECT * FROM player_profiles WHERE student_id = $1',
            [studentId]
        );
        const profile = profileRes.rows[0];

        // 4. Calculate updated stats
        const isWin = resultData.rank === 1;
        const newBattlesPlayed = profile.battles_played + 1;
        const newBattlesWon = profile.battles_won + (isWin ? 1 : 0);
        const newTotalCorrect = profile.total_correct + (resultData.correct || 0);
        const newTotalAttempted = profile.total_attempted + (resultData.attempted || 0);
        const newMvpCount = profile.mvp_count + (isMvp ? 1 : 0);
        const newFastestMs = Math.min(profile.fastest_answer_ms || 999999, resultData.fastest_ms || 999999);
        const isTeamBattle = room?.settings?.teamMode === true;

        // Current battle max streak from playerData
        const maxStreak = playerData?.maxStreak || playerData?.streak || 0;

        // 5. Evaluate each achievement criteria
        for (const def of definitions) {
            if (earnedIds.has(def.id)) continue; // already earned

            const c = def.criteria;
            let earned = false;

            switch (c.type) {
                case 'battles_played':
                    earned = newBattlesPlayed >= c.threshold;
                    break;

                case 'battles_won':
                    earned = newBattlesWon >= c.threshold;
                    break;

                case 'accuracy':
                    earned = resultData.accuracy >= c.threshold
                        && resultData.attempted >= (c.min_q || 1);
                    break;

                case 'fast_answer_ms':
                    // resultData.fastest_ms is the fastest correct answer this battle
                    earned = (resultData.fastest_ms > 0) && (resultData.fastest_ms <= c.threshold);
                    break;

                case 'team_battles': {
                    // Count team battles from DB
                    const tbRes = await client.query(
                        `SELECT COUNT(*) FROM results res
                         JOIN rooms r ON r.id = res.room_id
                         JOIN room_players rp ON rp.id = res.player_id
                         WHERE rp.student_id = $1 AND r.battle_type = 'team_battle'`,
                        [studentId]
                    );
                    const teamBattleCount = parseInt(tbRes.rows[0].count) + (isTeamBattle ? 1 : 0);
                    earned = teamBattleCount >= c.threshold;
                    break;
                }

                case 'mvp':
                    earned = isMvp;
                    break;

                case 'streak':
                    earned = maxStreak >= c.threshold;
                    break;

                case 'comeback': {
                    // Check if player was in bottom half at mid-game but finished top 3
                    const halfwayRank = playerData?.halfwayRank;
                    const totalPlayers = resultData.totalPlayers || 1;
                    if (halfwayRank && resultData.rank <= 3 && halfwayRank > totalPlayers / 2) {
                        earned = true;
                    }
                    break;
                }

                case 'score_battles': {
                    // Count battles where score >= min_score
                    const sbRes = await client.query(
                        `SELECT COUNT(*) FROM results res
                         JOIN room_players rp ON rp.id = res.player_id
                         WHERE rp.student_id = $1 AND res.total_score >= $2`,
                        [studentId, c.min_score || 100]
                    );
                    const scoreBattleCount = parseInt(sbRes.rows[0].count) +
                        (resultData.total_score >= (c.min_score || 100) ? 1 : 0);
                    earned = scoreBattleCount >= c.threshold;
                    break;
                }

                case 'single_question_score': {
                    // Check if any single answer gave >= threshold points
                    const maxPoints = Math.max(...(playerData?.answers?.map(a => a.points || 0) || [0]));
                    earned = maxPoints >= c.threshold;
                    break;
                }

                default:
                    break;
            }

            if (earned) {
                // Award the achievement
                await client.query(
                    `INSERT INTO player_achievements (student_id, achievement_id, room_id)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (student_id, achievement_id) DO NOTHING`,
                    [studentId, def.id, roomId]
                );

                // Award XP
                if (def.xp_reward > 0) {
                    await client.query(
                        `UPDATE player_profiles SET total_xp = total_xp + $1, updated_at = NOW()
                         WHERE student_id = $2`,
                        [def.xp_reward, studentId]
                    );

                    await client.query(
                        `INSERT INTO reward_transactions (student_id, reward_type, reward_value, reason, room_id)
                         VALUES ($1, 'xp', $2, $3, $4)`,
                        [studentId, JSON.stringify({ amount: def.xp_reward }), `achievement_${def.code}`, roomId]
                    );
                }

                awardedCodes.push(def.code);
            }
        }

        // 6. Update player profile stats
        const newLevel = Math.floor(1 + Math.sqrt(profile.total_xp / 100));
        const totalXpFromAchievements = awardedCodes.reduce((sum, code) => {
            const def = definitions.find(d => d.code === code);
            return sum + (def?.xp_reward || 0);
        }, 0);

        await client.query(
            `UPDATE player_profiles SET
                battles_played = $1,
                battles_won = $2,
                total_correct = $3,
                total_attempted = $4,
                mvp_count = $5,
                fastest_answer_ms = $6,
                total_xp = total_xp + $7,
                updated_at = NOW()
             WHERE student_id = $8`,
            [newBattlesPlayed, newBattlesWon, newTotalCorrect, newTotalAttempted,
             newMvpCount, newFastestMs, totalXpFromAchievements, studentId]
        );

        // Award XP for battle participation
        const battleXp = isWin ? 50 : (isMvp ? 30 : 10);
        await client.query(
            `UPDATE player_profiles SET total_xp = total_xp + $1, updated_at = NOW()
             WHERE student_id = $2`,
            [battleXp, studentId]
        );
        await client.query(
            `INSERT INTO reward_transactions (student_id, reward_type, reward_value, reason, room_id)
             VALUES ($1, 'xp', $2, $3, $4)`,
            [studentId, JSON.stringify({ amount: battleXp }),
             isWin ? 'battle_win' : (isMvp ? 'battle_mvp' : 'battle_participation'), roomId]
        );

        await client.query('COMMIT');
        if (awardedCodes.length > 0) {
            console.log(`[Achievements] Student ${studentId} earned: ${awardedCodes.join(', ')}`);
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Achievements] Error awarding achievements:', err.message);
    } finally {
        client.release();
    }

    return awardedCodes;
}

/**
 * Get student's achievements and profile
 */
async function getStudentAchievements(studentId) {
    if (!studentId) return { achievements: [], profile: { student_id: 0, total_xp: 0, level: 1 } };

    // Auto-sync achievements from any certificates awarded to this student
    try {
        const certRes = await pool.query(
            `SELECT c.category, c.room_id
             FROM certificates c
             WHERE c.student_id = $1 OR (c.student_id IS NULL AND LOWER(c.student_name) = (SELECT LOWER(display_name) FROM students WHERE id = $1 LIMIT 1))`,
            [studentId]
        );

        if (certRes.rows.length > 0) {
            const defs = await pool.query('SELECT * FROM achievement_definitions WHERE is_active = TRUE');
            const defMap = new Map(defs.rows.map(d => [d.code, d]));

            const neededCodes = new Set(['first_battle']);
            for (const row of certRes.rows) {
                const cat = (row.category || '').toLowerCase();
                if (cat.includes('winner') || cat.includes('1st') || cat.includes('first')) neededCodes.add('first_win');
                if (cat.includes('mvp')) neededCodes.add('mvp');
                if (cat.includes('speed')) neededCodes.add('speed_demon');
                if (cat.includes('team')) neededCodes.add('team_player');
                if (cat.includes('quiz') || cat.includes('master')) neededCodes.add('quiz_master');
                if (cat.includes('top') || cat.includes('rank')) neededCodes.add('consistent_scorer');
            }

            for (const code of neededCodes) {
                const def = defMap.get(code);
                if (def) {
                    await pool.query(
                        `INSERT INTO player_achievements (student_id, achievement_id, room_id, is_new)
                         VALUES ($1, $2, $3, FALSE)
                         ON CONFLICT (student_id, achievement_id) DO NOTHING`,
                        [studentId, def.id, certRes.rows[0].room_id || null]
                    );
                }
            }

            // Ensure profile exists and has base XP
            await pool.query(
                `INSERT INTO player_profiles (student_id, total_xp, level)
                 VALUES ($1, 100, 1)
                 ON CONFLICT (student_id) DO UPDATE SET total_xp = GREATEST(player_profiles.total_xp, 100)`,
                [studentId]
            );
        }
    } catch (syncErr) {
        console.error('Error syncing achievements from certificates:', syncErr.message);
    }

    const [achieveRes, profileRes] = await Promise.all([
        pool.query(
            `SELECT pa.*, ad.code, ad.name, ad.description, ad.icon, ad.category, ad.xp_reward,
                    pa.earned_at, pa.is_new
             FROM player_achievements pa
             JOIN achievement_definitions ad ON ad.id = pa.achievement_id
             WHERE pa.student_id = $1
             ORDER BY pa.earned_at DESC`,
            [studentId]
        ),
        pool.query(
            'SELECT * FROM player_profiles WHERE student_id = $1',
            [studentId]
        )
    ]);

    return {
        achievements: achieveRes.rows,
        profile: profileRes.rows[0] || { student_id: studentId, total_xp: 0, level: 1, battles_played: 0 }
    };
}

/**
 * Mark achievements as seen (clear the "new" flag)
 */
async function markAchievementsAsSeen(studentId) {
    await pool.query(
        'UPDATE player_achievements SET is_new = FALSE WHERE student_id = $1',
        [studentId]
    );
}

/**
 * Get all available achievement definitions (for gallery display)
 */
async function getAllAchievementDefinitions() {
    const res = await pool.query(
        'SELECT * FROM achievement_definitions WHERE is_active = TRUE ORDER BY category, xp_reward'
    );
    return res.rows;
}

module.exports = {
    checkAndAwardAchievements,
    getStudentAchievements,
    markAchievementsAsSeen,
    getAllAchievementDefinitions
};

