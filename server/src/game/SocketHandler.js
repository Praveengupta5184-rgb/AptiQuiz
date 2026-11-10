/**
 * SocketHandler — real-time event handling for game rooms.
 *
 * Event contract:
 *
 * CLIENT → SERVER:
 *   join_room        { code, displayName, sessionTokenHash, role? }
 *   start_game       {}  (host only; identity proved by hostTokenHash stored server-side per socket)
 *   submit_answer    { optionIndex }  (shuffled index as seen by this student)
 *   ping             (clientTimestamp)
 *   create_team      { name, color? } (host only)
 *   join_team        { teamId } (player)
 *   leave_team       {} (player)
 *   assign_team      { playerId, teamId } (host only)
 *   player_ready     { ready: boolean } (player)
 *   start_battle     {} (host only)
 *
 * SERVER → CLIENT:
 *   room_state           { code, state, players[], settings, teams[], unassignedPlayers[] }
 *   team_updated         { teams[], unassignedPlayers[] }
 *   question_active      { index, total, text, topic, difficulty, options[], deadlineMs, timeLimitMs }
 *   score_update         { players[], teams[] }
 *   reveal               { correctOptionIndex, explanation, leaderboard: { players[], teams[] } }
 *   game_finished        { leaderboard: { players[], teams[] }, totalQuestions }
 *   battle_results       { teamResults[], individualResults[], mvp }
 *   reconnect_state      { state, score, streak, question?, reveal?, finalResults?, battleResults? }
 *   error                { message }
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
    role: z.enum(['player', 'host', 'spectator']).optional(),
    studentId: z.number().int().positive().optional(),
});

const submitSchema = z.object({
    optionIndex: z.number().int().min(0).max(9),
});

const createTeamSchema = z.object({
    name: z.string().min(1).max(50).trim(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const joinTeamSchema = z.object({
    teamId: z.number().int().positive(),
});

const assignTeamSchema = z.object({
    playerId: z.number().int().positive(),
    teamId: z.number().int().positive().nullable(),
});

const readySchema = z.object({
    ready: z.boolean(),
});

const startBattleSchema = z.object({});

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

                let room = this.rooms.get(code);
                if (!room) {
                    room = await this.loadRoomFromDb(code);
                }
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

                    // Send updated room state to all sockets in room (including this reconnected socket)
                    this.io.to(code).emit('room_state', room.getLobbyState());

                    if (callback) callback({ success: true, reconnected: true, lobbyState: room.getLobbyState() });
                    return;
                }
                
                if (role === 'spectator') {
                    socket.join(code);
                    this.socketToRoom.set(socket.id, code);
                    // Emit full current state to spectator
                    const state = {
                        state: room.state,
                        settings: room.settings,
                        question: room.state === 'QUESTION_ACTIVE' || room.state === 'REVEAL' ? room.getQuestionState() : null,
                        leaderboard: room.getLeaderboard(),
                    };
                    socket.emit('reconnect_state', state); // We can reuse reconnect_state to load the spectator view
                    if (callback) callback({ success: true });
                    return;
                }

                // New player joining
                if (room.state !== 'LOBBY') {
                    throw new Error('Test has already started');
                }

                // Persist player to DB
                if (room.roomId) {
                    try {
                        let effectiveStudentId = parsed.studentId || null;
                        if (!effectiveStudentId && displayName && displayName !== 'Host' && displayName !== 'Spectator') {
                            const sLookup = await pool.query('SELECT id FROM students WHERE LOWER(display_name) = LOWER($1)', [displayName.trim()]);
                            if (sLookup.rows.length > 0) effectiveStudentId = sLookup.rows[0].id;
                        }

                        // First, check if this session_token_hash already exists for this room (rejoin)
                        const existingPlayer = await pool.query(
                            `SELECT id, student_id FROM room_players WHERE room_id = $1 AND session_token_hash = $2`,
                            [room.roomId, sessionTokenHash]
                        );

                        if (existingPlayer.rows.length > 0) {
                            // This is a rejoin - if student_id was missing and now known, update it
                            if (!existingPlayer.rows[0].student_id && effectiveStudentId) {
                                await pool.query(
                                    `UPDATE room_players SET student_id = $1 WHERE id = $2`,
                                    [effectiveStudentId, existingPlayer.rows[0].id]
                                ).catch(() => {});
                            }
                        } else {
                            // New player - check if display_name is taken by someone else
                            const nameTaken = await pool.query(
                                `SELECT id FROM room_players WHERE room_id = $1 AND display_name = $2 AND session_token_hash != $3`,
                                [room.roomId, displayName, sessionTokenHash]
                            );
                            if (nameTaken.rows.length > 0) {
                                throw new Error('That name is already taken in this room');
                            }

                            // Insert new player
                            await pool.query(
                                `INSERT INTO room_players (room_id, session_token_hash, display_name, student_id)
                                 VALUES ($1, $2, $3, $4)`,
                                [room.roomId, sessionTokenHash, displayName, effectiveStudentId]
                            );
                        }
                    } catch (dbErr) {
                        if (dbErr.message === 'That name is already taken in this room') {
                            throw dbErr;
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

        // ── Use Powerup ──
        socket.on('use_powerup', (data, callback) => {
            try {
                const { powerupType } = data;
                if (!powerupType) throw new Error('No powerup type specified');

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                const result = room.usePowerup(socket.id, powerupType);
                if (callback) callback(result);
            } catch (err) {
                const msg = err.message || 'Powerup failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // ── Team Battle Events ──────────────────────────────────────────────────

        // Host or Player creates a team
        socket.on('create_team', async (data, callback) => {
            try {
                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                const hostInfo = this.hostSockets.get(socket.id);
                const token = room.socketToToken.get(socket.id);
                if (!hostInfo && !token) throw new Error('Unauthorized');

                const parsed = createTeamSchema.parse(data);
                const { name, color } = parsed;

                if (room.state !== 'LOBBY') throw new Error('Cannot create teams after battle started');

                // Check maximum number of teams
                const maxTeams = room.settings?.maxTeams || 10;
                if ((room.teams || []).length >= maxTeams) {
                    throw new Error(`Maximum number of teams (${maxTeams}) reached`);
                }

                // Check duplicate team name in this room
                if (room.teams?.some(t => t.name.toLowerCase() === name.trim().toLowerCase())) {
                    throw new Error('A team with this name already exists');
                }

                // Persist to DB if room.roomId exists
                let dbTeamId = null;
                if (room.roomId) {
                    try {
                        const teamRes = await pool.query(
                            `INSERT INTO teams (room_id, name, score, color) VALUES ($1, $2, 0, $3) RETURNING id`,
                            [room.roomId, name.trim(), color || '#3b82f6']
                        );
                        if (teamRes.rows.length > 0) {
                            dbTeamId = teamRes.rows[0].id;
                        }
                    } catch (dbErr) {
                        console.error('Failed to persist team to DB:', dbErr.message);
                    }
                }

                const team = room.createTeam(name, color, dbTeamId);

                // If created by a student/player, automatically join them to their newly created team
                if (token) {
                    try {
                        room.joinTeam(token, team.id);
                        if (room.roomId && dbTeamId) {
                            await pool.query(
                                `UPDATE room_players SET team_id = $1, joined_team_at = NOW() WHERE room_id = $2 AND session_token_hash = $3`,
                                [dbTeamId, room.roomId, token]
                            );
                        }
                    } catch (e) {
                        console.error('Auto join team failed:', e.message);
                    }
                }
                
                // Broadcast updated team state
                this.io.to(code).emit('team_updated', room.getTeamState());
                
                if (callback) callback({ success: true, team });
            } catch (err) {
                const msg = err?.errors?.[0]?.message || err.message || 'Create team failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // Player joins a team
        socket.on('join_team', (data, callback) => {
            try {
                const parsed = joinTeamSchema.parse(data);
                const { teamId } = parsed;

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                const token = room.socketToToken.get(socket.id);
                if (!token) throw new Error('Unknown player');

                if (room.state !== 'LOBBY') throw new Error('Cannot join team after battle started');

                const result = room.joinTeam(token, teamId);

                if (room.roomId) {
                    pool.query(
                        `UPDATE room_players SET team_id = $1, joined_team_at = NOW() WHERE room_id = $2 AND session_token_hash = $3`,
                        [teamId, room.roomId, token]
                    ).catch(e => console.error('DB update room_player team failed:', e.message));
                }
                
                // Broadcast updated team state
                this.io.to(code).emit('team_updated', room.getTeamState());
                
                if (callback) callback({ success: true, ...result });
            } catch (err) {
                const msg = err?.errors?.[0]?.message || err.message || 'Join team failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // Player leaves team
        socket.on('leave_team', (data, callback) => {
            try {
                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                const token = room.socketToToken.get(socket.id);
                if (!token) throw new Error('Unknown player');

                if (room.state !== 'LOBBY') throw new Error('Cannot leave team after battle started');

                room.leaveTeam(token);

                if (room.roomId) {
                    pool.query(
                        `UPDATE room_players SET team_id = NULL, joined_team_at = NULL WHERE room_id = $1 AND session_token_hash = $2`,
                        [room.roomId, token]
                    ).catch(e => console.error('DB clear room_player team failed:', e.message));
                }
                
                // Broadcast updated team state
                this.io.to(code).emit('team_updated', room.getTeamState());
                
                if (callback) callback({ success: true });
            } catch (err) {
                const msg = err.message || 'Leave team failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // Host assigns player to team
        socket.on('assign_team', (data, callback) => {
            try {
                const hostInfo = this.hostSockets.get(socket.id);
                if (!hostInfo) throw new Error('Unauthorized: only host can assign teams');

                const parsed = assignTeamSchema.parse(data);
                const { playerId, teamId } = parsed;

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                if (room.state !== 'LOBBY') throw new Error('Cannot assign teams after battle started');

                room.assignTeam(playerId, teamId);
                
                // Broadcast updated team state
                this.io.to(code).emit('team_updated', room.getTeamState());
                
                if (callback) callback({ success: true });
            } catch (err) {
                const msg = err?.errors?.[0]?.message || err.message || 'Assign team failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // Player ready/unready
        socket.on('player_ready', (data, callback) => {
            try {
                const parsed = readySchema.parse(data);
                const { ready } = parsed;

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                const token = room.socketToToken.get(socket.id);
                if (!token) throw new Error('Unknown player');

                if (room.state !== 'LOBBY') throw new Error('Cannot change ready status after battle started');

                room.setPlayerReady(token, ready);
                
                // Broadcast updated room state
                this.io.to(code).emit('room_state', room.getLobbyState());
                
                if (callback) callback({ success: true, ready });
            } catch (err) {
                const msg = err?.errors?.[0]?.message || err.message || 'Ready update failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // Host starts the battle
        socket.on('start_battle', (data, callback) => {
            try {
                const hostInfo = this.hostSockets.get(socket.id);
                if (!hostInfo) throw new Error('Unauthorized: only host can start battle');

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                if (room.state !== 'LOBBY') throw new Error('Battle already started');

                // Validate minimum requirements
                const validation = room.validateBattleStart();
                if (!validation.valid) {
                    throw new Error(validation.message);
                }

                room.startGame(hostInfo.hostTokenHash);

                // Emit per-player shuffled question to each student socket in the room
                this._broadcastQuestion(code, room);
                room.startTimer(this.io);

                if (callback) callback({ success: true });
            } catch (err) {
                const msg = err.message || 'Start battle failed';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // ── Host Controls: Pause / Resume / Terminate Room ─────────────────────

        // Host pauses the game
        socket.on('pause_game', (data, callback) => {
            try {
                const hostInfo = this.hostSockets.get(socket.id);
                if (!hostInfo) throw new Error('Unauthorized: only host can pause test');

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                room.pauseGame(this.io);
                if (callback) callback({ success: true, isPaused: true });
            } catch (err) {
                const msg = err.message || 'Failed to pause game';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // Host resumes the game
        socket.on('resume_game', (data, callback) => {
            try {
                const hostInfo = this.hostSockets.get(socket.id);
                if (!hostInfo) throw new Error('Unauthorized: only host can resume test');

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                room.resumeGame(this.io);
                if (callback) callback({ success: true, isPaused: false });
            } catch (err) {
                const msg = err.message || 'Failed to resume game';
                if (callback) callback({ success: false, error: msg });
                else socket.emit('error', { message: msg });
            }
        });

        // Host deletes/terminates the room
        socket.on('terminate_room', async (data, callback) => {
            try {
                const hostInfo = this.hostSockets.get(socket.id);
                if (!hostInfo) throw new Error('Unauthorized: only host can end/delete test');

                const code = this.socketToRoom.get(socket.id);
                if (!code) throw new Error('Not in a room');
                const room = this.rooms.get(code);
                if (!room) throw new Error('Room not found');

                const reason = data?.reason || 'Test was cancelled by teacher.';
                room.terminateGame(this.io, reason);

                // Update DB status to abandoned
                if (room.roomId) {
                    await pool.query(
                        `UPDATE rooms SET status = 'abandoned' WHERE id = $1`,
                        [room.roomId]
                    ).catch(e => console.error('DB update room abandoned failed:', e.message));
                }

                // Remove from active rooms map
                this.rooms.delete(code);

                if (callback) callback({ success: true });
            } catch (err) {
                const msg = err.message || 'Failed to terminate room';
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

        const isTeamMode = !!settings?.teamMode;
        const teamSizeLimit = settings?.teamSizeLimit || 4;
        const teamCount = settings?.teamCount !== undefined ? settings.teamCount : 2;
        const maxTeams = settings?.maxTeams || 10;
        const minPlayersPerTeam = settings?.minPlayersPerTeam || 1;
        const isPublic = !!settings?.isPublic;
        const battleName = settings?.battleName || null;

        // Persist room to DB with battle fields
        const insertRes = await pool.query(
            `INSERT INTO rooms (code, status, question_set_id, college_id, teacher_id, settings, host_token_hash, expires_at, is_public, battle_name, battle_type, max_teams, min_players_per_team)
             VALUES ($1, 'lobby', $2, $3, $4, $5, $6, NOW() + INTERVAL '4 hours', $7, $8, $9, $10, $11)
             RETURNING id`,
            [
                code, questionSetId, collegeId, teacherId, JSON.stringify(settings), hostTokenHash,
                isPublic,
                battleName,
                isTeamMode ? 'team_battle' : 'quiz',  // battle_type
                maxTeams,
                minPlayersPerTeam
            ]
        );
        const roomId = insertRes.rows[0].id;

        // Persist game_questions mappings
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const gqRes = await pool.query(
                `INSERT INTO game_questions (room_id, question_id, order_index) VALUES ($1, $2, $3) RETURNING id`,
                [roomId, q.id, i]
            );
            q.game_question_id = gqRes.rows[0].id;
        }
        
        // Initialize teams if Team Mode is enabled and pre-set team count > 0
        let teams = [];
        if (isTeamMode && teamCount > 0) {
            const teamColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
            for (let i = 0; i < teamCount; i++) {
                const teamName = `Team ${String.fromCharCode(65 + i)}`;
                const teamRes = await pool.query(
                    `INSERT INTO teams (room_id, name, score, color) VALUES ($1, $2, 0, $3) RETURNING *`,
                    [roomId, teamName, teamColors[i % teamColors.length]]
                );
                teams.push(teamRes.rows[0]);
            }
        }

        const room = new GameRoom(
            roomId, code, settings, hostTokenHash, questions,
            (finishedRoom) => this.handleGameFinished(finishedRoom),
            teams
        );
        room.teacherId = teacherId;
        room.questionSetId = questionSetId;

        this.rooms.set(code, room);
        return { code, roomId };
    }

    async loadRoomFromDb(code) {
        if (!code) return null;
        const upperCode = code.toUpperCase();
        if (this.rooms.has(upperCode)) return this.rooms.get(upperCode);

        try {
            const roomRes = await pool.query(
                `SELECT * FROM rooms WHERE code = $1 AND status IN ('lobby', 'active') AND (expires_at IS NULL OR expires_at > NOW())`,
                [upperCode]
            );
            if (roomRes.rows.length === 0) return null;
            const dbRoom = roomRes.rows[0];

            const qResult = await pool.query(
                `SELECT q.*, gq.order_index FROM questions q
                 JOIN game_questions gq ON gq.question_id = q.id
                 WHERE gq.room_id = $1 ORDER BY gq.order_index`,
                [dbRoom.id]
            );
            const teamsRes = await pool.query(
                `SELECT * FROM teams WHERE room_id = $1 ORDER BY id`,
                [dbRoom.id]
            );

            const room = new GameRoom(
                dbRoom.id, dbRoom.code, dbRoom.settings, dbRoom.host_token_hash, qResult.rows,
                (finishedRoom) => this.handleGameFinished(finishedRoom),
                teamsRes.rows
            );
            room.teacherId = dbRoom.teacher_id;
            room.questionSetId = dbRoom.question_set_id;
            if (dbRoom.status === 'active') {
                room.state = 'QUESTION_ACTIVE';
            }

            this.rooms.set(upperCode, room);
            return room;
        } catch (err) {
            console.error(`[SocketHandler] Failed to load room ${code} from DB:`, err.message);
            return null;
        }
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
