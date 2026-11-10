/**
 * tournaments.js — Tournament Management Engine
 *
 * Implements tournament creation, team registrations, bracket generation,
 * knockout rounds progression, and final standings.
 */

const express = require('express');
const { pool } = require('../db');
const { requireTeacher, requireStudent } = require('./auth');

const router = express.Router();

// ─── 1. Public Tournament List & Details ───────────────────────────────────────

/**
 * GET /api/tournaments
 * List available tournaments (public or where student is registered)
 */
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT t.*,
                   COUNT(DISTINCT tt.id) AS registered_teams,
                   tchr.display_name AS organizer_name,
                   qs.title AS question_set_title
            FROM tournaments t
            LEFT JOIN tournament_teams tt ON tt.tournament_id = t.id AND tt.status IN ('approved', 'active')
            LEFT JOIN teachers tchr ON tchr.id = t.organizer_teacher_id
            LEFT JOIN question_sets qs ON qs.id = t.question_set_id
        `;
        const params = [];
        if (status) {
            query += ` WHERE t.status = $1`;
            params.push(status);
        }
        query += ` GROUP BY t.id, tchr.display_name, qs.title ORDER BY t.created_at DESC`;

        const result = await pool.query(query, params);
        res.json({ tournaments: result.rows });
    } catch (e) {
        console.error('GET /api/tournaments error:', e.message);
        res.status(500).json({ error: 'Failed to load tournaments' });
    }
});

/**
 * GET /api/tournaments/:id
 * Get complete tournament details including registered teams, rounds, and brackets
 */
router.get('/:id', async (req, res) => {
    try {
        const tourneyId = parseInt(req.params.id);
        const tourneyRes = await pool.query(
            `SELECT t.*, tchr.display_name AS organizer_name, qs.title AS question_set_title
             FROM tournaments t
             LEFT JOIN teachers tchr ON tchr.id = t.organizer_teacher_id
             LEFT JOIN question_sets qs ON qs.id = t.question_set_id
             WHERE t.id = $1`,
            [tourneyId]
        );
        if (tourneyRes.rows.length === 0) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        const tournament = tourneyRes.rows[0];

        // Fetch registered teams with members
        const teamsRes = await pool.query(
            `SELECT tt.*, s.display_name AS captain_name,
                    json_agg(json_build_object('id', st.id, 'displayName', st.display_name)) FILTER (WHERE st.id IS NOT NULL) AS members
             FROM tournament_teams tt
             LEFT JOIN students s ON s.id = tt.captain_student_id
             LEFT JOIN tournament_team_members ttm ON ttm.tournament_team_id = tt.id
             LEFT JOIN students st ON st.id = ttm.student_id
             WHERE tt.tournament_id = $1
             GROUP BY tt.id, s.display_name
             ORDER BY tt.seed ASC NULLS LAST, tt.id ASC`,
            [tourneyId]
        );

        // Fetch rounds and matches
        const roundsRes = await pool.query(
            `SELECT * FROM tournament_rounds WHERE tournament_id = $1 ORDER BY round_number ASC`,
            [tourneyId]
        );

        const matchesRes = await pool.query(
            `SELECT tm.*, 
                    t1.name AS team1_name, t2.name AS team2_name,
                    tw.name AS winner_name,
                    r.code AS room_code
             FROM tournament_matches tm
             LEFT JOIN tournament_teams t1 ON t1.id = tm.team1_id
             LEFT JOIN tournament_teams t2 ON t2.id = tm.team2_id
             LEFT JOIN tournament_teams tw ON tw.id = tm.winner_team_id
             LEFT JOIN rooms r ON r.id = tm.room_id
             WHERE tm.tournament_id = $1
             ORDER BY tm.id ASC`,
            [tourneyId]
        );

        // Fetch podium results if completed
        const resultsRes = await pool.query(
            `SELECT tr.*, 
                    t1.name AS champion_name,
                    t2.name AS runner_up_name,
                    t3.name AS third_place_name,
                    s.display_name AS mvp_name
             FROM tournament_results tr
             LEFT JOIN tournament_teams t1 ON t1.id = tr.champion_team_id
             LEFT JOIN tournament_teams t2 ON t2.id = tr.runner_up_team_id
             LEFT JOIN tournament_teams t3 ON t3.id = tr.third_place_team_id
             LEFT JOIN students s ON s.id = tr.mvp_student_id
             WHERE tr.tournament_id = $1`,
            [tourneyId]
        );

        res.json({
            tournament,
            teams: teamsRes.rows,
            rounds: roundsRes.rows,
            matches: matchesRes.rows,
            podium: resultsRes.rows[0] || null
        });
    } catch (e) {
        console.error('GET /api/tournaments/:id error:', e.message);
        res.status(500).json({ error: 'Failed to load tournament detail' });
    }
});

// ─── 2. Organizer (Teacher) Controls ──────────────────────────────────────────

/**
 * POST /api/tournaments
 * Create a new tournament
 */
router.post('/', requireTeacher, async (req, res) => {
    try {
        const {
            name, description, questionSetId, isPublic, accessCode,
            maxTeams, teamSize, category, difficulty, questionsPerRound, timePerQuestion
        } = req.body;

        if (!name || !questionSetId) {
            return res.status(400).json({ error: 'Name and Question Set are required' });
        }

        const calculatedRounds = Math.ceil(Math.log2(maxTeams || 8));

        const insertRes = await pool.query(
            `INSERT INTO tournaments (
                name, description, organizer_teacher_id, question_set_id,
                is_public, access_code, max_teams, team_size, category, difficulty,
                rounds_count, questions_per_round, time_per_question, status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'registration')
             RETURNING *`,
            [
                name.trim(), description || null, req.teacher.id, questionSetId,
                isPublic !== false, accessCode || null,
                maxTeams || 8, teamSize || 4, category || 'General Aptitude', difficulty || 'mixed',
                calculatedRounds, questionsPerRound || 10, timePerQuestion || 20
            ]
        );

        res.json({ success: true, tournament: insertRes.rows[0] });
    } catch (e) {
        console.error('POST /api/tournaments error:', e.message);
        res.status(500).json({ error: 'Failed to create tournament' });
    }
});

/**
 * POST /api/tournaments/:id/start
 * Generates knockout brackets and starts the tournament
 */
router.post('/:id/start', requireTeacher, async (req, res) => {
    const client = await pool.connect();
    try {
        const tourneyId = parseInt(req.params.id);

        // Check ownership
        const tRes = await client.query('SELECT * FROM tournaments WHERE id = $1 AND organizer_teacher_id = $2', [tourneyId, req.teacher.id]);
        if (tRes.rows.length === 0) return res.status(403).json({ error: 'Not authorized or tournament not found' });
        const tourney = tRes.rows[0];

        if (tourney.status !== 'registration') {
            return res.status(400).json({ error: 'Tournament already started or finished' });
        }

        // Get approved teams
        const teamsRes = await client.query(
            `SELECT * FROM tournament_teams WHERE tournament_id = $1 AND status = 'approved' ORDER BY id ASC`,
            [tourneyId]
        );
        const teams = teamsRes.rows;

        if (teams.length < 2) {
            return res.status(400).json({ error: 'At least 2 approved teams are required to start the tournament' });
        }

        await client.query('BEGIN');

        // Update tournament status
        await client.query(
            `UPDATE tournaments SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
            [tourneyId]
        );

        // Generate Rounds and Knockout Brackets
        // Calculate nearest power of 2
        let bracketSize = 2;
        while (bracketSize < teams.length) {
            bracketSize *= 2;
        }

        const totalRounds = Math.log2(bracketSize);

        // Create Round 1 through Final
        const roundIds = [];
        for (let r = 1; r <= totalRounds; r++) {
            let roundName = `Round ${r}`;
            if (r === totalRounds) roundName = 'Final';
            else if (r === totalRounds - 1) roundName = 'Semi-Final';
            else if (r === totalRounds - 2) roundName = 'Quarter-Final';

            const rInsert = await client.query(
                `INSERT INTO tournament_rounds (tournament_id, round_number, name, status)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [tourneyId, r, roundName, r === 1 ? 'active' : 'pending']
            );
            roundIds.push({ roundNum: r, id: rInsert.rows[0].id });
        }

        // Pair teams for Round 1
        const numMatchesR1 = bracketSize / 2;
        const matchesCreated = [];

        for (let i = 0; i < numMatchesR1; i++) {
            const team1 = teams[i * 2] || null;
            const team2 = teams[i * 2 + 1] || null;

            // Handle bye if team2 is missing
            const isBye = team1 && !team2;
            const winnerId = isBye ? team1.id : null;
            const matchStatus = isBye ? 'completed' : 'scheduled';

            const mInsert = await client.query(
                `INSERT INTO tournament_matches (
                    tournament_id, round_id, match_number, team1_id, team2_id,
                    winner_team_id, is_bye, status
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [
                    tourneyId, roundIds[0].id, i + 1,
                    team1 ? team1.id : null,
                    team2 ? team2.id : null,
                    winnerId, isBye, matchStatus
                ]
            );
            matchesCreated.push(mInsert.rows[0].id);
        }

        // Pre-create match slots for subsequent rounds
        let prevRoundMatches = matchesCreated;
        for (let r = 1; r < totalRounds; r++) {
            const currentRoundMatches = [];
            const numMatchesThisRound = prevRoundMatches.length / 2;

            for (let m = 0; m < numMatchesThisRound; m++) {
                const nextInsert = await client.query(
                    `INSERT INTO tournament_matches (
                        tournament_id, round_id, match_number, status
                     ) VALUES ($1, $2, $3, 'scheduled') RETURNING id`,
                    [tourneyId, roundIds[r].id, m + 1]
                );
                currentRoundMatches.push(nextInsert.rows[0].id);

                // Link previous 2 matches to point to this next_match_id
                const feeder1 = prevRoundMatches[m * 2];
                const feeder2 = prevRoundMatches[m * 2 + 1];

                await client.query(
                    `UPDATE tournament_matches SET next_match_id = $1 WHERE id IN ($2, $3)`,
                    [nextInsert.rows[0].id, feeder1, feeder2]
                );
            }
            prevRoundMatches = currentRoundMatches;
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Tournament started and brackets generated' });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Start tournament error:', e.message);
        res.status(500).json({ error: 'Failed to start tournament' });
    } finally {
        client.release();
    }
});

