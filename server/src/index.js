/**
 * AptiQuiz Server Entry Point
 *
 * Startup order:
 *  1. Connect to PostgreSQL (fail fast after retries)
 *  2. Mark any 'active' rooms from a previous crash as 'interrupted'
 *  3. Register HTTP routes
 *  4. Attach Socket.IO
 *  5. Listen
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');

const app = require('./app');
const { pool } = require('../db');
const { router: authRouter, requireTeacher, requireSuperAdmin, requireStudent } = require('./auth');
const SocketHandler = require('./game/SocketHandler');
const { markInterruptedRooms } = require('./game/Persistence');
const { getStudentAchievements, markAchievementsAsSeen, getAllAchievementDefinitions } = require('./achievements');
const { getSuspiciousLogs, getAntiCheatStats, markReviewed } = require('./antiCheat');

const TEAM_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const port = process.env.PORT || 3005;
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : '*';

const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    // Support both polling and websocket for Render compatibility
    transports: ['polling', 'websocket'],
    // Limit payload size to prevent memory exhaustion
    maxHttpBufferSize: 1e5, // 100 KB
});

const socketHandler = new SocketHandler(io);

io.on('connection', (socket) => {
    socketHandler.handleConnection(socket);
});

// ─── Static files (production) ────────────────────────────────────────────────

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/tournaments', require('./tournaments'));
app.use('/api/certificates', require('./certificates'));

// ─── Test (question set) routes ───────────────────────────────────────────────

app.get('/api/teacher/dashboard', requireTeacher, async (req, res) => {
    try {
        const testsRes = await pool.query(
            `SELECT qs.id, qs.title, qs.description, qs.created_at,
                    COUNT(q.id)::int AS question_count
             FROM question_sets qs
             LEFT JOIN questions q ON q.question_set_id = qs.id
             WHERE qs.teacher_id = $1
             GROUP BY qs.id
             ORDER BY qs.created_at DESC`,
            [req.teacher.id]
        );

        const roomsRes = await pool.query(
            `SELECT r.id, r.code, r.status, r.created_at, qs.title as test_title,
                    (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = r.id) as participant_count
             FROM rooms r
             JOIN question_sets qs ON r.question_set_id = qs.id
             WHERE qs.teacher_id = $1
             ORDER BY r.created_at DESC
             LIMIT 20`,
            [req.teacher.id]
        );

        res.json({
            tests: testsRes.rows,
            activeRooms: roomsRes.rows.filter(r => r.status === 'lobby' || r.status === 'active'),
            completedRooms: roomsRes.rows.filter(r => r.status === 'finished')
        });
    } catch (e) {
        console.error('GET /api/teacher/dashboard error:', e.message);
        res.status(500).json({ error: 'Failed to load dashboard' });
    }
});

app.get('/api/teacher/history', requireTeacher, async (req, res) => {
    try {
        const roomsRes = await pool.query(
            `SELECT r.id as room_id, r.code, r.status, r.created_at, qs.title as test_title, qs.description as test_description,
                    (SELECT COUNT(*) FROM results res WHERE res.room_id = r.id) as participant_count,
                    (SELECT MAX(total_score) FROM results res WHERE res.room_id = r.id) as highest_score,
                    (SELECT AVG(total_score) FROM results res WHERE res.room_id = r.id) as avg_score
             FROM rooms r
             JOIN question_sets qs ON r.question_set_id = qs.id
             WHERE r.teacher_id = $1 AND r.status = 'finished'
             ORDER BY r.created_at DESC`,
            [req.teacher.id]
        );
        res.json(roomsRes.rows);
    } catch (e) {
        console.error('GET /api/teacher/history error:', e.message);
        res.status(500).json({ error: 'Failed to load test history' });
    }
});

app.get('/api/teacher/results/:roomId', requireTeacher, async (req, res) => {
    try {
        const roomId = req.params.roomId;
        // Verify room belongs to teacher
        const roomCheck = await pool.query(
            `SELECT r.id, qs.title as test_title, r.created_at, r.code 
             FROM rooms r JOIN question_sets qs ON r.question_set_id = qs.id
             WHERE r.id = $1 AND r.teacher_id = $2`,
            [roomId, req.teacher.id]
        );
        if (roomCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found or unauthorized' });
        }
        
        const roomData = roomCheck.rows[0];

        // Fetch leaderboard
        const lbResult = await pool.query(
            `SELECT r.id, r.total_score, r.rank, r.accuracy_percent, r.correct, r.attempted, r.avg_response_time_ms,
                    rp.display_name, r.student_id, r.player_id, t.name as team_name, t.color as team_color
             FROM results r
             JOIN room_players rp ON r.player_id = rp.id
             LEFT JOIN teams t ON rp.team_id = t.id
             WHERE r.room_id = $1
             ORDER BY r.rank ASC`,
            [roomId]
        );
        
        const leaderboard = lbResult.rows;
        
        // Stats
        const totalParticipants = leaderboard.length;
        const highestScore = totalParticipants > 0 ? leaderboard[0].total_score : 0;
        const avgScore = totalParticipants > 0 ? leaderboard.reduce((sum, r) => sum + r.total_score, 0) / totalParticipants : 0;
        const avgAccuracy = totalParticipants > 0 ? leaderboard.reduce((sum, r) => sum + Number(r.accuracy_percent), 0) / totalParticipants : 0;
        
        // Question stats
        const qStats = await pool.query(
            `SELECT q.text as question_text, q.topic, gq.order_index,
                    COUNT(a.id) as answers_count,
                    SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END)::int as correct_count,
                    AVG(a.compensated_elapsed_ms) as avg_time
             FROM game_questions gq
             JOIN questions q ON gq.question_id = q.id
             LEFT JOIN answers a ON a.game_question_id = gq.id
             WHERE gq.room_id = $1
             GROUP BY q.id, gq.order_index
             ORDER BY gq.order_index ASC`,
            [roomId]
        );

        res.json({
            room: roomData,
            stats: {
                totalParticipants,
                highestScore,
                avgScore: Math.round(avgScore),
                avgAccuracy: Math.round(avgAccuracy)
            },
            leaderboard,
            questionStats: qStats.rows
        });
    } catch (e) {
        console.error('GET /api/teacher/results/:roomId error:', e.message);
        res.status(500).json({ error: 'Failed to load test results' });
    }
});

// ─── Get Room Teams (for certificate issuance) ──────────────────────────────
app.get('/api/teacher/room/:roomId/teams', requireTeacher, async (req, res) => {
    try {
        const roomId = req.params.roomId;
        // Verify room belongs to teacher
        const roomCheck = await pool.query(
            `SELECT id FROM rooms WHERE id = $1 AND teacher_id = $2`,
            [roomId, req.teacher.id]
        );
        if (roomCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found or unauthorized' });
        }

        const teamsRes = await pool.query(
            `SELECT t.*, 
                    (SELECT COUNT(*) FROM room_players rp WHERE rp.team_id = t.id) as member_count
             FROM teams t
             WHERE t.room_id = $1
             ORDER BY t.id`,
            [roomId]
        );

        res.json({ teams: teamsRes.rows });
    } catch (e) {
        console.error('GET /api/teacher/room/:roomId/teams error:', e.message);
        res.status(500).json({ error: 'Failed to load teams' });
    }
});

// ─── Get Room Students (for certificate issuance) ────────────────────────────
app.get('/api/teacher/room/:roomId/students', requireTeacher, async (req, res) => {
    try {
        const roomId = req.params.roomId;
        // Verify room belongs to teacher
        const roomCheck = await pool.query(
            `SELECT id FROM rooms WHERE id = $1 AND teacher_id = $2`,
            [roomId, req.teacher.id]
        );
        if (roomCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found or unauthorized' });
        }

        const studentsRes = await pool.query(
            `SELECT rp.id, rp.display_name, rp.student_id, rp.team_id, t.name as team_name,
                    COALESCE(r.total_score, 0) as total_score, r.rank as individual_rank
             FROM room_players rp
             LEFT JOIN teams t ON rp.team_id = t.id
             LEFT JOIN results r ON r.player_id = rp.id AND r.room_id = $1
             WHERE rp.room_id = $1 AND rp.display_name != 'Host'
             ORDER BY r.rank ASC NULLS LAST, rp.display_name ASC`,
            [roomId]
        );

        res.json({ students: studentsRes.rows });
    } catch (e) {
        console.error('GET /api/teacher/room/:roomId/students error:', e.message);
        res.status(500).json({ error: 'Failed to load students' });
    }
});

app.get('/api/tests', requireTeacher, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT qs.id, qs.title, qs.description, qs.created_at,
                    COUNT(q.id)::int AS question_count
             FROM question_sets qs
             LEFT JOIN questions q ON q.question_set_id = qs.id
             WHERE qs.teacher_id = $1
             GROUP BY qs.id
             ORDER BY qs.created_at DESC`,
            [req.teacher.id]
        );
        res.json(result.rows);
    } catch (e) {
        console.error('GET /api/tests error:', e.message);
        res.status(500).json({ error: 'Failed to load tests' });
    }
});


// ─── Student (Account) routes ────────────────────────────────────────────────

app.get('/api/student/results', requireStudent, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.total_score, r.rank, r.accuracy_percent, r.created_at, r.correct, r.attempted,
                    qs.title as test_title, qs.description as test_description, rm.code as room_code, rm.id as room_id,
                    (SELECT COUNT(*) FROM results r2 WHERE r2.room_id = r.room_id) as total_participants,
                    (SELECT COUNT(*) FROM questions q WHERE q.question_set_id = qs.id) as total_questions
             FROM results r
             JOIN rooms rm ON r.room_id = rm.id
             JOIN question_sets qs ON rm.question_set_id = qs.id
             WHERE r.student_id = $1
             ORDER BY r.created_at DESC`,
            [req.student.id]
        );
        res.json(result.rows);
    } catch (e) {
        console.error('GET /api/student/results error:', e.message);
        res.status(500).json({ error: 'Failed to load student results' });
    }
});

app.get('/api/student/results/:id', requireStudent, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.total_score, r.rank, r.accuracy_percent, r.attempted, r.correct,
                    r.avg_response_time_ms, r.topic_stats, r.created_at, r.room_id,
                    qs.title as test_title, qs.description as test_description, rm.code as room_code,
                    (SELECT COUNT(*) FROM questions q WHERE q.question_set_id = qs.id) as total_questions
             FROM results r
             JOIN rooms rm ON r.room_id = rm.id
             JOIN question_sets qs ON rm.question_set_id = qs.id
             WHERE r.id = $1 AND r.student_id = $2`,
            [req.params.id, req.student.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Result not found or unauthorized' });
        }
        
        const myResult = result.rows[0];
        
        // Fetch all results for this room to generate leaderboard and stats
        const lbResult = await pool.query(
            `SELECT r.id, r.total_score, r.rank, r.accuracy_percent, r.correct, r.attempted, 
                    rp.display_name, r.student_id
             FROM results r
             JOIN room_players rp ON r.player_id = rp.id
             WHERE r.room_id = $1
             ORDER BY r.rank ASC`,
            [myResult.room_id]
        );
        
        const leaderboard = lbResult.rows;
        
        // Calculate room stats
        const totalParticipants = leaderboard.length;
        const highestScore = totalParticipants > 0 ? leaderboard[0].total_score : 0;
        const avgScore = totalParticipants > 0 ? leaderboard.reduce((sum, r) => sum + r.total_score, 0) / totalParticipants : 0;
        
        res.json({
            ...myResult,
            leaderboard,
            stats: {
                totalParticipants,
                highestScore,
                avgScore: Math.round(avgScore),
                diffFromHighest: highestScore - myResult.total_score,
                diffFromAvg: Math.round(myResult.total_score - avgScore)
            }
        });
    } catch (e) {
        console.error('GET /api/student/results/:id error:', e.message);
        res.status(500).json({ error: 'Failed to load detailed result' });
    }
});

app.post('/api/tests', requireTeacher, async (req, res) => {
    const client = await pool.connect();
    try {
        const { title, description, questions } = req.body;

        if (!title || typeof title !== 'string' || !title.trim()) {
            return res.status(400).json({ error: 'Test title is required' });
        }
        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'At least one question is required' });
        }
        if (questions.length > 200) {
            return res.status(400).json({ error: 'Maximum 200 questions allowed per test' });
        }

        // Validate each question
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            if (!q.text || !q.text.trim()) {
                return res.status(400).json({ error: `Question ${i + 1}: text is required` });
            }
            if (!Array.isArray(q.options) || q.options.length < 2) {
                return res.status(400).json({ error: `Question ${i + 1}: at least 2 options required` });
            }
            if (q.options.some(o => !o || !o.trim())) {
                return res.status(400).json({ error: `Question ${i + 1}: all options must be non-empty` });
            }
            const unique = new Set(q.options.map(o => o.trim().toLowerCase()));
            if (unique.size !== q.options.length) {
                return res.status(400).json({ error: `Question ${i + 1}: duplicate options are not allowed` });
            }
            if (q.correctOptionIndex == null || q.correctOptionIndex < 0 || q.correctOptionIndex >= q.options.length) {
                return res.status(400).json({ error: `Question ${i + 1}: valid correct option index is required` });
            }
        }

        await client.query('BEGIN');

        const qsRes = await client.query(
            'INSERT INTO question_sets (title, description, teacher_id) VALUES ($1, $2, $3) RETURNING id',
            [title.trim(), description?.trim() || null, req.teacher.id]
        );
        const questionSetId = qsRes.rows[0].id;

        for (const q of questions) {
            await client.query(
                `INSERT INTO questions
                   (question_set_id, topic, difficulty, text, options, correct_option_index, explanation, time_limit)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    questionSetId,
                    q.topic?.trim() || 'General',
                    q.difficulty || 'medium',
                    q.text.trim(),
                    JSON.stringify(q.options.map(o => o.trim())),
                    q.correctOptionIndex,
                    q.explanation?.trim() || '',
                    q.timeLimit || 20,
                ]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, id: questionSetId });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('POST /api/tests error:', e.message);
        res.status(500).json({ error: 'Failed to save test' });
    } finally {
        client.release();
    }
});

const multer = require('multer');
const { extractQuestionsFromPdf } = require('./utils/pdfParser');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

app.post('/api/tests/parse-pdf', requireTeacher, upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file provided.' });
        }
        if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
            return res.status(400).json({ error: 'Uploaded file is not a valid PDF.' });
        }

        const questions = await extractQuestionsFromPdf(req.file.buffer);
        res.json({ questions });
    } catch (e) {
        if (e.message === 'SCANNED_PDF') {
            return res.status(400).json({ error: 'This appears to be a scanned or image-based PDF. OCR processing is not yet implemented. Please upload a text-based PDF.' });
        }
        console.error('PDF parsing error:', e);
        res.status(500).json({ error: 'Failed to process the PDF file.' });
    }
});

app.get('/api/tests/:id', requireTeacher, async (req, res) => {
    try {
        const qsRes = await pool.query(
            'SELECT * FROM question_sets WHERE id = $1 AND teacher_id = $2',
            [req.params.id, req.teacher.id]
        );
        if (qsRes.rows.length === 0) return res.status(404).json({ error: 'Test not found' });

        const qRes = await pool.query(
            'SELECT * FROM questions WHERE question_set_id = $1 ORDER BY id',
            [req.params.id]
        );

        res.json({ ...qsRes.rows[0], questions: qRes.rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load test' });
    }
});

// Teacher Analytics endpoint
app.get('/api/tests/:id/analytics', requireTeacher, async (req, res) => {
    try {
        const testId = parseInt(req.params.id, 10);
        // Verify ownership
        const testRes = await pool.query('SELECT id FROM question_sets WHERE id = $1 AND teacher_id = $2', [testId, req.teacher.id]);
        if (testRes.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

        // Get all results for all rooms that ran this test
        const results = await pool.query(
            `SELECT r.total_score, r.accuracy_percent, r.attempted, r.correct, r.avg_response_time_ms, r.topic_stats,
                    p.display_name, rm.created_at as run_date
             FROM results r
             JOIN room_players p ON r.player_id = p.id
             JOIN rooms rm ON r.room_id = rm.id
             WHERE rm.question_set_id = $1
             ORDER BY rm.created_at DESC, r.total_score DESC`,
            [testId]
        );
        res.json(results.rows);
    } catch (e) {
        console.error('GET /api/tests/:id/analytics error:', e.message);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

app.get('/api/tests/:id/question-analytics', requireTeacher, async (req, res) => {
    try {
        const testId = parseInt(req.params.id, 10);
        const testRes = await pool.query('SELECT id FROM question_sets WHERE id = $1 AND teacher_id = $2', [testId, req.teacher.id]);
        if (testRes.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

        const results = await pool.query(
            `SELECT 
                q.id,
                q.text AS question_text,
                q.topic,
                q.difficulty,
                COUNT(a.id) AS total_answers,
                SUM(CASE WHEN a.is_correct THEN 1 ELSE 0 END) AS correct_answers,
                SUM(CASE WHEN NOT a.is_correct AND a.chosen_option_index >= 0 THEN 1 ELSE 0 END) AS incorrect_answers,
                SUM(CASE WHEN a.chosen_option_index < 0 THEN 1 ELSE 0 END) AS timeouts,
                ROUND(AVG(a.compensated_elapsed_ms)) AS avg_response_time_ms
            FROM game_questions gq
            JOIN questions q ON gq.question_id = q.id
            JOIN rooms rm ON gq.room_id = rm.id
            LEFT JOIN answers a ON a.game_question_id = gq.id
            WHERE rm.question_set_id = $1
            GROUP BY q.id
            ORDER BY incorrect_answers DESC`,
            [testId]
        );
        res.json(results.rows);
    } catch (e) {
        console.error('GET /api/tests/:id/question-analytics error:', e.message);
        res.status(500).json({ error: 'Failed to fetch question analytics' });
    }
});

// ─── Public Battle Lobby ────────────────────────────────────────────────────────

app.get('/api/battles/public', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.code, r.battle_name, r.status, r.created_at, r.settings, r.is_public,
                    qs.title as test_title, qs.description as test_description,
                    (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = r.id AND rp.display_name != 'Host') as participant_count,
                    (SELECT COUNT(*) FROM teams t WHERE t.room_id = r.id) as team_count
             FROM rooms r
             JOIN question_sets qs ON r.question_set_id = qs.id
             WHERE r.is_public = TRUE 
             AND r.status IN ('lobby', 'active')
             AND (r.expires_at IS NULL OR r.expires_at > NOW())
             AND (r.battle_type = 'team_battle' OR (r.settings->>'teamMode')::boolean = true)
             ORDER BY r.created_at DESC
             LIMIT 50`
        );
        res.json({ battles: result.rows });
    } catch (e) {
        console.error('GET /api/battles/public error:', e.message);
        res.status(500).json({ error: 'Failed to load public battles' });
    }
});

// Get battle details (for joining)
app.get('/api/battles/:code', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const roomRes = await pool.query(
            `SELECT r.*, qs.title as test_title, qs.description as test_description
             FROM rooms r
             JOIN question_sets qs ON r.question_set_id = qs.id
             WHERE r.code = $1`,
            [code]
        );
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ error: 'Battle not found' });
        }
        const room = roomRes.rows[0];

        // Get teams
        const teamsRes = await pool.query(
            `SELECT t.*, 
                    (SELECT COUNT(*) FROM room_players rp WHERE rp.team_id = t.id) as member_count,
                    (SELECT json_agg(json_build_object('id', rp.id, 'name', rp.display_name, 'ready', rp.is_ready))
                     FROM room_players rp WHERE rp.team_id = t.id) as members
             FROM teams t
             WHERE t.room_id = $1
             ORDER BY t.id`,
            [room.id]
        );

        // Get unassigned players
        const unassignedRes = await pool.query(
            `SELECT id, display_name, is_ready FROM room_players 
             WHERE room_id = $1 AND team_id IS NULL AND display_name != 'Host'
             ORDER BY joined_at`,
            [room.id]
        );

        res.json({
            room,
            teams: teamsRes.rows,
            unassignedPlayers: unassignedRes.rows,
            settings: room.settings
        });
    } catch (e) {
        console.error('GET /api/battles/:code error:', e.message);
        res.status(500).json({ error: 'Failed to load battle details' });
    }
});

// Create battle (teacher only) - supports both private and public
app.post('/api/battles', requireTeacher, async (req, res) => {
    const client = await pool.connect();
    try {
        const { questionSetId, collegeId, settings, isPublic, battleName, teamConfigs } = req.body;

        if (!questionSetId) {
            return res.status(400).json({ error: 'questionSetId is required' });
        }

        // Verify teacher owns the question set
        const ownerCheck = await pool.query(
            'SELECT id FROM question_sets WHERE id = $1 AND teacher_id = $2',
            [questionSetId, req.teacher.id]
        );
        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'You do not own this test' });
        }

        const teamMode = settings?.teamMode ?? true;
        const teamSizeLimit = settings?.teamSizeLimit || 4;
        const teamCount = settings?.teamCount || 2;
        const maxTeams = settings?.maxTeams || 10;
        const minPlayersPerTeam = settings?.minPlayersPerTeam || 1;

        // Validate team configs if provided
        if (teamConfigs && Array.isArray(teamConfigs)) {
            for (const tc of teamConfigs) {
                if (!tc.name || !tc.name.trim()) {
                    return res.status(400).json({ error: 'All teams must have names' });
                }
                if (tc.maxSize && (tc.maxSize < 1 || tc.maxSize > 20)) {
                    return res.status(400).json({ error: 'Team size must be between 1 and 20' });
                }
            }
        }

        await client.query('BEGIN');

        // Generate the host socket token
        const { randomUUID } = require('crypto');
        const hostSocketToken = randomUUID();

        // Generate unique code
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code, attempts = 0;
        do {
            code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            attempts++;
            if (attempts > 100) throw new Error('Could not generate a unique battle code');
        } while (await client.query('SELECT 1 FROM rooms WHERE code = $1', [code]).then(r => r.rowCount > 0));

        // Persist room to DB
        const roomSettings = {
            maxPlayers: settings?.maxPlayers || 100,
            advanceEarly: settings?.advanceEarly ?? true,
            teamMode: true,
            teamSizeLimit,
            teamCount: teamConfigs?.length || teamCount,
            maxTeams,
            minPlayersPerTeam,
            adaptiveDifficulty: settings?.adaptiveDifficulty ?? false,
            timePerQuestion: settings?.timePerQuestion,
        };

        const insertRes = await client.query(
            `INSERT INTO rooms (code, status, question_set_id, college_id, teacher_id, settings, host_token_hash, expires_at, is_public, battle_name, battle_type, max_teams, min_players_per_team)
             VALUES ($1, 'lobby', $2, $3, $4, $5, $6, NOW() + INTERVAL '4 hours', $7, $8, 'team_battle', $9, $10)
             RETURNING id`,
            [code, questionSetId, collegeId || null, req.teacher.id, JSON.stringify(roomSettings), hostSocketToken, 
             isPublic ?? false, battleName || null, maxTeams, minPlayersPerTeam]
        );
        const roomId = insertRes.rows[0].id;

        // Get questions
        const qResult = await client.query(
            'SELECT * FROM questions WHERE question_set_id = $1 ORDER BY id',
            [questionSetId]
        );
        const questions = qResult.rows;

        // Persist game_questions mappings
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await client.query(
                `INSERT INTO game_questions (room_id, question_id, order_index) VALUES ($1, $2, $3)`,
                [roomId, q.id, i]
            );
        }

        // Create teams from configs or auto-generate
        const teamsToCreate = teamConfigs?.length ? teamConfigs : 
            Array.from({ length: teamCount }, (_, i) => ({
                name: `Team ${String.fromCharCode(65 + i)}`,
                maxSize: teamSizeLimit,
                color: TEAM_COLORS[i % TEAM_COLORS.length]
            }));

        const teamColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        for (let i = 0; i < teamsToCreate.length; i++) {
            const tc = teamsToCreate[i];
            await client.query(
                `INSERT INTO teams (room_id, name, score, color) VALUES ($1, $2, 0, $3)`,
                [roomId, tc.name.trim(), tc.color || teamColors[i % teamColors.length]]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({ 
            success: true, 
            code, 
            hostSocketToken,
            roomId,
            isPublic: isPublic ?? false,
            battleName: battleName || null
        });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('POST /api/battles error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// Student create private battle (no teacher auth required)
app.post('/api/student/battles', async (req, res) => {
    const client = await pool.connect();
    try {
        const { questionSetId, battleName, settings, teamConfigs } = req.body;

        if (!questionSetId) {
            return res.status(400).json({ error: 'questionSetId is required' });
        }

        // Verify question set exists and is accessible
        const qsCheck = await pool.query(
            'SELECT id FROM question_sets WHERE id = $1',
            [questionSetId]
        );
        if (qsCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Test not found' });
        }

        const teamMode = settings?.teamMode ?? true;
        const teamSizeLimit = settings?.teamSizeLimit || 4;
        const teamCount = settings?.teamCount || 2;
        const maxTeams = settings?.maxTeams || 10;
        const minPlayersPerTeam = settings?.minPlayersPerTeam || 1;

        // Validate team configs if provided
        if (teamConfigs && Array.isArray(teamConfigs)) {
            for (const tc of teamConfigs) {
                if (!tc.name || !tc.name.trim()) {
                    return res.status(400).json({ error: 'All teams must have names' });
                }
                if (tc.maxSize && (tc.maxSize < 1 || tc.maxSize > 20)) {
                    return res.status(400).json({ error: 'Team size must be between 1 and 20' });
                }
            }
        }

        await client.query('BEGIN');

        // Generate the host socket token
        const { randomUUID } = require('crypto');
        const hostSocketToken = randomUUID();

        // Generate unique code
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code, attempts = 0;
        do {
            code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            attempts++;
            if (attempts > 100) throw new Error('Could not generate a unique battle code');
        } while (await client.query('SELECT 1 FROM rooms WHERE code = $1', [code]).then(r => r.rowCount > 0));

        // Persist room to DB - student created, no teacher_id, private by default
        const roomSettings = {
            maxPlayers: settings?.maxPlayers || 100,
            advanceEarly: settings?.advanceEarly ?? true,
            teamMode: true,
            teamSizeLimit,
            teamCount: teamConfigs?.length || teamCount,
            maxTeams,
            minPlayersPerTeam,
            adaptiveDifficulty: settings?.adaptiveDifficulty ?? false,
            timePerQuestion: settings?.timePerQuestion,
        };

        const insertRes = await client.query(
            `INSERT INTO rooms (code, status, question_set_id, college_id, teacher_id, settings, host_token_hash, expires_at, is_public, battle_name, battle_type, max_teams, min_players_per_team)
             VALUES ($1, 'lobby', $2, $3, $4, $5, $6, NOW() + INTERVAL '4 hours', $7, $8, 'team_battle', $9, $10)
             RETURNING id`,
            [code, questionSetId, null, null, JSON.stringify(roomSettings), hostSocketToken, 
             false, battleName || null, maxTeams, minPlayersPerTeam]
        );
        const roomId = insertRes.rows[0].id;

        // Get questions
        const qResult = await client.query(
            'SELECT * FROM questions WHERE question_set_id = $1 ORDER BY id',
            [questionSetId]
        );
        const questions = qResult.rows;

        // Persist game_questions mappings
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await client.query(
                `INSERT INTO game_questions (room_id, question_id, order_index) VALUES ($1, $2, $3)`,
                [roomId, q.id, i]
            );
        }

        // Create teams from configs or auto-generate
        const teamsToCreate = teamConfigs?.length ? teamConfigs : 
            Array.from({ length: teamCount }, (_, i) => ({
                name: `Team ${String.fromCharCode(65 + i)}`,
                maxSize: teamSizeLimit,
                color: TEAM_COLORS[i % TEAM_COLORS.length]
            }));

        const teamColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
        for (let i = 0; i < teamsToCreate.length; i++) {
            const tc = teamsToCreate[i];
            await client.query(
                `INSERT INTO teams (room_id, name, score, color) VALUES ($1, $2, 0, $3)`,
                [roomId, tc.name.trim(), tc.color || teamColors[i % teamColors.length]]
            );
        }

        await client.query('COMMIT');

        res.status(201).json({ 
            success: true, 
            code, 
            hostSocketToken,
            roomId,
            isPublic: false,
            battleName: battleName || null
        });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('POST /api/student/battles error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// Team management (host only)
app.put('/api/battles/:code/teams', requireTeacher, async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const { teams, assignments } = req.body; // teams: [{id?, name, color}], assignments: {playerId: teamId}

        // Verify ownership
        const roomRes = await pool.query(
            'SELECT id FROM rooms WHERE code = $1 AND teacher_id = $2',
            [code, req.teacher.id]
        );
        if (roomRes.rows.length === 0) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const roomId = roomRes.rows[0].id;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update/create teams
            if (teams && Array.isArray(teams)) {
                for (const team of teams) {
                    if (team.id) {
                        await client.query(
                            'UPDATE teams SET name = $1, color = $2 WHERE id = $3 AND room_id = $4',
                            [team.name, team.color || '#3b82f6', team.id, roomId]
                        );
                    } else {
                        await client.query(
                            'INSERT INTO teams (room_id, name, color) VALUES ($1, $2, $3)',
                            [roomId, team.name, team.color || '#3b82f6']
                        );
                    }
                }
            }

            // Update player team assignments
            if (assignments && typeof assignments === 'object') {
                for (const [playerId, teamId] of Object.entries(assignments)) {
                    await client.query(
                        'UPDATE room_players SET team_id = $1, assigned_by_host = TRUE WHERE id = $2 AND room_id = $3',
                        [teamId === 'null' ? null : parseInt(teamId), parseInt(playerId), roomId]
                    );
                }
            }

            await client.query('COMMIT');
            res.json({ success: true });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('PUT /api/battles/:code/teams error:', e.message);
        res.status(500).json({ error: 'Failed to update teams' });
    }
});

// Player joins a team
app.post('/api/battles/:code/join-team', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const { sessionTokenHash, teamId } = req.body;

        if (!sessionTokenHash || !teamId) {
            return res.status(400).json({ error: 'sessionTokenHash and teamId required' });
        }

        const roomRes = await pool.query('SELECT id, status, settings FROM rooms WHERE code = $1', [code]);
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ error: 'Battle not found' });
        }
        const room = roomRes.rows[0];

        if (room.status !== 'lobby') {
            return res.status(400).json({ error: 'Battle has already started' });
        }

        // Check team capacity
        const teamRes = await pool.query(
            `SELECT t.*, (SELECT COUNT(*) FROM room_players WHERE team_id = t.id) as member_count
             FROM teams t WHERE t.id = $1 AND t.room_id = $2`,
            [teamId, room.id]
        );
        if (teamRes.rows.length === 0) {
            return res.status(404).json({ error: 'Team not found' });
        }
        const team = teamRes.rows[0];
        const maxSize = room.settings?.teamSizeLimit || 4;
        if (team.member_count >= maxSize) {
            return res.status(400).json({ error: 'Team is full' });
        }

        // Assign player to team
        await pool.query(
            `UPDATE room_players SET team_id = $1, joined_team_at = NOW() 
             WHERE session_token_hash = $2 AND room_id = $3`,
            [teamId, sessionTokenHash, room.id]
        );

        res.json({ success: true, teamId: parseInt(teamId) });
    } catch (e) {
        console.error('POST /api/battles/:code/join-team error:', e.message);
        res.status(500).json({ error: 'Failed to join team' });
    }
});

// Player leaves team
app.post('/api/battles/:code/leave-team', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const { sessionTokenHash } = req.body;

        const roomRes = await pool.query('SELECT id, status FROM rooms WHERE code = $1', [code]);
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ error: 'Battle not found' });
        }
        const room = roomRes.rows[0];

        if (room.status !== 'lobby') {
            return res.status(400).json({ error: 'Battle has already started' });
        }

        await pool.query(
            `UPDATE room_players SET team_id = NULL, joined_team_at = NULL 
             WHERE session_token_hash = $1 AND room_id = $2`,
            [sessionTokenHash, room.id]
        );

        res.json({ success: true });
    } catch (e) {
        console.error('POST /api/battles/:code/leave-team error:', e.message);
        res.status(500).json({ error: 'Failed to leave team' });
    }
});

// Player ready/unready
app.post('/api/battles/:code/ready', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const { sessionTokenHash, ready } = req.body;

        const roomRes = await pool.query('SELECT id, status FROM rooms WHERE code = $1', [code]);
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ error: 'Battle not found' });
        }
        const room = roomRes.rows[0];

        if (room.status !== 'lobby') {
            return res.status(400).json({ error: 'Battle has already started' });
        }

        await pool.query(
            `UPDATE room_players SET is_ready = $1 
             WHERE session_token_hash = $2 AND room_id = $3`,
            [ready === true, sessionTokenHash, room.id]
        );

        res.json({ success: true, ready: ready === true });
    } catch (e) {
        console.error('POST /api/battles/:code/ready error:', e.message);
        res.status(500).json({ error: 'Failed to update ready status' });
    }
});

// Battle results (teacher or student who participated)
app.get('/api/battles/:code/results', async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const roomRes = await pool.query('SELECT * FROM rooms WHERE code = $1', [code]);
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ error: 'Battle not found' });
        }
        const room = roomRes.rows[0];

        // Get team results
        const teamResults = await pool.query(
            `SELECT brs.*, t.name, t.color,
                    (SELECT json_agg(json_build_object(
                        'id', pbs.player_id,
                        'name', rp.display_name,
                        'score', pbs.individual_score,
                        'contribution', pbs.contribution_percent,
                        'correct', pbs.questions_correct,
                        'attempted', pbs.questions_answered,
                        'accuracy', pbs.accuracy_percent,
                        'is_mvp', pbs.is_mvp
                    ) ORDER BY pbs.individual_score DESC)
                     FROM player_battle_stats pbs
                     JOIN room_players rp ON pbs.player_id = rp.id
                     WHERE pbs.room_id = $1 AND pbs.team_id = brs.team_id) as members
             FROM battle_results_summary brs
             JOIN teams t ON brs.team_id = t.id
             WHERE brs.room_id = $1
             ORDER BY brs.rank`,
            [room.id]
        );

        // Get individual leaderboard
        const individualResults = await pool.query(
            `SELECT rp.display_name, pbs.individual_score, pbs.contribution_percent,
                    pbs.questions_correct, pbs.questions_answered, pbs.accuracy_percent,
                    t.name as team_name, t.color as team_color, pbs.is_mvp
             FROM player_battle_stats pbs
             JOIN room_players rp ON pbs.player_id = rp.id
             LEFT JOIN teams t ON pbs.team_id = t.id
             WHERE pbs.room_id = $1
             ORDER BY pbs.individual_score DESC`,
            [room.id]
        );

        // Get highest scoring individual
        const mvpRes = await pool.query(
            `SELECT rp.display_name, pbs.individual_score, t.name as team_name
             FROM player_battle_stats pbs
             JOIN room_players rp ON pbs.player_id = rp.id
             LEFT JOIN teams t ON pbs.team_id = t.id
             WHERE pbs.room_id = $1 AND pbs.is_mvp = TRUE
             LIMIT 1`,
            [room.id]
        );

        res.json({
            room: {
                code: room.code,
                battle_name: room.battle_name,
                created_at: room.created_at,
                total_questions: room.settings?.questionCount || 0
            },
            teamResults: teamResults.rows,
            individualResults: individualResults.rows,
            mvp: mvpRes.rows[0] || null
        });
    } catch (e) {
        console.error('GET /api/battles/:code/results error:', e.message);
        res.status(500).json({ error: 'Failed to load battle results' });
    }
});

// ─── Room routes ──────────────────────────────────────────────────────────────

app.post('/api/rooms', requireTeacher, async (req, res) => {
    try {
        const { questionSetId, collegeId, settings, isPublic, battleName } = req.body;

        if (!questionSetId) {
            return res.status(400).json({ error: 'questionSetId is required' });
        }

        // Verify teacher owns the question set
        const ownerCheck = await pool.query(
            'SELECT id FROM question_sets WHERE id = $1 AND teacher_id = $2',
            [questionSetId, req.teacher.id]
        );
        if (ownerCheck.rows.length === 0) {
            return res.status(403).json({ error: 'You do not own this test' });
        }

        // Mark any previous unstarted empty lobby rooms for this teacher & test as abandoned immediately so they don't clutter public battles or create duplicates
        await pool.query(
            `UPDATE rooms SET status = 'abandoned' 
             WHERE teacher_id = $1 AND question_set_id = $2 AND status = 'lobby'
             AND id NOT IN (SELECT room_id FROM room_players WHERE display_name != 'Host')`,
            [req.teacher.id, questionSetId]
        );

        // Also remove any stale in-memory rooms for this teacher+test combo so they don't linger
        for (const [roomCode, gameRoom] of socketHandler.rooms.entries()) {
            if (gameRoom.teacherId === req.teacher.id && gameRoom.questionSetId === parseInt(questionSetId) && gameRoom.players.size <= 1) {
                socketHandler.rooms.delete(roomCode);
            }
        }

        // Generate the host socket token (stored server-side, sent to client)
        const { randomUUID } = require('crypto');
        const hostSocketToken = randomUUID();

        const roomSettings = {
            maxPlayers: settings?.maxPlayers || 50,
            advanceEarly: settings?.advanceEarly ?? true,
            teamMode: !!settings?.teamMode,
            teamSizeLimit: settings?.teamSizeLimit || 4,
            studentCreatedTeams: settings?.studentCreatedTeams !== false,
            teamCount: settings?.studentCreatedTeams ? 0 : (settings?.teamCount || 0),
            maxTeams: settings?.maxTeams || 10,
            minPlayersPerTeam: settings?.minPlayersPerTeam || 1,
            adaptiveDifficulty: settings?.adaptiveDifficulty ?? false,
            isPublic: isPublic !== undefined ? !!isPublic : !!settings?.isPublic,
            battleName: battleName || settings?.battleName || null,
        };

        const { code, roomId } = await socketHandler.createRoom(
            hostSocketToken,
            questionSetId,
            req.teacher.id,
            collegeId || null,
            roomSettings
        );

        res.json({ success: true, code, roomId, hostSocketToken });
    } catch (e) {
        console.error('POST /api/rooms error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/rooms/:code/host-info', requireTeacher, async (req, res) => {
    try {
        const code = req.params.code.toUpperCase();
        const roomRes = await pool.query(
            `SELECT r.*, qs.title as test_title, qs.description as test_description
             FROM rooms r
             JOIN question_sets qs ON r.question_set_id = qs.id
             WHERE r.code = $1 AND r.teacher_id = $2`,
            [code, req.teacher.id]
        );
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found or you are not the host' });
        }
        const room = roomRes.rows[0];

        // Reject rooms that are no longer usable
        if (room.status === 'abandoned' || room.status === 'interrupted') {
            return res.status(410).json({ error: 'Room not found or has expired' });
        }

        // Ensure room is active in socketHandler.rooms
        let gameRoom = socketHandler.rooms.get(code);
        if (!gameRoom && (room.status === 'lobby' || room.status === 'active')) {
            const qResult = await pool.query(
                `SELECT q.*, gq.order_index FROM questions q
                 JOIN game_questions gq ON gq.question_id = q.id
                 WHERE gq.room_id = $1 ORDER BY gq.order_index`,
                [room.id]
            );
            const teamsRes = await pool.query(
                `SELECT * FROM teams WHERE room_id = $1 ORDER BY id`,
                [room.id]
            );
            const GameRoom = require('./game/GameRoom');
            gameRoom = new GameRoom(
                room.id, room.code, room.settings, room.host_token_hash, qResult.rows,
                (finished) => socketHandler.handleGameFinished(finished),
                teamsRes.rows
            );
            socketHandler.rooms.set(code, gameRoom);
        }

        res.json({
            success: true,
            code: room.code,
            roomId: room.id,
            hostSocketToken: room.host_token_hash,
            settings: room.settings,
            status: room.status,
            testTitle: room.test_title
        });
    } catch (e) {
        console.error('GET /api/rooms/:code/host-info error:', e.message);
        res.status(500).json({ error: 'Failed to get room host info' });
    }
});

app.get('/api/rooms/:code/results', requireTeacher, async (req, res) => {
    try {
        const roomRes = await pool.query(
            'SELECT * FROM rooms WHERE code = $1 AND teacher_id = $2',
            [req.params.code.toUpperCase(), req.teacher.id]
        );
        if (roomRes.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        const room = roomRes.rows[0];

        const results = await pool.query(
            `SELECT rp.display_name, r.total_score, r.rank, r.accuracy_percent,
                    r.attempted, r.correct, r.avg_response_time_ms, r.fastest_answer_ms,
                    r.topic_stats, r.created_at
             FROM results r
             JOIN room_players rp ON rp.id = r.player_id
             WHERE r.room_id = $1
             ORDER BY r.rank`,
            [room.id]
        );
        res.json({ room, results: results.rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load results' });
    }
});

// ─── Daily Challenges ────────────────────────────────────────────────────────

app.get('/api/daily', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        let res1 = await pool.query(`SELECT id, challenge_date, questions FROM daily_challenges WHERE challenge_date = $1`, [today]);
        if (res1.rows.length === 0) {
            const qRes = await pool.query(`SELECT id FROM questions ORDER BY random() LIMIT 5`);
            if (qRes.rows.length === 0) {
                return res.status(500).json({ error: 'Not enough questions to generate a daily challenge' });
            }
            const qIds = qRes.rows.map(row => row.id);
            const insertRes = await pool.query(
                `INSERT INTO daily_challenges (challenge_date, questions) VALUES ($1, $2) RETURNING id, challenge_date, questions`,
                [today, JSON.stringify(qIds)]
            );
            res1 = insertRes;
        }

        const challenge = res1.rows[0];
        
        const qDataRes = await pool.query(
            `SELECT id, topic, difficulty, text, options, image_url, table_data 
             FROM questions 
             WHERE id = ANY($1::int[])`,
            [challenge.questions]
        );

        const questionMap = new Map(qDataRes.rows.map(q => [q.id, q]));
        const orderedQuestions = challenge.questions.map(id => questionMap.get(id)).filter(Boolean);
        
        const safeQuestions = orderedQuestions.map(q => ({
            ...q,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options
        }));

        res.json({ id: challenge.id, date: challenge.challenge_date, questions: safeQuestions });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch daily challenge' });
    }
});

app.post('/api/daily/submit', async (req, res) => {
    const { challengeId, playerIdentifier, answers } = req.body;
    try {
        if (!challengeId || !playerIdentifier || !answers) {
            return res.status(400).json({ error: 'Missing fields' });
        }
        
        const challengeRes = await pool.query(`SELECT questions FROM daily_challenges WHERE id = $1`, [challengeId]);
        if (challengeRes.rows.length === 0) return res.status(404).json({ error: 'Challenge not found' });
        
        const qIds = challengeRes.rows[0].questions;
        const qData = await pool.query(`SELECT id, correct_option_index, explanation FROM questions WHERE id = ANY($1::int[])`, [qIds]);
        const qMap = new Map(qData.rows.map(q => [q.id, q]));
        
        let score = 0;
        const results = {};
        for (const [qId, optionIdx] of Object.entries(answers)) {
            const parsedQid = parseInt(qId);
            const questionData = qMap.get(parsedQid);
            if (questionData && questionData.correct_option_index === optionIdx) {
                score += 100;
                results[parsedQid] = { correct: true, explanation: questionData.explanation, correctIndex: questionData.correct_option_index };
            } else if (questionData) {
                results[parsedQid] = { correct: false, explanation: questionData.explanation, correctIndex: questionData.correct_option_index };
            }
        }
        
        await pool.query(
            `INSERT INTO daily_attempts (daily_challenge_id, player_identifier, score) 
             VALUES ($1, $2, $3)
             ON CONFLICT (daily_challenge_id, player_identifier) DO UPDATE SET score = EXCLUDED.score, completed_at = CURRENT_TIMESTAMP`,
            [challengeId, playerIdentifier, score]
        );
        
        res.json({ success: true, score, results });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to submit daily challenge' });
    }
});

app.get('/api/daily/leaderboard/:date', async (req, res) => {
    try {
        const lbRes = await pool.query(
            `SELECT d.player_identifier, d.score, d.completed_at 
             FROM daily_attempts d
             JOIN daily_challenges c ON c.id = d.daily_challenge_id
             WHERE c.challenge_date = $1
             ORDER BY d.score DESC, d.completed_at ASC
             LIMIT 100`,
            [req.params.date]
        );
        res.json({ leaderboard: lbRes.rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// ─── College Leagues ────────────────────────────────────────────────────────

app.get('/api/colleges', async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name FROM colleges ORDER BY name ASC`);
        res.json({ colleges: result.rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch colleges' });
    }
});

app.get('/api/leagues', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.name as college_name, ls.score 
            FROM league_scores ls
            JOIN colleges c ON c.id = ls.college_id
            WHERE ls.topic IS NULL
            ORDER BY ls.score DESC
        `);
        res.json({ leagues: result.rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch leagues' });
    }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────

// ─── Achievement Routes ───────────────────────────────────────────────────────

// All achievement definitions (public — for gallery display)
app.get('/api/achievements', async (req, res) => {
    try {
        const definitions = await getAllAchievementDefinitions();
        res.json({ achievements: definitions });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load achievements' });
    }
});

// Student's earned achievements + profile
app.get('/api/student/achievements', requireStudent, async (req, res) => {
    try {
        const data = await getStudentAchievements(req.student.id);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load achievements' });
    }
});

// Mark achievements as seen
app.post('/api/student/achievements/seen', requireStudent, async (req, res) => {
    try {
        await markAchievementsAsSeen(req.student.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to mark achievements seen' });
    }
});

// Student profile (XP, level, stats)
app.get('/api/student/profile', requireStudent, async (req, res) => {
    try {
        const profileRes = await pool.query(
            'SELECT * FROM player_profiles WHERE student_id = $1',
            [req.student.id]
        );
        const profile = profileRes.rows[0] || { student_id: req.student.id, total_xp: 0, level: 1, battles_played: 0 };

        const rewardRes = await pool.query(
            `SELECT * FROM reward_transactions WHERE student_id = $1 ORDER BY created_at DESC LIMIT 20`,
            [req.student.id]
        );

        res.json({ profile, recentRewards: rewardRes.rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

// ─── Battle History Routes ────────────────────────────────────────────────────

// Student's complete battle history
app.get('/api/student/battle-history', requireStudent, async (req, res) => {
    try {
        const { type, search, limit = 20, offset = 0 } = req.query;
        const params = [req.student.id];
        const conditions = ['rp.student_id = $1', 'r.status IN (\'finished\', \'completed\')'];

        if (type && type !== 'all') {
            conditions.push(`r.battle_type = $${params.length + 1}`);
            params.push(type);
        }
        if (search) {
            conditions.push(`(r.battle_name ILIKE $${params.length + 1} OR qs.title ILIKE $${params.length + 1})`);
            params.push(`%${search}%`);
        }

        const where = conditions.join(' AND ');

        const historyRes = await pool.query(
            `SELECT
                r.id AS room_id, r.code AS room_code, r.battle_name, r.battle_type,
                r.created_at AS battle_date,
                rp.display_name, res.total_score, res.rank, res.accuracy_percent,
                res.attempted, res.correct, res.avg_response_time_ms, res.fastest_answer_ms,
                rp.team_id, t.name AS team_name, qs.title AS test_title,
                COALESCE(pbs.is_mvp, FALSE) AS is_mvp,
                (SELECT COUNT(*) FROM results r2 WHERE r2.room_id = r.id) AS total_participants
             FROM results res
             JOIN room_players rp ON res.player_id = rp.id
             JOIN rooms r ON res.room_id = r.id
             JOIN question_sets qs ON r.question_set_id = qs.id
             LEFT JOIN teams t ON rp.team_id = t.id
             LEFT JOIN player_battle_stats pbs ON pbs.room_id = r.id AND pbs.player_id = rp.id
             WHERE ${where}
             ORDER BY r.created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        const countRes = await pool.query(
            `SELECT COUNT(*) FROM results res
             JOIN room_players rp ON res.player_id = rp.id
             JOIN rooms r ON res.room_id = r.id
             JOIN question_sets qs ON r.question_set_id = qs.id
             WHERE ${where}`,
            params
        );

        res.json({ history: historyRes.rows, total: parseInt(countRes.rows[0].count) });
    } catch (e) {
        console.error('GET /api/student/battle-history error:', e.message);
        res.status(500).json({ error: 'Failed to load battle history' });
    }
});

// Detail view for a single battle
app.get('/api/student/battle-history/:roomId', requireStudent, async (req, res) => {
    try {
        const roomId = parseInt(req.params.roomId);

        // Verify student participated
        const checkRes = await pool.query(
            `SELECT rp.id FROM room_players rp WHERE rp.room_id = $1 AND rp.student_id = $2`,
            [roomId, req.student.id]
        );
        if (checkRes.rows.length === 0) return res.status(403).json({ error: 'Not authorized' });

        // Get room info
        const roomRes = await pool.query(
            `SELECT r.*, qs.title AS test_title FROM rooms r
             JOIN question_sets qs ON qs.id = r.question_set_id
             WHERE r.id = $1`,
            [roomId]
        );
        if (roomRes.rows.length === 0) return res.status(404).json({ error: 'Battle not found' });
        const room = roomRes.rows[0];

        // All participants for this battle
        const participantsRes = await pool.query(
            `SELECT rp.display_name, res.total_score, res.rank, res.accuracy_percent,
                    res.correct, res.attempted, res.avg_response_time_ms,
                    t.name AS team_name, t.color AS team_color,
                    COALESCE(pbs.is_mvp, FALSE) AS is_mvp,
                    rp.student_id = $2 AS is_me
             FROM results res
             JOIN room_players rp ON rp.id = res.player_id
             LEFT JOIN teams t ON rp.team_id = t.id
             LEFT JOIN player_battle_stats pbs ON pbs.room_id = $1 AND pbs.player_id = rp.id
             WHERE res.room_id = $1
             ORDER BY res.rank`,
            [roomId, req.student.id]
        );

        // Team standings (if team battle)
        let teamStandings = [];
        if (room.battle_type === 'team_battle') {
            const teamsRes = await pool.query(
                `SELECT t.id, t.name, t.color, t.score,
                        COUNT(rp.id) AS member_count
                 FROM teams t
                 LEFT JOIN room_players rp ON rp.team_id = t.id AND rp.room_id = $1
                 WHERE t.room_id = $1
                 GROUP BY t.id
                 ORDER BY t.score DESC`,
                [roomId]
            );
            teamStandings = teamsRes.rows;
        }

        res.json({ room, participants: participantsRes.rows, teamStandings });
    } catch (e) {
        console.error('GET /api/student/battle-history/:id error:', e.message);
        res.status(500).json({ error: 'Failed to load battle detail' });
    }
});

// ─── Multi-Organizer Anti-Cheat & Super Admin Monitoring ────────────────────

// Organizer's own isolated monitoring dashboard
app.get('/api/teacher/suspicious-activity', requireTeacher, async (req, res) => {
    try {
        const { studentId, roomId, tournamentId, eventType, riskLevel, reviewed } = req.query;

        // Strict data isolation: organizer can ONLY query events from their own battles/tournaments
        // Super Admin can pass organizerId if desired or view all
        const organizerId = req.teacher.role === 'super_admin' && req.query.organizerId
            ? parseInt(req.query.organizerId)
            : (req.teacher.role === 'super_admin' ? null : req.teacher.id);

        const [data, stats] = await Promise.all([
            getSuspiciousLogs({
                organizerId,
                studentId: studentId ? parseInt(studentId) : undefined,
                roomId: roomId ? parseInt(roomId) : undefined,
                tournamentId: tournamentId ? parseInt(tournamentId) : undefined,
                eventType,
                riskLevel,
                reviewed: reviewed !== undefined ? reviewed === 'true' : undefined,
                limit: 50, offset: 0
            }),
            getAntiCheatStats(organizerId)
        ]);

        res.json({ ...data, stats });
    } catch (e) {
        console.error('GET /api/teacher/suspicious-activity error:', e.message);
        res.status(500).json({ error: 'Failed to load suspicious activity' });
    }
});

// Organizer resolves / reviews a flagged event within their permissions
app.post('/api/teacher/suspicious-activity/:id/review', requireTeacher, async (req, res) => {
    try {
        const logId = parseInt(req.params.id);
        const { note, resolutionAction } = req.body;

        // Ensure organizer owns the log record or is super admin
        const check = await pool.query('SELECT organizer_id FROM suspicious_activity_logs WHERE id = $1', [logId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Log not found' });

        if (req.teacher.role !== 'super_admin' && check.rows[0].organizer_id !== req.teacher.id) {
            return res.status(403).json({ error: 'Unauthorized: You can only moderate events from your own battles' });
        }

        await markReviewed({
            logId,
            reviewNote: note,
            resolutionAction: resolutionAction || 'cleared',
            reviewerTeacherId: req.teacher.id
        });

        // Record in audit log
        await pool.query(
            `INSERT INTO audit_logs (actor_teacher_id, actor_role, action, target_type, target_id, details)
             VALUES ($1, $2, 'review_suspicious_activity', 'suspicious_log', $3, $4)`,
            [req.teacher.id, req.teacher.role, logId.toString(), JSON.stringify({ resolutionAction, note })]
        );

        res.json({ success: true });
    } catch (e) {
        console.error('Review suspicious activity error:', e.message);
        res.status(500).json({ error: 'Failed to mark reviewed' });
    }
});

// Platform Super Admin Global Monitoring Dashboard
app.get('/api/admin/super-dashboard', requireSuperAdmin, async (req, res) => {
    try {
        const [statsRes, organizersRes, recentAuditRes] = await Promise.all([
            // Platform global metrics
            pool.query(`
                SELECT 
                    (SELECT COUNT(*) FROM teachers)::int AS total_organizers,
                    (SELECT COUNT(*) FROM rooms WHERE status IN ('lobby', 'active'))::int AS active_battles,
                    (SELECT COUNT(*) FROM tournaments WHERE status = 'in_progress')::int AS active_tournaments,
                    (SELECT COUNT(*) FROM students)::int AS total_students,
                    (SELECT COUNT(*) FROM suspicious_activity_logs)::int AS total_flagged_events,
                    (SELECT COUNT(*) FROM suspicious_activity_logs WHERE risk_score >= 8)::int AS critical_flagged_events
            `),
            // Organizer-wise summary
            pool.query(`
                SELECT t.id, t.email, t.display_name, t.role, t.is_suspended,
                       COUNT(DISTINCT r.id) AS total_rooms,
                       COUNT(DISTINCT sal.id) AS total_flags,
                       COUNT(DISTINCT CASE WHEN sal.risk_score >= 8 THEN sal.id END) AS critical_flags
                FROM teachers t
                LEFT JOIN rooms r ON r.teacher_id = t.id
                LEFT JOIN suspicious_activity_logs sal ON sal.organizer_id = t.id
                GROUP BY t.id
                ORDER BY critical_flags DESC, total_flags DESC
            `),
            // Recent administrative audit logs
            pool.query(`
                SELECT al.*, t.display_name AS actor_name
                FROM audit_logs al
                LEFT JOIN teachers t ON t.id = al.actor_teacher_id
                ORDER BY al.created_at DESC LIMIT 25
            `)
        ]);

        res.json({
            platformMetrics: statsRes.rows[0],
            organizers: organizersRes.rows,
            auditLogs: recentAuditRes.rows
        });
    } catch (e) {
        console.error('Super Admin dashboard error:', e.message);
        res.status(500).json({ error: 'Failed to load Super Admin dashboard' });
    }
});

// Super Admin: Suspend or Unsuspend an Organizer
app.post('/api/admin/organizers/:id/toggle-suspension', requireSuperAdmin, async (req, res) => {
    try {
        const targetId = parseInt(req.params.id);
        const { isSuspended, reason } = req.body;

        await pool.query('UPDATE teachers SET is_suspended = $1 WHERE id = $2', [!!isSuspended, targetId]);

        await pool.query(
            `INSERT INTO audit_logs (actor_teacher_id, actor_role, action, target_type, target_id, details)
             VALUES ($1, 'super_admin', $2, 'teacher', $3, $4)`,
            [req.teacher.id, isSuspended ? 'suspend_organizer' : 'unsuspend_organizer', targetId.toString(), JSON.stringify({ reason })]
        );

        res.json({ success: true, isSuspended: !!isSuspended });
    } catch (e) {
        res.status(500).json({ error: 'Failed to update organizer suspension status' });
    }
});

app.use((req, res, next) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function startServer() {
    try {
        // Validate JWT_SECRET exists before accepting any connections
        const { getJwtSecret } = require('./auth');
        getJwtSecret(); // throws if missing/too short

        // Database connection with retry
        let retries = 5;
        while (retries > 0) {
            try {
                await pool.query('SELECT 1');
                console.log('[DB] Connected successfully.');
                break;
            } catch (err) {
                retries--;
                console.log(`[DB] Not reachable (${retries} retries left): ${err.message}`);
                if (retries === 0) {
                    console.error('[DB] Could not connect. Run: npm run db:up');
                    process.exit(1);
                }
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        // Mark stale active rooms from a previous crash
        await markInterruptedRooms(pool);

        // Run database migrations automatically on startup (idempotent)
        const { runMigrations } = require('../scripts/migrate');
        try {
            await runMigrations();
            console.log('[DB] Migrations complete.');
        } catch (migErr) {
            console.error('[DB] Migration error (continuing anyway):', migErr.message);
        }

        server.listen(port, '0.0.0.0', () => {
            console.log(`[Server] Listening on http://0.0.0.0:${port}`);
        });
    } catch (err) {
        console.error('[Startup] Fatal:', err.message);
        process.exit(1);
    }
}

startServer();
