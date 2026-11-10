const { GameRoom } = require('../src/game/GameRoom');
const { SCORING_CONFIG } = require('../src/game/scoring');

const mockQuestions = [
    { id: 1, text: 'Q1', options: '["A", "B"]', correct_option_index: 0, difficulty: 'easy', time_limit: 10, topic: 'Math', explanation: '' },
    { id: 2, text: 'Q2', options: '["C", "D"]', correct_option_index: 1, difficulty: 'medium', time_limit: 10, topic: 'Verbal', explanation: '' }
];

describe('GameRoom State Machine (legacy)', () => {
    let room;

    beforeEach(() => {
        const questions = [
            { id: 1, text: 'Q1', options: '["A", "B"]', correct_option_index: 0, difficulty: 'easy', time_limit: 10, topic: 'Math', explanation: '' },
            { id: 2, text: 'StringIndexQ', options: '["Opt0", "Opt1", "Opt2", "Opt3"]', correct_option_index: "2", difficulty: 'medium', time_limit: 10, topic: 'Logic', explanation: '' }
        ];
        room = new GameRoom(1, 'TESTCO', { timePerQuestion: 10000, maxPlayers: 2 }, 'host123', questions, () => {});
    });

    it('initializes in LOBBY state', () => {
        expect(room.state).toBe('LOBBY');
        expect(room.players.size).toBe(0);
    });

    it('allows players to join up to maxPlayers', () => {
        room.addPlayer('socket1', 'token1', 'Player One');
        room.addPlayer('socket2', 'token2', 'Player Two');
        expect(room.players.size).toBe(2);
        expect(() => room.addPlayer('socket3', 'token3', 'Player Three')).toThrow('Room is full');
    });

    it('handles player reconnection', () => {
        room.addPlayer('socket1', 'token1', 'Player One');
        room.removePlayer('socket1');
        expect(room.players.get('token1').connected).toBe(false);

        room.addPlayer('socket2', 'token1', 'Player One');
        expect(room.players.get('token1').connected).toBe(true);
        expect(room.socketToToken.get('socket2')).toBe('token1');
    });

    it('requires correct host token to start', () => {
        room.addPlayer('socket1', 'token1', 'Player One');
        expect(() => room.startGame('wrong_host')).toThrow('Unauthorized');
    });

    it('transitions to QUESTION_ACTIVE and REVEAL correctly', () => {
        room.addPlayer('socket1', 'token1', 'Player One');
        room.startGame('host123');
        expect(room.state).toBe('QUESTION_ACTIVE');
        expect(room.currentQuestionIndex).toBe(0);

        // Get the correct shuffled index for this player
        const { mapping } = room._getShuffledOptionsForPlayer('token1', 0);
        const correctShuffledIdx = mapping.indexOf(0); // correct_option_index is 0

        room.submitAnswer('socket1', correctShuffledIdx, null);
        const player = room.players.get('token1');
        expect(player.answers.length).toBe(1);
        expect(player.score).toBeGreaterThan(0);

        const io = { to: () => ({ emit: () => {} }) };
        room.revealAnswer(io);
        expect(room.state).toBe('REVEAL');
    });

    it('prevents multiple answers for the same question', () => {
        room.addPlayer('socket1', 'token1', 'Player One');
        room.startGame('host123');
        room.submitAnswer('socket1', 0, null);
        expect(() => room.submitAnswer('socket1', 1, null)).toThrow('Already answered');
    });

    it('finishes game after last question', () => {
        room.nextQuestion(); // Q1 (index 0)
        room.nextQuestion(); // Q2 (index 1)
        room.nextQuestion(); // End
        expect(room.state).toBe('FINISHED');
    });

    it('safely handles correct_option_index stored as string and allows concurrent submissions', () => {
        room.addPlayer('socket1', 'token1', 'Player One');
        room.addPlayer('socket2', 'token2', 'Player Two');
        room.startGame('host123'); // advances to Q1
        room.nextQuestion(); // advance to Q2 (StringIndexQ)
        
        expect(room.currentQuestionIndex).toBe(1);

        // Player 1 options
        const p1Opts = room._getShuffledOptionsForPlayer('token1', 1);
        const correctForP1 = p1Opts.mapping.indexOf(2);
        
        // Player 2 options
        const p2Opts = room._getShuffledOptionsForPlayer('token2', 1);
        const correctForP2 = p2Opts.mapping.indexOf(2);
        
        room.submitAnswer('socket1', correctForP1, null);
        room.submitAnswer('socket2', correctForP2, null);
        
        const p1 = room.players.get('token1');
        const p2 = room.players.get('token2');
        
        // Both answers should be correct even though correct_option_index is a string "2"
        expect(p1.answers[0].isCorrect).toBe(true);
        expect(p2.answers[0].isCorrect).toBe(true);
    });
});
