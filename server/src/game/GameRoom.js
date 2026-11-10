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
    constructor(roomId, code, settings, hostTokenHash, questions, onFinished, teams = []) {
        this.roomId = roomId;          // DB primary key (null if not persisted)
        this.code = code;
        this.settings = settings;      // { maxPlayers, advanceEarly, timePerQuestion?, teamMode, teamSizeLimit, teamCount }
        this.hostTokenHash = hostTokenHash;
        this.questions = questions;    // Array of DB rows from the questions table
        this.onFinished = onFinished;
        this.teams = teams;            // Array of team objects { id, name, score }

        this.state = 'LOBBY';          // LOBBY | QUESTION_ACTIVE | REVEAL | FINISHED
        this.players = new Map();      // sessionTokenHash → playerData
        this.socketToToken = new Map();// socketId → sessionTokenHash

        this.currentQuestionIndex = -1;
        this.questionStartMs = 0;
        this.questionDeadlineMs = 0;
        this.timer = null;
        this.autoAdvanceTimer = null;
        this.isPaused = false;
        this.remainingTimeMs = 0;

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
            // Assign to team fairly if team mode is enabled
            if (this.settings.teamMode && this.teams && this.teams.length > 0 && !teamId) {
                // Find team with least members
                const teamCounts = new Map(this.teams.map(t => [t.id, 0]));
                for (const p of this.players.values()) {
                    if (p.teamId) {
                        teamCounts.set(p.teamId, (teamCounts.get(p.teamId) || 0) + 1);
                    }
                }
                let minTeamId = this.teams[0].id;
                let minCount = Infinity;
                for (const [tId, count] of teamCounts.entries()) {
                    if (count < minCount) {
                        minCount = count;
                        minTeamId = tId;
                    }
                }
                
                if (minCount >= (this.settings.teamSizeLimit || 5)) {
                    throw new Error('All teams are full.');
                }
                
                teamId = minTeamId;
            }

            this.players.set(sessionTokenHash, {
                displayName,
                teamId,
                score: 0,
                streak: 0,
                answers: [],          // { qIndex, shuffledOptionChosen, isCorrect, points, elapsed }
                answeredCurrent: false,
                activeDoublePoints: false,
                activeTimeFreeze: false,
                powerups: { fifty_fifty: 1, double_points: 1, time_freeze: 1 },
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

    // ─── Team Battle Management ────────────────────────────────────────────────

    /**
     * Create a new team (host only)
     * @param {string} name - Team name
     * @param {string} [color] - Hex color code
     * @returns {object} Created team
     */
    createTeam(name, color, customId) {
        if (this.state !== 'LOBBY') throw new Error('Cannot create teams after battle started');
        if (!this.teams) this.teams = [];
        
        const teamId = customId || (this.teams.length > 0 ? Math.max(...this.teams.map(t => t.id)) + 1 : 1);
        const team = {
            id: teamId,
            name: name.trim(),
            score: 0,
            color: color || '#3b82f6',
        };
        this.teams.push(team);
        return team;
    }

    /**
     * Player joins a team
     * @param {string} token - Player session token
     * @param {number} teamId - Team ID to join
     * @returns {object} Result with team info
     */
    joinTeam(token, teamId) {
        if (this.state !== 'LOBBY') throw new Error('Cannot join team after battle started');
        
        const player = this.players.get(token);
        if (!player) throw new Error('Player not found');
        
        const team = this.teams?.find(t => t.id === teamId);
        if (!team) throw new Error('Team not found');
        
        // Check team capacity
        const teamSizeLimit = this.settings.teamSizeLimit || 4;
        const currentMembers = Array.from(this.players.values()).filter(p => p.teamId === teamId).length;
        if (currentMembers >= teamSizeLimit) {
            throw new Error('Team is full');
        }
        
        // Leave current team if any
        if (player.teamId) {
            player.teamId = null;
        }
        
        player.teamId = teamId;
        return { teamId: team.id, teamName: team.name };
    }

    /**
     * Player leaves their team
     * @param {string} token - Player session token
     */
    leaveTeam(token) {
        if (this.state !== 'LOBBY') throw new Error('Cannot leave team after battle started');
        
        const player = this.players.get(token);
        if (!player) throw new Error('Player not found');
        
        player.teamId = null;
    }

    /**
     * Host assigns player to team
     * @param {number} playerId - Player index in room (or sessionTokenHash)
     * @param {number|null} teamId - Team ID or null to unassign
     */
    assignTeam(playerId, teamId) {
        if (this.state !== 'LOBBY') throw new Error('Cannot assign teams after battle started');
        
        // Find player by ID (could be numeric index or token)
        let player = null;
        if (typeof playerId === 'number' && playerId < this.players.size) {
            // Treat as array index for backwards compatibility
            const entries = Array.from(this.players.entries());
            if (entries[playerId]) {
                player = entries[playerId][1];
            }
        } else {
            // Treat as sessionTokenHash
            player = this.players.get(playerId);
        }
        
        if (!player) throw new Error('Player not found');
        
        if (teamId !== null) {
            const team = this.teams?.find(t => t.id === teamId);
            if (!team) throw new Error('Team not found');
            
            // Check team capacity
            const teamSizeLimit = this.settings.teamSizeLimit || 4;
            const currentMembers = Array.from(this.players.values()).filter(p => p.teamId === teamId).length;
            if (currentMembers >= teamSizeLimit) {
                throw new Error('Team is full');
            }
            
            player.teamId = teamId;
        } else {
            player.teamId = null;
        }
    }

    /**
     * Set player ready status
     * @param {string} token - Player session token
     * @param {boolean} ready - Ready status
     */
    setPlayerReady(token, ready) {
        if (this.state !== 'LOBBY') throw new Error('Cannot change ready status after battle started');
        
        const player = this.players.get(token);
        if (!player) throw new Error('Player not found');
        
        player.isReady = ready === true;
    }

    /**
     * Validate if battle can start
     * @returns {object} { valid: boolean, message: string }
     */
    validateBattleStart() {
        const players = Array.from(this.players.values()).filter(p => p.displayName !== 'Host');
        
        if (players.length === 0) {
            return { valid: false, message: 'No players in the battle' };
        }
        
        if (this.settings.teamMode) {
            const playersWithTeams = players.filter(p => p.teamId);
            if (playersWithTeams.length === 0) {
                return { valid: false, message: 'No players assigned to teams' };
            }
            
            // Check that at least one team has players
            const teamsWithPlayers = new Set(playersWithTeams.map(p => p.teamId));
            if (teamsWithPlayers.size === 0) {
                return { valid: false, message: 'No teams have players' };
            }
            
            // Check minimum players per team if configured
            const minPlayersPerTeam = this.settings.minPlayersPerTeam || 1;
            for (const teamId of teamsWithPlayers) {
                const teamSize = playersWithTeams.filter(p => p.teamId === teamId).length;
                if (teamSize < minPlayersPerTeam) {
                    return { valid: false, message: `Team has fewer than ${minPlayersPerTeam} player(s)` };
                }
            }
        }
        
        return { valid: true };
    }

    /**
     * Get team state for lobby updates
     * @returns {object} { teams, unassignedPlayers }
     */
    getTeamState() {
        const players = Array.from(this.players.values()).map(p => ({
            id: p.id || null,
            displayName: p.displayName,
            teamId: p.teamId,
            isReady: p.isReady || false,
            connected: p.connected,
        }));
        
        const unassignedPlayers = players.filter(p => !p.teamId && p.displayName !== 'Host');
        const assignedPlayers = players.filter(p => p.teamId && p.displayName !== 'Host');
        
        const teams = (this.teams || []).map(t => {
            const members = assignedPlayers.filter(p => p.teamId === t.id);
            return {
                id: t.id,
                name: t.name,
                color: t.color || '#3b82f6',
                score: t.score || 0,
                members,
                memberCount: members.length,
            };
        });
        
        return { teams, unassignedPlayers };
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

        // Feature F: Adaptive Difficulty
        if (this.settings.adaptiveDifficulty && this.currentQuestionIndex > 0) {
            let correctCount = 0;
            let totalAnswered = 0;
            
            // Check performance on the PREVIOUS question
            const prevQ = this.questions[this.currentQuestionIndex - 1];
            for (const p of this.players.values()) {
                const ans = p.answers.find(a => a.qIndex === this.currentQuestionIndex - 1);
                if (ans) {
                    totalAnswered++;
                    if (ans.isCorrect) correctCount++;
                }
            }

            if (totalAnswered > 0) {
                const accuracy = correctCount / totalAnswered;
                let targetDifficulty = null;
                
                // >70% accuracy -> Harder question
                if (accuracy > 0.7) targetDifficulty = 'hard';
                // <40% accuracy -> Easier question
                else if (accuracy < 0.4) targetDifficulty = 'easy';
                else targetDifficulty = 'medium';

                // Find a matching question in the remaining pool
                if (targetDifficulty) {
                    let bestIdx = -1;
                    for (let i = this.currentQuestionIndex; i < this.questions.length; i++) {
                        if (this.questions[i].difficulty?.toLowerCase() === targetDifficulty) {
                            bestIdx = i;
                            break; // found an exact match
                        }
                    }
                    if (bestIdx !== -1 && bestIdx !== this.currentQuestionIndex) {
                        // Swap
                        const temp = this.questions[this.currentQuestionIndex];
                        this.questions[this.currentQuestionIndex] = this.questions[bestIdx];
                        this.questions[bestIdx] = temp;
                        console.log(`[Room ${this.code}] Adaptive Difficulty: accuracy ${(accuracy*100).toFixed(0)}%, swapped to ${targetDifficulty} question.`);
                    }
                }
            }
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
        if (this.timer) clearTimeout(this.timer);
        const timeToReveal = this.questionDeadlineMs - Date.now();
        this.timer = setTimeout(() => {
            this.revealAnswer(io);
        }, Math.max(0, timeToReveal));
    }

    pauseGame(io) {
        if (this.isPaused) return false;
        if (this.state !== 'QUESTION_ACTIVE' && this.state !== 'REVEAL') {
            throw new Error('Can only pause during an active question or reveal');
        }

        this.isPaused = true;

        if (this.state === 'QUESTION_ACTIVE') {
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            this.remainingTimeMs = Math.max(0, this.questionDeadlineMs - Date.now());
        } else if (this.state === 'REVEAL') {
            if (this.autoAdvanceTimer) {
                clearTimeout(this.autoAdvanceTimer);
                this.autoAdvanceTimer = null;
            }
        }

        if (io) {
            io.to(this.code).emit('game_paused', {
                state: this.state,
                remainingTimeMs: this.remainingTimeMs,
                message: 'Test has been paused by the teacher.'
            });
        }
        return true;
    }

    resumeGame(io) {
        if (!this.isPaused) return false;
        this.isPaused = false;

        if (this.state === 'QUESTION_ACTIVE') {
            const timeLimit = this.remainingTimeMs > 1000 ? this.remainingTimeMs : 3000;
            this.questionStartMs = Date.now();
            this.questionDeadlineMs = Date.now() + timeLimit;

            if (io) {
                const sockets = io?.sockets?.adapter?.rooms?.get(this.code);
                if (sockets) {
                    for (const socketId of sockets) {
                        const token = this.socketToToken.get(socketId);
                        if (token && this.players.has(token)) {
                            io.to(socketId).emit('game_resumed', {
                                deadlineMs: this.questionDeadlineMs,
                                remainingTimeMs: timeLimit,
                                questionState: this.getQuestionStateForPlayer(token)
                            });
                        } else {
                            io.to(socketId).emit('game_resumed', {
                                deadlineMs: this.questionDeadlineMs,
                                remainingTimeMs: timeLimit,
                                questionState: this.getQuestionState()
                            });
                        }
                    }
                } else {
                    io.to(this.code).emit('game_resumed', {
                        deadlineMs: this.questionDeadlineMs,
                        remainingTimeMs: timeLimit,
                        questionState: this.getQuestionState()
                    });
                }
            }

            this.startTimer(io);
        } else if (this.state === 'REVEAL') {
            if (io) {
                io.to(this.code).emit('game_resumed', {
                    state: 'REVEAL',
                    message: 'Resuming test...'
                });
            }

            this.autoAdvanceTimer = setTimeout(() => {
                if (this.state !== 'REVEAL' || this.isPaused) return;
                const qState = this.nextQuestion();
                if (qState) {
                    const sockets = io?.sockets?.adapter?.rooms?.get(this.code);
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
                    io?.to(this.code).emit('game_finished', this.getFinalResults());
                }
            }, 3000);
        }

        return true;
    }

    terminateGame(io, reason = 'Test was cancelled by teacher.') {
        if (this.timer) clearTimeout(this.timer);
        if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
        this.timer = null;
        this.autoAdvanceTimer = null;
        this.state = 'TERMINATED';
        this.isPaused = false;

        if (io) {
            io.to(this.code).emit('game_terminated', {
                reason,
                message: 'This test has been ended/cancelled by the teacher.'
            });
        }
    }

    revealAnswer(io) {
        if (this.state !== 'QUESTION_ACTIVE') return;
        this.state = 'REVEAL';

        // Break streaks for players who did not answer
        for (const p of this.players.values()) {
            if (!p.answeredCurrent) p.streak = 0;
        }

        const q = this.questions[this.currentQuestionIndex];
        const originalOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
        const originalCorrectIndex = Number(q.correct_option_index);
        const correctOptionText = originalOptions[originalCorrectIndex];
        const leaderboard = this.getLeaderboard();

        if (io) {
            const sockets = io.sockets?.adapter?.rooms?.get(this.code);
            if (sockets && sockets.size > 0) {
                for (const socketId of sockets) {
                    const token = this.socketToToken.get(socketId);
                    if (token && this.players.has(token)) {
                        const shuffled = this._getShuffledOptionsForPlayer(token, this.currentQuestionIndex);
                        const shuffledCorrectIndex = shuffled.mapping.indexOf(originalCorrectIndex);
                        io.to(socketId).emit('reveal', {
                            correctOptionIndex: shuffledCorrectIndex,
                            originalCorrectOptionIndex: originalCorrectIndex,
                            correctOptionText,
                            explanation: q.explanation || '',
                            leaderboard,
                        });
                    } else {
                        io.to(socketId).emit('reveal', {
                            correctOptionIndex: originalCorrectIndex,
                            originalCorrectOptionIndex: originalCorrectIndex,
                            correctOptionText,
                            explanation: q.explanation || '',
                            leaderboard,
                        });
                    }
                }
            } else {
                io.to(this.code).emit('reveal', {
                    correctOptionIndex: originalCorrectIndex,
                    originalCorrectOptionIndex: originalCorrectIndex,
                    correctOptionText,
                    explanation: q.explanation || '',
                    leaderboard,
                });
            }
        }

        // Auto-advance after 5 seconds
        if (this.autoAdvanceTimer) clearTimeout(this.autoAdvanceTimer);
        this.autoAdvanceTimer = setTimeout(() => {
            if (this.state !== 'REVEAL' || this.isPaused) return;
            const qState = this.nextQuestion();
            if (qState) {
                const sockets = io?.sockets?.adapter?.rooms?.get(this.code);
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
                io?.to(this.code).emit('game_finished', this.getFinalResults());
            }
        }, 5000);
    }

    // ─── Power-ups ──────────────────────────────────────────────────────────

    usePowerup(socketId, powerupType) {
        if (this.state !== 'QUESTION_ACTIVE') throw new Error('Powerups can only be used during an active question');
        
        const token = this.socketToToken.get(socketId);
        if (!token) throw new Error('Unknown player');
        
        const player = this.players.get(token);
        if (!player) throw new Error('Unknown player');
        
        if (!player.powerups[powerupType] || player.powerups[powerupType] <= 0) {
            throw new Error('You do not have any of this power-up left');
        }
        
        if (player.answeredCurrent) {
            throw new Error('You already answered this question');
        }
        
        // Deduct the powerup
        player.powerups[powerupType]--;
        
        if (powerupType === 'double_points') {
            player.activeDoublePoints = true;
            return { success: true, powerupType, message: 'Double Points activated!' };
        } else if (powerupType === 'time_freeze') {
            player.activeTimeFreeze = true;
            return { success: true, powerupType, message: 'Time Freeze activated!' };
        } else if (powerupType === 'fifty_fifty') {
            // Find 2 incorrect options
            const q = this.questions[this.currentQuestionIndex];
            const shuffledOptions = this._getShuffledOptionsForPlayer(token, this.currentQuestionIndex);
            
            const incorrectIndices = [];
            for (let i = 0; i < shuffledOptions.mapping.length; i++) {
                if (shuffledOptions.mapping[i] !== Number(q.correct_option_index)) {
                    incorrectIndices.push(i);
                }
            }
            
            // Randomly pick 2 to remove
            const removedIndices = [];
            while (removedIndices.length < 2 && incorrectIndices.length > 0) {
                const idx = Math.floor(Math.random() * incorrectIndices.length);
                removedIndices.push(incorrectIndices.splice(idx, 1)[0]);
            }
            
            return { success: true, powerupType, removedIndices, message: '50/50 activated!' };
        }
        
        throw new Error('Unknown powerup type');
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
        const isCorrect = originalOptionIndex === Number(q.correct_option_index);

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
            player.activeDoublePoints,
            player.activeTimeFreeze
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
            settings: this.settings || {},
            teams: this.teams || [],
            teamState: this.settings?.teamMode ? this.getTeamState() : undefined,
            roomState: this.getLobbyState(),
            players: Array.from(this.players.values()).map(p => ({
                displayName: p.displayName,
                connected: p.connected,
                teamId: p.teamId,
                isReady: p.isReady || false,
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
            const originalOptions = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
            const originalCorrectIndex = Number(q.correct_option_index);
            const shuffled = this._getShuffledOptionsForPlayer(sessionTokenHash, this.currentQuestionIndex);
            const shuffledCorrectIndex = shuffled.mapping.indexOf(originalCorrectIndex);
            return {
                ...base,
                question: this.getQuestionStateForPlayer(sessionTokenHash),
                reveal: {
                    correctOptionIndex: shuffledCorrectIndex,
                    originalCorrectOptionIndex: originalCorrectIndex,
                    correctOptionText: originalOptions[originalCorrectIndex],
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
        const base = {
            code: this.code,
            state: this.state,
            settings: { 
                maxPlayers: this.settings.maxPlayers || 50,
                teamMode: !!this.settings.teamMode,
                teamSizeLimit: this.settings.teamSizeLimit,
                teamCount: this.settings.teamCount,
                maxTeams: this.settings.maxTeams,
                minPlayersPerTeam: this.settings.minPlayersPerTeam,
            },
            teams: this.teams || [],
            players: Array.from(this.players.values()).map(p => ({
                displayName: p.displayName,
                connected: p.connected,
                teamId: p.teamId,
                isReady: p.isReady || false,
            })),
        };
        
        // Add team state for battle mode
        if (this.settings?.teamMode) {
            base.teamState = this.getTeamState();
        }
        
        return base;
    }

    /**
     * Question state WITHOUT correct answer, with options shuffled for this player.
     */
    getQuestionStateForPlayer(sessionTokenHash) {
        const q = this.questions[this.currentQuestionIndex];
        const player = this.players.get(sessionTokenHash);
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
            mapping: shuffled.mapping,      // mapping[shuffledPos] = originalPos
            image_url: q.image_url || null,
            deadlineMs: this.questionDeadlineMs,
            serverNow: Date.now(),
            timeLimitMs,
            powerups: player ? player.powerups : {},
            activeDoublePoints: player ? player.activeDoublePoints : false,
            activeTimeFreeze: player ? player.activeTimeFreeze : false,
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
            serverNow: Date.now(),
            timeLimitMs,
        };
    }

    getLeaderboard() {
        const list = Array.from(this.players.values()).map(p => ({
            displayName: p.displayName,
            score: p.score,
            streak: p.streak,
            teamId: p.teamId
        }));
        // Primary: score descending. Tie-break: displayName ascending (deterministic).
        list.sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
        
        let teamLeaderboard = [];
        if (this.settings?.teamMode && this.teams) {
            teamLeaderboard = this.teams.map(t => {
                const teamMembers = list.filter(p => p.teamId === t.id);
                const teamScore = teamMembers.reduce((sum, p) => sum + p.score, 0);
                // Calculate contribution percentages
                const membersWithContribution = teamMembers.map(m => ({
                    ...m,
                    contributionPercent: teamScore > 0 ? Math.round((m.score / teamScore) * 100 * 100) / 100 : 0
                }));
                return { 
                    id: t.id, 
                    name: t.name, 
                    color: t.color || '#3b82f6',
                    score: teamScore,
                    members: membersWithContribution,
                    memberCount: membersWithContribution.length
                };
            }).sort((a, b) => b.score - a.score);
        }

        return { players: list, teams: teamLeaderboard };
    }

    getFinalResults() {
        const leaderboard = this.getLeaderboard();
        
        // Build battle results with team details and individual contributions
        let battleResults = null;
        if (this.settings?.teamMode && this.teams) {
            const players = leaderboard.players;
            
            // Team results with member details
            const teamResults = leaderboard.teams.map((team, rank) => ({
                rank: rank + 1,
                id: team.id,
                name: team.name,
                color: team.color,
                totalScore: team.score,
                memberCount: team.memberCount,
                members: team.members.map((m, idx) => ({
                    rank: idx + 1,
                    displayName: m.displayName,
                    score: m.score,
                    contributionPercent: m.contributionPercent,
                    isMVP: idx === 0 // Top scorer in team is MVP
                }))
            }));
            
            // Individual results with contribution
            const individualResults = players.map((p, idx) => ({
                rank: idx + 1,
                displayName: p.displayName,
                score: p.score,
                teamId: p.teamId,
                teamName: p.teamId ? this.teams.find(t => t.id === p.teamId)?.name : null,
                contributionPercent: p.teamId && teamResults.length > 0 
                    ? (() => {
                        const team = teamResults.find(t => t.id === p.teamId);
                        return team && team.totalScore > 0 ? Math.round((p.score / team.totalScore) * 100 * 100) / 100 : 0;
                    })()
                    : 0,
                isMVP: false // Will be set per team
            }));
            
            // Mark MVPs
            for (const team of teamResults) {
                if (team.members.length > 0) {
                    const mvpName = team.members[0].displayName;
                    const mvp = individualResults.find(p => p.displayName === mvpName);
                    if (mvp) mvp.isMVP = true;
                }
            }
            
            // Overall MVP (highest individual score)
            const overallMVP = individualResults.length > 0 ? individualResults[0] : null;
            
            battleResults = {
                teamResults,
                individualResults,
                mvp: overallMVP ? {
                    displayName: overallMVP.displayName,
                    score: overallMVP.score,
                    teamName: overallMVP.teamName
                } : null
            };
        }
        
        return {
            leaderboard,
            battleResults,
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
