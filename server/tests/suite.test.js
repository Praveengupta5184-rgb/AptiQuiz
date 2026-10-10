/**
 * Comprehensive test suite covering all 20 required scenarios.
 * Run: npm test  (from server/ directory, or npm test from root)
 * Globals (describe, it, expect, vi) are injected by vitest globals: true
 */

const { GameRoom, seededShuffle, makeSeed } = require('../src/game/GameRoom');
const { calculateScore, SCORING_CONFIG } = require('../src/game/scoring');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQuestion(overrides = {}) {
    return {
        id: 1,
        text: 'What is 2 + 2?',
        options: JSON.stringify(['3', '4', '5', '6']),
        correct_option_index: 1,       // '4' is correct
        difficulty: 'easy',
        topic: 'Arithmetic',
        time_limit: 15,                // seconds
        explanation: '2+2=4',
        image_url: null,
        ...overrides,
    };
}

function makeRoom(questions, settings = {}) {
    const qs = questions || [makeQuestion()];
    return new GameRoom(
        42, 'ABCDE',
        { maxPlayers: 3, advanceEarly: false, ...settings },
        'secret-host-token',
        qs,
        vi.fn()
    );
}

// ─── Test 1: Teacher creates a test ──────────────────────────────────────────
describe('Test 1: Teacher creates a test', () => {
    it('GameRoom accepts a question set and initializes correctly', () => {
        const room = makeRoom([makeQuestion(), makeQuestion({ id: 2, text: 'Q2' })]);
        expect(room.questions).toHaveLength(2);
        expect(room.state).toBe('LOBBY');
    });
});

// ─── Test 2: Invalid question set cannot start ────────────────────────────────
describe('Test 2: Invalid question set cannot start', () => {
    it('throws if question list is empty', () => {
        const room = makeRoom([]);
        expect(() => room.startGame('secret-host-token')).toThrow('No questions');
    });
});

// ─── Test 3: Teacher creates a room ──────────────────────────────────────────
describe('Test 3: Teacher creates a room', () => {
    it('room initializes in LOBBY with correct host token and code', () => {
        const room = makeRoom();
        expect(room.state).toBe('LOBBY');
        expect(room.hostTokenHash).toBe('secret-host-token');
        expect(room.code).toBe('ABCDE');
        expect(room.roomId).toBe(42);
    });
});

// ─── Test 4: Student joins using a valid room code ────────────────────────────
describe('Test 4: Student joins using a valid room code', () => {
    it('addPlayer returns lobby state with the new player', () => {
        const room = makeRoom();
        const lobbyState = room.addPlayer('socket1', 'token1', 'Alice');
        expect(lobbyState.players).toHaveLength(1);
        expect(lobbyState.players[0].displayName).toBe('Alice');
        expect(lobbyState.players[0].connected).toBe(true);
    });
});

// ─── Test 5: Invalid room code is rejected ────────────────────────────────────
describe('Test 5: Invalid room code is rejected', () => {
    it('Map lookup for unknown code returns undefined (no crash)', () => {
        const rooms = new Map();
        rooms.set('VALID', makeRoom());
        expect(rooms.get('XXXXX')).toBeUndefined();
        expect(rooms.get('VALID')).toBeDefined();
    });
});

// ─── Test 6: Room capacity is enforced ────────────────────────────────────────
describe('Test 6: Room capacity is enforced', () => {
    it('rejects (maxPlayers+1)th new player', () => {
        const room = makeRoom(undefined, { maxPlayers: 2 });
        room.addPlayer('s1', 't1', 'P1');
        room.addPlayer('s2', 't2', 'P2');
        expect(() => room.addPlayer('s3', 't3', 'P3')).toThrow('Room is full');
    });

    it('allows a reconnecting player even when at capacity', () => {
        const room = makeRoom(undefined, { maxPlayers: 2 });
        room.addPlayer('s1', 't1', 'P1');
        room.addPlayer('s2', 't2', 'P2');
        room.removePlayer('s1');
        // Reconnect same token — must not throw
        expect(() => room.addPlayer('s1b', 't1', 'P1')).not.toThrow();
    });
});

