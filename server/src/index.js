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
const { router: authRouter, requireTeacher, requireStudent } = require('./auth');
const SocketHandler = require('./game/SocketHandler');
const { markInterruptedRooms } = require('./game/Persistence');

const port = process.env.PORT || 3005;
const server = http.createServer(app);

// ─── Socket.IO ────────────────────────────────────────────────────────────────

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
    : '*';

const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
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
                    rp.display_name, r.student_id
             FROM results r
             JOIN room_players rp ON r.player_id = rp.id
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

// ─── Room routes ──────────────────────────────────────────────────────────────

app.post('/api/rooms', requireTeacher, async (req, res) => {
    try {
        const { questionSetId, collegeId, settings } = req.body;

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

        // Generate the host socket token (stored server-side, sent to client)
        const { randomUUID } = require('crypto');
        const hostSocketToken = randomUUID();

        const code = await socketHandler.createRoom(
            hostSocketToken,
            questionSetId,
            req.teacher.id,
            collegeId || null,
            {
                maxPlayers: settings?.maxPlayers || 50,
                advanceEarly: settings?.advanceEarly ?? true,
            }
        );

        res.json({ success: true, code, hostSocketToken });
    } catch (e) {
        console.error('POST /api/rooms error:', e.message);
        res.status(500).json({ error: e.message });
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

        server.listen(port, '0.0.0.0', () => {
            console.log(`[Server] Listening on http://0.0.0.0:${port}`);
        });
    } catch (err) {
        console.error('[Startup] Fatal:', err.message);
        process.exit(1);
    }
}

startServer();
