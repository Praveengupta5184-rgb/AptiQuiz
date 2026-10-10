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
const { router: authRouter, requireTeacher } = require('./auth');
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