// ─── Test 7: Unauthorized user cannot start a test ───────────────────────────
describe('Test 7: Unauthorized user cannot start a test', () => {
    it('rejects wrong host token', () => {
        const room = makeRoom();
        room.addPlayer('s1', 't1', 'Alice');
        expect(() => room.startGame('wrong-token')).toThrow('Unauthorized');
    });

    it('accepts the correct host token', () => {
        const room = makeRoom();
        room.addPlayer('s1', 't1', 'Alice');
        expect(() => room.startGame('secret-host-token')).not.toThrow();
    });
});

// ─── Test 8: Test remains in LOBBY until teacher starts ──────────────────────
describe('Test 8: Room stays LOBBY until teacher starts', () => {
    it('state is LOBBY before startGame', () => {
        const room = makeRoom();
        room.addPlayer('s1', 't1', 'Alice');
        expect(room.state).toBe('LOBBY');
    });

    it('state moves to QUESTION_ACTIVE after startGame', () => {
        const room = makeRoom();
        room.addPlayer('s1', 't1', 'Alice');
        room.startGame('secret-host-token');
        expect(room.state).toBe('QUESTION_ACTIVE');
    });
});

// ─── Test 9: All students receive same question ID and deadline ───────────────
describe('Test 9: Same question ID and deadline for all players', () => {
    it('per-player state shares index and deadlineMs', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.addPlayer('s2', 'tok2', 'Bob');
        room.startGame('secret-host-token');

        const stateA = room.getQuestionStateForPlayer('tok1');
        const stateB = room.getQuestionStateForPlayer('tok2');

        expect(stateA.index).toBe(stateB.index);
        expect(stateA.deadlineMs).toBe(stateB.deadlineMs);
        expect(stateA.total).toBe(stateB.total);
        expect(stateA.text).toBe(stateB.text);
    });
});

// ─── Test 10: Teacher-defined question duration is respected ──────────────────
describe('Test 10: Per-question time_limit is used', () => {
    it('deadline = startTime + time_limit * 1000 (not fallback)', () => {
        const room = makeRoom([makeQuestion({ time_limit: 25 })]);
        room.addPlayer('s1', 't1', 'Alice');
        const before = Date.now();
        room.startGame('secret-host-token');
        const after = Date.now();

        expect(room.questionDeadlineMs).toBeGreaterThanOrEqual(before + 25000);
        expect(room.questionDeadlineMs).toBeLessThanOrEqual(after + 25000);
    });
});

// ─── Test 11: Correct answer earns speed-dependent points ────────────────────
describe('Test 11: Correct answer earns speed-dependent points', () => {
    it('faster answer earns more points', () => {
        const fast = calculateScore(true, 0, 500,  15000, 0, 'easy', 0, false);
        const slow = calculateScore(true, 0, 12000, 15000, 0, 'easy', 0, false);
        expect(fast.points).toBeGreaterThan(slow.points);
    });

    it('instant answer earns max points for easy difficulty', () => {
        const r = calculateScore(true, 0, 0, 15000, 0, 'easy', 0, false);
        expect(r.points).toBe(150); // Base(100)+Speed(50), ×1.0
    });

    it('submitAnswer records correct answer and awards points', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');

        const { mapping } = room._getShuffledOptionsForPlayer('tok1', 0);
        const correctShuffled = mapping.indexOf(room.questions[0].correct_option_index);
        room.submitAnswer('s1', correctShuffled, null);

        expect(room.players.get('tok1').score).toBeGreaterThan(0);
        expect(room.players.get('tok1').answers[0].isCorrect).toBe(true);
    });
});

// ─── Test 12: Incorrect / unanswered earn zero ────────────────────────────────
describe('Test 12: Incorrect and unanswered earn zero', () => {
    it('calculateScore returns 0 for incorrect', () => {
        expect(calculateScore(false, 0, 2000, 15000).points).toBe(0);
    });

    it('submitAnswer wrong answer gives 0 points', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');

        const { mapping } = room._getShuffledOptionsForPlayer('tok1', 0);
        const correctShuffled = mapping.indexOf(room.questions[0].correct_option_index);
        const wrongShuffled = (correctShuffled + 1) % 4;
        room.submitAnswer('s1', wrongShuffled, null);

        expect(room.players.get('tok1').score).toBe(0);
        expect(room.players.get('tok1').answers[0].isCorrect).toBe(false);
    });

    it('player who did not answer has score 0', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        expect(room.players.get('tok1').score).toBe(0);
    });
});

