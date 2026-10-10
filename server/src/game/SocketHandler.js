/**
 * SocketHandler — real-time event handling for game rooms.
 *
 * Event contract:
 *
 * CLIENT → SERVER:
 *   join_room   { code, displayName, sessionTokenHash, role? }
 *   start_game  {}  (host only; identity proved by hostTokenHash stored server-side per socket)
 *   submit_answer { optionIndex }  (shuffled index as seen by this student)
 *   ping        (clientTimestamp)
 *
 * SERVER → CLIENT:
 *   room_state      { code, state, players[], settings }
 *   question_active { index, total, text, topic, difficulty, options[], deadlineMs, timeLimitMs }
 *   score_update    LeaderboardEntry[]
 *   reveal          { correctOptionIndex, explanation, leaderboard[] }
 *   game_finished   { leaderboard[], totalQuestions }
 *   reconnect_state { state, score, streak, question?, reveal?, finalResults? }
 *   error           { message }
 *
 * Security notes:
 *   - Only the socket that created the room (and carries the hostTokenHash) can call start_game.
 *   - Student sockets cannot call start_game; the server checks the hostTokenHash per-socket.
 *   - Correct answer index is never included in question_active payloads.
 *   - Rate limiting: join_room and submit_answer are debounced per socket.
 */

const { GameRoom } = require('./GameRoom');
const { pool } = require('../../db');
const { persistGameResults } = require('./Persistence');
const { z } = require('zod');

// ─── Validation schemas ──────────────────────────────────────────────────────

const joinSchema = z.object({
    code: z.string().length(5).toUpperCase(),
    displayName: z.string().min(1).max(50).trim(),
    sessionTokenHash: z.string().min(1).max(1024),
    role: z.enum(['player', 'host']).optional(),
    studentId: z.number().int().positive().optional(),
});

const submitSchema = z.object({
    optionIndex: z.number().int().min(0).max(9),
});

// ─── Simple per-socket rate limiter ──────────────────────────────────────────

class RateLimit {
    constructor(maxCalls, windowMs) {
        this.maxCalls = maxCalls;
        this.windowMs = windowMs;
        this.calls = new Map(); // socketId → timestamp[]
    }

    check(socketId) {
        const now = Date.now();
        const times = (this.calls.get(socketId) || []).filter(t => now - t < this.windowMs);
        if (times.length >= this.maxCalls) return false;
        times.push(now);
        this.calls.set(socketId, times);
        return true;
    }

    clear(socketId) {
        this.calls.delete(socketId);
    }
}

// ─── SocketHandler ────────────────────────────────────────────────────────────

class SocketHandler {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();             // code → GameRoom
        this.socketToRoom = new Map();      // socketId → roomCode
        this.hostSockets = new Map();       // socketId → { code, hostTokenHash }