/**
 * POST /api/tournaments/:id/matches/:matchId/declare-winner
 * Advances match winner to next bracket round and declares podium if Final
 */
router.post('/:id/matches/:matchId/declare-winner', requireTeacher, async (req, res) => {
    const client = await pool.connect();
    try {
        const tourneyId = parseInt(req.params.id);
        const matchId = parseInt(req.params.matchId);
        const { winnerTeamId, team1Score, team2Score } = req.body;

        if (!winnerTeamId) return res.status(400).json({ error: 'winnerTeamId is required' });

        await client.query('BEGIN');

        // Update match status and scores
        const matchRes = await client.query(
            `UPDATE tournament_matches
             SET winner_team_id = $1, team1_score = $2, team2_score = $3, status = 'completed'
             WHERE id = $4 AND tournament_id = $5
             RETURNING *`,
            [winnerTeamId, team1Score || 0, team2Score || 0, matchId, tourneyId]
        );
        if (matchRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Match not found' });
        }
        const match = matchRes.rows[0];

        // Check if there is a next match in the bracket
        if (match.next_match_id) {
            const nextMatchRes = await client.query('SELECT * FROM tournament_matches WHERE id = $1', [match.next_match_id]);
            const nextMatch = nextMatchRes.rows[0];

            if (!nextMatch.team1_id) {
                await client.query('UPDATE tournament_matches SET team1_id = $1 WHERE id = $2', [winnerTeamId, match.next_match_id]);
            } else if (!nextMatch.team2_id) {
                await client.query('UPDATE tournament_matches SET team2_id = $1 WHERE id = $2', [winnerTeamId, match.next_match_id]);
            }
        } else {
            // This was the FINAL match! Declare Champion & Runner-up
            const runnerUpId = match.team1_id === winnerTeamId ? match.team2_id : match.team1_id;

            await client.query(
                `INSERT INTO tournament_results (tournament_id, champion_team_id, runner_up_team_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (tournament_id) DO UPDATE SET champion_team_id = $2, runner_up_team_id = $3`,
                [tourneyId, winnerTeamId, runnerUpId]
            );

            await client.query(
                `UPDATE tournaments SET status = 'completed', completed_at = NOW() WHERE id = $1`,
                [tourneyId]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Declare winner error:', e.message);
        res.status(500).json({ error: 'Failed to declare match winner' });
    } finally {
        client.release();
    }
});

// ─── 3. Student Registration ──────────────────────────────────────────────────

/**
 * POST /api/tournaments/:id/register
 * Student registers a team for the tournament
 */
router.post('/:id/register', requireStudent, async (req, res) => {
    const client = await pool.connect();
    try {
        const tourneyId = parseInt(req.params.id);
        const { teamName, memberEmails = [] } = req.body;

        if (!teamName || !teamName.trim()) {
            return res.status(400).json({ error: 'Team name is required' });
        }

        await client.query('BEGIN');

        // Check tournament status and capacity
        const tRes = await client.query('SELECT * FROM tournaments WHERE id = $1', [tourneyId]);
        if (tRes.rows.length === 0) return res.status(404).json({ error: 'Tournament not found' });
        const tourney = tRes.rows[0];

        if (tourney.status !== 'registration') {
            return res.status(400).json({ error: 'Registration is closed for this tournament' });
        }

        const countRes = await client.query(
            `SELECT COUNT(*) FROM tournament_teams WHERE tournament_id = $1 AND status != 'rejected'`,
            [tourneyId]
        );
        if (parseInt(countRes.rows[0].count) >= tourney.max_teams) {
            return res.status(400).json({ error: 'Tournament is full' });
        }

        // Check if student is already in a team for this tournament
        const existingMember = await client.query(
            `SELECT ttm.id FROM tournament_team_members ttm
             JOIN tournament_teams tt ON tt.id = ttm.tournament_team_id
             WHERE tt.tournament_id = $1 AND ttm.student_id = $2`,
            [tourneyId, req.student.id]
        );
        if (existingMember.rows.length > 0) {
            return res.status(400).json({ error: 'You are already registered in a team for this tournament' });
        }

        // Insert Team
        const teamInsert = await client.query(
            `INSERT INTO tournament_teams (tournament_id, name, captain_student_id, status)
             VALUES ($1, $2, $3, 'approved') RETURNING *`,
            [tourneyId, teamName.trim(), req.student.id]
        );
        const newTeam = teamInsert.rows[0];

        // Add Captain as member
        await client.query(
            `INSERT INTO tournament_team_members (tournament_team_id, student_id)
             VALUES ($1, $2)`,
            [newTeam.id, req.student.id]
        );

        // Add additional invited member students by email
        for (const email of memberEmails) {
            if (email.trim() && email.trim() !== req.student.email) {
                const sRes = await client.query('SELECT id FROM students WHERE email = $1', [email.trim()]);
                if (sRes.rows.length > 0) {
                    await client.query(
                        `INSERT INTO tournament_team_members (tournament_team_id, student_id)
                         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [newTeam.id, sRes.rows[0].id]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, team: newTeam });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Register tournament error:', e.message);
        res.status(500).json({ error: e.message.includes('unique') ? 'Team name already taken in this tournament' : 'Failed to register team' });
    } finally {
        client.release();
    }
});

module.exports = router;