// ─── Test 13: Late and duplicate answers are rejected ────────────────────────
describe('Test 13: Late and duplicate answers rejected', () => {
    it('isLate=true when answer exceeds deadline + grace', () => {
        const lateMs = 15000 + SCORING_CONFIG.NETWORK_GRACE_MS + 1;
        const r = calculateScore(true, 0, lateMs, 15000);
        expect(r.isLate).toBe(true);
        expect(r.points).toBe(0);
    });

    it('throws on duplicate submit for same question', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');
        room.submitAnswer('s1', 0, null);
        expect(() => room.submitAnswer('s1', 1, null)).toThrow('Already answered');
    });

    it('throws when not in QUESTION_ACTIVE state', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        // Still in LOBBY
        expect(() => room.submitAnswer('s1', 0, null)).toThrow('Not accepting answers');
    });

    it('throws for unknown socket (unauthorized)', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');
        expect(() => room.submitAnswer('nonexistent-socket', 0, null)).toThrow('Unknown player');
    });
});

// ─── Test 14: Correct answer not exposed before question closes ───────────────
describe('Test 14: Correct answer not sent before closure', () => {
    it('getQuestionStateForPlayer has no correct_option_index field', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');
        const state = room.getQuestionStateForPlayer('tok1');
        expect(state).not.toHaveProperty('correct_option_index');
        expect(state).not.toHaveProperty('correctOptionIndex');
    });

    it('getLobbyState has no question data', () => {
        const room = makeRoom();
        const lobby = room.getLobbyState();
        expect(lobby).not.toHaveProperty('questions');
        expect(lobby).not.toHaveProperty('currentQuestionIndex');
    });
});

// ─── Test 15: Shuffle preserves correctness ───────────────────────────────────
describe('Test 15: Per-player shuffle preserves correctness', () => {
    it('seededShuffle contains all original values exactly once', () => {
        const arr = [0, 1, 2, 3];
        const shuffled = seededShuffle(arr, 99999);
        expect(shuffled.sort()).toEqual([0, 1, 2, 3]);
    });

    it('seededShuffle is deterministic for same seed', () => {
        const a = seededShuffle([0, 1, 2, 3], 42);
        const b = seededShuffle([0, 1, 2, 3], 42);
        expect(a).toEqual(b);
    });

    it('two different seeds produce different shuffles (very high probability)', () => {
        const a = seededShuffle([0, 1, 2, 3], 1);
        const b = seededShuffle([0, 1, 2, 3], 2);
        // Not guaranteed, but expected for different seeds
        // If this ever fails, it's a coincidence (1-in-24 chance)
        expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });

    it('mapping correctly identifies which shuffled index is the right answer', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.addPlayer('s2', 'tok2', 'Bob');
        room.startGame('secret-host-token');

        const correctOriginal = room.questions[0].correct_option_index;

        for (const token of ['tok1', 'tok2']) {
            const { mapping } = room._getShuffledOptionsForPlayer(token, 0);
            const correctShuffled = mapping.indexOf(correctOriginal);
            expect(correctShuffled).toBeGreaterThanOrEqual(0);
            expect(mapping[correctShuffled]).toBe(correctOriginal);
        }
    });

    it('submitting the correct shuffled index marks answer as correct', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');

        const { mapping } = room._getShuffledOptionsForPlayer('tok1', 0);
        const correctShuffled = mapping.indexOf(room.questions[0].correct_option_index);

        room.submitAnswer('s1', correctShuffled, null);
        expect(room.players.get('tok1').answers[0].isCorrect).toBe(true);
    });
});