        // Rate limits
        this.joinRateLimit = new RateLimit(5, 10000);     // 5 joins per 10s per socket
        this.answerRateLimit = new RateLimit(3, 5000);    // 3 submit attempts per 5s per socket
    }

    handleConnection(socket) {
        // ── Ping/Pong for latency measurement ──
        socket.on('ping', (clientTime) => {
            socket.emit('pong', clientTime);
        });

        socket.on('pong_client', (clientTime) => {
            const rtt = Date.now() - clientTime;
            const code = this.socketToRoom.get(socket.id);
            if (code) {
                const room = this.rooms.get(code);
                if (room) room.recordPing(socket.id, rtt);
            }
        });

        // ── Join Room ──
        socket.on('join_room', async (data, callback) => {
            try {
                if (!this.joinRateLimit.check(socket.id)) {
                    throw new Error('Too many join attempts. Please wait.');
                }

                const parsed = joinSchema.parse(data);
                let { code, displayName, sessionTokenHash, role } = parsed;
                if (sessionTokenHash.length > 200) {
                    sessionTokenHash = require('crypto').createHash('sha256').update(sessionTokenHash).digest('hex');
                }

                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found or has expired');

                const isHost = role === 'host' && room.hostTokenHash === sessionTokenHash;

                if (isHost) {
                    // Track this socket as the authoritative host for this room
                    this.hostSockets.set(socket.id, { code, hostTokenHash: sessionTokenHash });
                    socket.join(code);
                    this.socketToRoom.set(socket.id, code);
                    // Send current lobby state to host
                    socket.emit('room_state', room.getLobbyState());
                    if (callback) callback({ success: true });
                    return;
                }

                // Check for reconnect: player already exists in room memory
                const isReconnect = room.players.has(sessionTokenHash);

                if (isReconnect) {
                    // Restore socket mapping
                    const lobbyState = room.addPlayer(socket.id, sessionTokenHash, displayName);
                    socket.join(code);
                    this.socketToRoom.set(socket.id, code);

                    // Send back full current state
                    const reconnectState = room.getReconnectState(sessionTokenHash);
                    socket.emit('reconnect_state', reconnectState);

                    // Notify room of reconnection
                    socket.to(code).emit('room_state', room.getLobbyState());

                    if (callback) callback({ success: true, reconnected: true });
                    return;
                }

                // New player joining
                if (room.state !== 'LOBBY') {
                    throw new Error('Test has already started');
                }

                // Persist player to DB
                if (room.roomId) {
                    try {
                        await pool.query(
                            `INSERT INTO room_players (room_id, session_token_hash, display_name, student_id)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (room_id, display_name) DO NOTHING`,
                            [room.roomId, sessionTokenHash, displayName, parsed.studentId || null]
                        );
                    } catch (dbErr) {
                        if (dbErr.code === '23505') {
                            throw new Error('That name is already taken in this room');
                        }
                        throw dbErr;
                    }
                }

                socket.join(code);
                this.socketToRoom.set(socket.id, code);
                const lobbyState = room.addPlayer(socket.id, sessionTokenHash, displayName);

                // Broadcast updated lobby to everyone in the room
                this.io.to(code).emit('room_state', room.getLobbyState());

                if (callback) callback({ success: true, lobbyState });

            } catch (err) {
                const msg = err?.errors?.[0]?.message || err.message || 'Join failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // ── Start Game (host only) ──
        socket.on('start_game', (data, callback) => {
            try {
                const hostInfo = this.hostSockets.get(socket.id);
                if (!hostInfo) throw new Error('Unauthorized: you are not the host');

                const { code, hostTokenHash } = hostInfo;
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                room.startGame(hostTokenHash);

                // Emit per-player shuffled question to each student socket in the room
                this._broadcastQuestion(code, room);
                room.startTimer(this.io);

                if (callback) callback({ success: true });
            } catch (err) {
                const msg = err.message || 'Start failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // ── Submit Answer ──
        socket.on('submit_answer', (data, callback) => {
            try {
                if (!this.answerRateLimit.check(socket.id)) {
                    throw new Error('Submitting too fast. Please wait.');
                }

                const parsed = submitSchema.parse(data);
                const { optionIndex } = parsed;

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                const shouldReveal = room.submitAnswer(socket.id, optionIndex, this.io);
                if (callback) callback({ success: true });

                if (shouldReveal) {
                    room.revealAnswer(this.io);
                    // After reveal, schedule next question emission
                    this._scheduleNextQuestion(code, room);
                }
            } catch (err) {
                const msg = err?.errors?.[0]?.message || err.message || 'Submit failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // ── Disconnect ──
        socket.on('disconnect', () => {
            const code = this.socketToRoom.get(socket.id);
            if (code) {
                const room = this.rooms.get(code);
                if (room) {
                    room.removePlayer(socket.id);
                    // Notify room of disconnect (lobby state update with connected flags)
                    socket.to(code).emit('room_state', room.getLobbyState());
                }
            }
            this.socketToRoom.delete(socket.id);
            this.hostSockets.delete(socket.id);
            this.joinRateLimit.clear(socket.id);
            this.answerRateLimit.clear(socket.id);
        });
    }

    // ─── Broadcast question with per-player shuffled options ─────────────────

    _broadcastQuestion(code, room) {
        const sockets = this.io.sockets.adapter.rooms.get(code);
        if (!sockets) return;

        for (const socketId of sockets) {
            const token = room.socketToToken.get(socketId);
            if (token && room.players.has(token)) {
                const qState = room.getQuestionStateForPlayer(token);
                this.io.to(socketId).emit('question_active', qState);
            } else {
                const qState = room.getQuestionState();
                this.io.to(socketId).emit('question_active', qState);
            }
        }
    }

    _scheduleNextQuestion(code, room) {
        // This is called when advanceEarly triggered early reveal.
        // The actual next question emission is handled inside revealAnswer's
        // setTimeout. Nothing to do here unless we want to override timing.
    }

    // ─── Room creation ────────────────────────────────────────────────────────

    async createRoom(hostTokenHash, questionSetId, teacherId, collegeId, settings) {
        // Validate that the test has questions
        const qResult = await pool.query(
            'SELECT * FROM questions WHERE question_set_id = $1 ORDER BY id',
            [questionSetId]
        );
        const questions = qResult.rows;
        if (questions.length === 0) {
            throw new Error('Cannot create a room with an empty question set');
        }

        // Generate unique unambiguous 5-char code
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1 (look-alike)
        let code, attempts = 0;
        do {
            code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            attempts++;
            if (attempts > 100) throw new Error('Could not generate a unique room code');
        } while (this.rooms.has(code));

        // Persist room to DB
        const insertRes = await pool.query(
            `INSERT INTO rooms (code, status, question_set_id, college_id, teacher_id, settings, host_token_hash, expires_at)
             VALUES ($1, 'lobby', $2, $3, $4, $5, $6, NOW() + INTERVAL '4 hours')
             RETURNING id`,
            [code, questionSetId, collegeId, teacherId, JSON.stringify(settings), hostTokenHash]
        );
        const roomId = insertRes.rows[0].id;

        const room = new GameRoom(
            roomId, code, settings, hostTokenHash, questions,
            (finishedRoom) => this.handleGameFinished(finishedRoom)
        );

        this.rooms.set(code, room);
        return code;
    }

    // ─── Game finished ────────────────────────────────────────────────────────

    async handleGameFinished(room) {
        console.log(`[Room ${room.code}] Game finished. Persisting results...`);
        try {
            if (room.roomId) {
                await persistGameResults(room, pool);
            }
        } catch (e) {
            console.error(`[Room ${room.code}] Persistence error:`, e.message);
        }

        // Keep room in memory for 30 minutes so latecomers can see results
        setTimeout(() => this.rooms.delete(room.code), 30 * 60 * 1000);
    }
}

module.exports = SocketHandler;
