/**
 * GameRoom — server-side room state machine.
 *
 * Key design decisions:
 *   - Per-question time limit is taken from q.time_limit (set by teacher), falling
 *     back to settings.timePerQuestion, then 20s.
 *   - Options are shuffled per-player using a seeded permutation so:
 *       (a) each student sees a different order (anti-copy),
 *       (b) the permutation is deterministic from (playerToken, questionIndex)
 *           so reconnecting players get the SAME shuffle,
 *       (c) the server maps shuffled index → original index when scoring.
 *   - Correct answer index is NEVER sent to clients before the question closes.
 *   - Score is calculated exclusively on the server using server receipt time.
 *   - Disconnection does not pause the global timer.
 *
 * Latency fairness note:
 *   The server compensates up to MAX_LATENCY_COMPENSATION_MS (500ms default)
 *   using the median RTT measured via periodic pings. This cannot be perfect
 *   for every network condition; it is best-effort and documented as such.
 */

const { calculateScore } = require('./scoring');
const crypto = require('crypto');

/**
 * Seeded Fisher-Yates shuffle using a simple LCG.
 * Returns a NEW array; does not mutate the original.
 * The seed makes this fully deterministic and reproducible.
 */
function seededShuffle(arr, seed) {
    const a = [...arr];
    // LCG parameters (Numerical Recipes)
    let s = seed >>> 0;
    const next = () => {
        s = ((s * 1664525) + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0x100000000;
    };
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Generate a 32-bit numeric seed from two strings.
 * Used to make the shuffle deterministic per (player, question).
 */
function makeSeed(playerToken, questionIndex) {
    const raw = `${playerToken}::${questionIndex}`;
    const h = crypto.createHash('sha256').update(raw).digest();
    return h.readUInt32BE(0);
}

class GameRoom {
    constructor(roomId, code, settings, hostTokenHash, questions, onFinished) {
        this.roomId = roomId;          // DB primary key (null if not persisted)
        this.code = code;
        this.settings = settings;      // { maxPlayers, advanceEarly, timePerQuestion? }
        this.hostTokenHash = hostTokenHash;
        this.questions = questions;    // Array of DB rows from the questions table
        this.onFinished = onFinished;

        this.state = 'LOBBY';          // LOBBY | QUESTION_ACTIVE | REVEAL | FINISHED
        this.players = new Map();      // sessionTokenHash → playerData
        this.socketToToken = new Map();// socketId → sessionTokenHash

        this.currentQuestionIndex = -1;
        this.questionStartMs = 0;
        this.questionDeadlineMs = 0;
        this.timer = null;

        this.pings = new Map();        // tokenHash → number[]
    }

    // ─── Player management ──────────────────────────────────────────────────

    addPlayer(socketId, sessionTokenHash, displayName, teamId = null) {
        if (this.state !== 'LOBBY' && !this.players.has(sessionTokenHash)) {
            throw new Error('Game already in progress');
        }
        if (
            this.players.size >= (this.settings.maxPlayers || 50) &&
            !this.players.has(sessionTokenHash)
        ) {
            throw new Error('Room is full');
        }

        this.socketToToken.set(socketId, sessionTokenHash);

        if (!this.players.has(sessionTokenHash)) {
            this.players.set(sessionTokenHash, {
                displayName,
                teamId,
                score: 0,
                streak: 0,
                answers: [],          // { qIndex, shuffledOptionChosen, isCorrect, points, elapsed }
                answeredCurrent: false,
                activeDoublePoints: false,
                connected: true,
            });
        } else {
            const p = this.players.get(sessionTokenHash);
            p.connected = true;
            // Update socket mapping (new socket after reconnect)
        }

        return this.getLobbyState();
    }

    removePlayer(socketId) {
        const token = this.socketToToken.get(socketId);
        if (token && this.players.has(token)) {
            this.players.get(token).connected = false;
            this.socketToToken.delete(socketId);
        }
    }

    // ─── Game control ────────────────────────────────────────────────────────

    startGame(hostTokenHash) {
        if (this.hostTokenHash !== hostTokenHash) throw new Error('Unauthorized');
        if (this.state !== 'LOBBY') throw new Error('Game already started');
        if (this.questions.length === 0) throw new Error('No questions in this test');
        this.nextQuestion();
    }

    nextQuestion() {
        this.currentQuestionIndex++;

        if (this.currentQuestionIndex >= this.questions.length) {
            this.finishGame();
            return null;  // Signal: no more questions
        }

        this.state = 'QUESTION_ACTIVE';
        this.questionStartMs = Date.now();

        // Use per-question time limit set by teacher; fall back to room setting; then 20s
        const q = this.questions[this.currentQuestionIndex];
        const timeLimitMs = ((q.time_limit || 0) * 1000) ||
            this.settings.timePerQuestion ||
            20000;
        this.questionDeadlineMs = this.questionStartMs + timeLimitMs;

        for (const p of this.players.values()) {
            p.answeredCurrent = false;
            p.activeDoublePoints = false;
        }

        return this.getQuestionState();
    }

    startTimer(io) {
        const timeToReveal = this.questionDeadlineMs - Date.now();
        this.timer = setTimeout(() => {
            this.revealAnswer(io);
        }, Math.max(0, timeToReveal));
    }

    revealAnswer(io) {
        if (this.state !== 'QUESTION_ACTIVE') return;
        this.state = 'REVEAL';

        // Break streaks for players who did not answer
        for (const p of this.players.values()) {
            if (!p.answeredCurrent) p.streak = 0;
        }

        const q = this.questions[this.currentQuestionIndex];
        io.to(this.code).emit('reveal', {
            correctOptionIndex: q.correct_option_index,
            explanation: q.explanation || '',
            leaderboard: this.getLeaderboard(),
        });

        // Auto-advance after 5 seconds
        setTimeout(() => {
            if (this.state !== 'REVEAL') return;
            const qState = this.nextQuestion();
            if (qState) {
                const sockets = io.sockets.adapter.rooms.get(this.code);
                if (sockets) {
                    for (const socketId of sockets) {
                        const token = this.socketToToken.get(socketId);
                        if (token && this.players.has(token)) {
                            io.to(socketId).emit('question_active', this.getQuestionStateForPlayer(token));
                        } else {
                            io.to(socketId).emit('question_active', qState);
                        }
                    }
                }
                this.startTimer(io);
            } else {
                io.to(this.code).emit('game_finished', this.getFinalResults());
            }
        }, 5000);
    }

    // ─── Answer submission ───────────────────────────────────────────────────

    /**
     * Submit an answer for a player.
     * @param {string} socketId
     * @param {number} shuffledOptionIndex  — the index as seen by THIS player (shuffled)
     * @param {object} io                   — Socket.IO server (for live leaderboard broadcast)
     * @returns {boolean} true if early reveal should be triggered
     */
    submitAnswer(socketId, shuffledOptionIndex, io) {
        if (this.state !== 'QUESTION_ACTIVE') throw new Error('Not accepting answers');

        const token = this.socketToToken.get(socketId);
        if (!token) throw new Error('Unknown player');

        const player = this.players.get(token);
        if (!player) throw new Error('Unknown player');
        if (player.answeredCurrent) throw new Error('Already answered');

        const q = this.questions[this.currentQuestionIndex];
        const receiptTime = Date.now();

        // Map the shuffled option index back to the original option index
        const shuffledOptions = this._getShuffledOptionsForPlayer(token, this.currentQuestionIndex);
        const originalOptionIndex = shuffledOptions.mapping[shuffledOptionIndex];
        const isCorrect = originalOptionIndex === q.correct_option_index;

        const timeLimitMs = ((q.time_limit || 0) * 1000) ||
            this.settings.timePerQuestion ||
            20000;

        // Latency compensation: use median of last 5 pings
        const pings = this.pings.get(token) || [0];
        const sorted = [...pings].sort((a, b) => a - b);
        const medianPing = sorted[Math.floor(sorted.length / 2)];

        const result = calculateScore(
            isCorrect,
            this.questionStartMs,
            receiptTime,
            timeLimitMs,
            player.streak,
            q.difficulty,
            medianPing,
            player.activeDoublePoints
        );

        if (!result.isLate) {
            player.score += result.points;
            if (isCorrect) player.streak++;
            else player.streak = 0;
        }

        player.answeredCurrent = true;
        player.answers.push({
            qIndex: this.currentQuestionIndex,
            shuffledOptionChosen: shuffledOptionIndex,
            originalOptionChosen: originalOptionIndex,
            isCorrect: !result.isLate && isCorrect,
            points: result.points,
            elapsed: result.compensatedElapsedMs,
        });

        // Broadcast provisional leaderboard after every answer
        if (io) {
            io.to(this.code).emit('score_update', this.getLeaderboard());
        }

        // Advance early if all connected players answered
        if (this.settings.advanceEarly) {
            const allAnswered = Array.from(this.players.values()).every(
                p => p.answeredCurrent || !p.connected
            );
            if (allAnswered && this.timer) {
                clearTimeout(this.timer);
                return true;
            }
        }

        return false;
    }

    // ─── Reconnection support ────────────────────────────────────────────────

    /**
     * Returns the full state a reconnecting player needs to resume.
     * Does NOT include the correct answer if the question is still active.
     */
    getReconnectState(sessionTokenHash) {
        const player = this.players.get(sessionTokenHash);
        if (!player) return null;

        const base = {
            state: this.state,
            code: this.code,
            score: player.score,
            streak: player.streak,
            players: Array.from(this.players.values()).map(p => ({
                displayName: p.displayName,
                connected: p.connected,
            })),
        };

        if (this.state === 'QUESTION_ACTIVE') {
            const qState = this.getQuestionStateForPlayer(sessionTokenHash);
            return {
                ...base,
                question: qState,
                alreadyAnswered: player.answeredCurrent,
            };
        }

        if (this.state === 'REVEAL') {
            const q = this.questions[this.currentQuestionIndex];
            return {
                ...base,
                question: this.getQuestionStateForPlayer(sessionTokenHash),
                reveal: {
                    correctOptionIndex: q.correct_option_index,
                    explanation: q.explanation || '',
                    leaderboard: this.getLeaderboard(),
                },
                alreadyAnswered: player.answeredCurrent,
            };
        }

        if (this.state === 'FINISHED') {
            return { ...base, finalResults: this.getFinalResults() };
        }

        return base;
    }

    // ─── Option shuffling ─────────────────────────────────────────────────────

    /**
     * Returns { options: string[], mapping: number[] } for a player+question.
     * mapping[shuffledIndex] = originalIndex.
     * This is deterministic: same inputs always produce the same shuffle.
     */
    _getShuffledOptionsForPlayer(playerToken, questionIndex) {
        const q = this.questions[questionIndex];
        const originalOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
        const indices = originalOptions.map((_, i) => i);
        const seed = makeSeed(playerToken, questionIndex);
        const shuffledIndices = seededShuffle(indices, seed);

        return {
            options: shuffledIndices.map(i => originalOptions[i]),
            mapping: shuffledIndices, // mapping[shuffledPos] = originalPos
        };
    }

    // ─── State serializers ────────────────────────────────────────────────────

    getLobbyState() {
        return {
            code: this.code,
            state: this.state,
            settings: { maxPlayers: this.settings.maxPlayers || 50 },
            players: Array.from(this.players.values()).map(p => ({
                displayName: p.displayName,
                connected: p.connected,
            })),
        };
    }

    /**
     * Question state WITHOUT correct answer, with options shuffled for this player.
     */
    getQuestionStateForPlayer(sessionTokenHash) {
        const q = this.questions[this.currentQuestionIndex];
        const shuffled = this._getShuffledOptionsForPlayer(sessionTokenHash, this.currentQuestionIndex);
        const timeLimitMs = ((q.time_limit || 0) * 1000) ||
            this.settings.timePerQuestion ||
            20000;
        return {
            index: this.currentQuestionIndex,
            total: this.questions.length,
            text: q.text,
            topic: q.topic,
            difficulty: q.difficulty,
            options: shuffled.options,      // shuffled for this player
            image_url: q.image_url || null,
            deadlineMs: this.questionDeadlineMs,
            timeLimitMs,
        };
    }

    /**
     * Generic question state (same options for all — used for host view only).
     * DO NOT send this to students during an active question.
     */
    getQuestionState() {
        const q = this.questions[this.currentQuestionIndex];
        const timeLimitMs = ((q.time_limit || 0) * 1000) ||
            this.settings.timePerQuestion ||
            20000;
        return {
            index: this.currentQuestionIndex,
            total: this.questions.length,
            text: q.text,
            topic: q.topic,
            difficulty: q.difficulty,
            options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            image_url: q.image_url || null,
            deadlineMs: this.questionDeadlineMs,
            timeLimitMs,
        };
    }

    getLeaderboard() {
        const list = Array.from(this.players.values()).map(p => ({
            displayName: p.displayName,
            score: p.score,
            streak: p.streak,
        }));
        // Primary: score descending. Tie-break: displayName ascending (deterministic).
        list.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
        return list;
    }

    getFinalResults() {
        const leaderboard = this.getLeaderboard();
        return {
            leaderboard,
            totalQuestions: this.questions.length,
        };
    }

    // ─── Ping tracking ────────────────────────────────────────────────────────

    recordPing(socketId, rtt) {
        const token = this.socketToToken.get(socketId);
        if (!token) return;
        let arr = this.pings.get(token);
        if (!arr) { arr = []; this.pings.set(token, arr); }
        arr.push(rtt);
        if (arr.length > 5) arr.shift();
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    finishGame() {
        this.state = 'FINISHED';
        if (this.onFinished) this.onFinished(this);
    }
}

module.exports = { GameRoom, seededShuffle, makeSeed };