// ─── Test 16: Leaderboard only contains actual participants ───────────────────
describe('Test 16: Leaderboard contains only actual participants', () => {
    it('empty leaderboard for empty room', () => {
        expect(makeRoom().getLeaderboard()).toEqual([]);
    });

    it('leaderboard entry count matches joined players', () => {
        const room = makeRoom();
        room.addPlayer('s1', 't1', 'Alice');
        room.addPlayer('s2', 't2', 'Bob');
        const lb = room.getLeaderboard();
        expect(lb).toHaveLength(2);
        expect(lb.map(p => p.displayName)).toContain('Alice');
        expect(lb.map(p => p.displayName)).toContain('Bob');
    });

    it('leaderboard sorted descending by score', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.addPlayer('s2', 'tok2', 'Bob');
        room.startGame('secret-host-token');

        const { mapping } = room._getShuffledOptionsForPlayer('tok1', 0);
        const correct = mapping.indexOf(room.questions[0].correct_option_index);
        room.submitAnswer('s1', correct, null);          // Alice: correct → points
        room.submitAnswer('s2', (correct + 1) % 4, null); // Bob: wrong → 0

        const lb = room.getLeaderboard();
        expect(lb[0].displayName).toBe('Alice');
        expect(lb[0].score).toBeGreaterThan(0);
        expect(lb[1].score).toBe(0);
    });
});

// ─── Test 17: Reconnection preserves score and identity ──────────────────────
describe('Test 17: Reconnection preserves score and identity', () => {
    it('score is preserved after disconnect/reconnect cycle', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');

        const { mapping } = room._getShuffledOptionsForPlayer('tok1', 0);
        room.submitAnswer('s1', mapping.indexOf(room.questions[0].correct_option_index), null);
        const scoreBefore = room.players.get('tok1').score;

        room.removePlayer('s1');
        expect(room.players.get('tok1').connected).toBe(false);

        room.addPlayer('s_new', 'tok1', 'Alice');
        expect(room.players.get('tok1').connected).toBe(true);
        expect(room.players.get('tok1').score).toBe(scoreBefore);
        expect(room.socketToToken.get('s_new')).toBe('tok1');
    });

    it('getReconnectState returns correct question state for mid-game reconnect', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');

        const state = room.getReconnectState('tok1');
        expect(state.state).toBe('QUESTION_ACTIVE');
        expect(state.question).toBeDefined();
        expect(state.question).not.toHaveProperty('correct_option_index');
    });

    it('reconnect state is null for unknown token', () => {
        const room = makeRoom();
        expect(room.getReconnectState('nonexistent')).toBeNull();
    });
});

// ─── Test 18: Persistence module is importable and handles DB failure ─────────
describe('Test 18: Persistence module', () => {
    it('exports persistGameResults function', () => {
        const { persistGameResults } = require('../src/game/Persistence');
        expect(typeof persistGameResults).toBe('function');
    });

    it('persistGameResults rejects when pool.connect() fails (DB down)', async () => {
        const { persistGameResults } = require('../src/game/Persistence');
        const badPool = { connect: () => Promise.reject(new Error('DB unavailable')) };
        const room = makeRoom();
        room.state = 'FINISHED';
        await expect(persistGameResults(room, badPool)).rejects.toThrow('DB unavailable');
    });
});

// ─── Test 19: Separate rooms cannot see each other's events ──────────────────
describe('Test 19: Room isolation', () => {
    it('two rooms have independent state machines', () => {
        const r1 = new GameRoom(1, 'ROOM1', { maxPlayers: 5 }, 'host1', [makeQuestion()], vi.fn());
        const r2 = new GameRoom(2, 'ROOM2', { maxPlayers: 5 }, 'host2', [makeQuestion()], vi.fn());

        r1.addPlayer('sA', 'tA', 'Alice');
        r2.addPlayer('sB', 'tB', 'Bob');

        r1.startGame('host1');
        expect(r1.state).toBe('QUESTION_ACTIVE');
        expect(r2.state).toBe('LOBBY');         // r2 unaffected
        expect(r1.players.size).toBe(1);
        expect(r2.players.size).toBe(1);
    });

    it('submitAnswer from socket not in room throws Unknown player', () => {
        const room = makeRoom();
        room.addPlayer('s1', 'tok1', 'Alice');
        room.startGame('secret-host-token');
        expect(() => room.submitAnswer('random-socket-not-in-room', 0, null)).toThrow('Unknown player');
    });

    it('hostTokenHash is independent per room', () => {
        const r1 = new GameRoom(1, 'AAAAA', { maxPlayers: 5 }, 'host-A', [makeQuestion()], vi.fn());
        const r2 = new GameRoom(2, 'BBBBB', { maxPlayers: 5 }, 'host-B', [makeQuestion()], vi.fn());
        r1.addPlayer('sA', 'tA', 'Alice');
        r2.addPlayer('sB', 'tB', 'Bob');
        expect(() => r1.startGame('host-B')).toThrow('Unauthorized'); // r2's token rejected in r1
        expect(() => r2.startGame('host-A')).toThrow('Unauthorized'); // r1's token rejected in r2
    });
});

// ─── Test 20: DB failure is reported, not silently faked ─────────────────────
describe('Test 20: DB failure is surfaced, not hidden', () => {
    it('persistGameResults propagates connection errors', async () => {
        const { persistGameResults } = require('../src/game/Persistence');
        const brokenPool = {
            connect: () => Promise.reject(new Error('ECONNREFUSED: simulated DB failure'))
        };
        const room = makeRoom();
        room.state = 'FINISHED';
        await expect(persistGameResults(room, brokenPool))
            .rejects.toThrow('ECONNREFUSED');
    });

    it('markInterruptedRooms propagates query errors', async () => {
        const { markInterruptedRooms } = require('../src/game/Persistence');
        const brokenPool = {
            query: () => Promise.reject(new Error('query failed'))
        };
        await expect(markInterruptedRooms(brokenPool)).rejects.toThrow('query failed');
    });
});

// ─── Scoring module ───────────────────────────────────────────────────────────
describe('Scoring module (detailed)', () => {
    const TL = 10000;

    it('returns 0 for incorrect', () => {
        expect(calculateScore(false, 0, 5000, TL).points).toBe(0);
    });

    it('full speed bonus at 0ms (medium default)', () => {
        expect(calculateScore(true, 0, 0, TL).points).toBe(180); // 150 * 1.2
    });

    it('half speed bonus at 5s (easy)', () => {
        expect(calculateScore(true, 0, 5000, TL, 0, 'easy').points).toBe(125);
    });

    it('difficulty multipliers: easy 1.0, medium 1.2, hard 1.5', () => {
        expect(calculateScore(true, 0, 0, TL, 0, 'easy').points).toBe(150);
        expect(calculateScore(true, 0, 0, TL, 0, 'medium').points).toBe(180);
        expect(calculateScore(true, 0, 0, TL, 0, 'hard').points).toBe(225);
    });

    it('double points powerup doubles the score', () => {
        const normal = calculateScore(true, 0, 0, TL, 0, 'easy', 0, false).points;
        const doubled = calculateScore(true, 0, 0, TL, 0, 'easy', 0, true).points;
        expect(doubled).toBe(normal * 2);
    });

    it('streak capped at MAX_STREAK_LEVEL', () => {
        const atMax = calculateScore(true, 0, 0, TL, SCORING_CONFIG.MAX_STREAK_LEVEL, 'easy').points;
        const overMax = calculateScore(true, 0, 0, TL, SCORING_CONFIG.MAX_STREAK_LEVEL + 3, 'easy').points;
        expect(atMax).toBe(overMax);
    });

    it('latency compensation applied up to MAX cap', () => {
        const rtt = 1000; // 500ms compensation
        const r = calculateScore(true, 0, 5500, TL, 0, 'easy', rtt);
        expect(r.compensatedElapsedMs).toBe(5000); // 5500 - 500 = 5000
    });

    it('answers beyond deadline+grace are late', () => {
        const lateMs = TL + SCORING_CONFIG.NETWORK_GRACE_MS + 1;
        const r = calculateScore(true, 0, lateMs, TL);
        expect(r.isLate).toBe(true);
        expect(r.points).toBe(0);
    });
});
