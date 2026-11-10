import { describe, it, expect, vi } from 'vitest';
const { GameRoom, seededShuffle, makeSeed } = require('../src/game/GameRoom');
import * as XLSX from 'xlsx';
import { parseExcelFile } from '../../client/src/utils/excelParser.js';

describe('Option Shuffling & Correct Answer Mapping Regression Suite', () => {

    function makeMockIo(roomCode, socketIds = []) {
        const socketRoom = new Set(socketIds);
        const emitted = {
            broadcasts: [],
            bySocket: new Map(socketIds.map(id => [id, []])),
        };

        const io = {
            sockets: {
                adapter: {
                    rooms: {
                        get: (code) => (code === roomCode ? socketRoom : undefined),
                    },
                },
            },
            to: (target) => ({
                emit: (event, data) => {
                    if (emitted.bySocket.has(target)) {
                        emitted.bySocket.get(target).push({ event, data });
                    } else {
                        emitted.broadcasts.push({ target, event, data });
                    }
                },
            }),
        };

        return { io, emitted };
    }

    // ─── 1 & 2: Every original correct option remains correct & appears at all positions ──
    it('1 & 2. Every original correct option (0, 1, 2, 3) remains correct and can appear at every displayed position', () => {
        const originalOptions = ['Paris', 'London', 'Berlin', 'Madrid'];
        
        for (let origCorrect = 0; origCorrect < 4; origCorrect++) {
            const question = {
                id: 10 + origCorrect,
                text: `Capital question with correct index ${origCorrect}`,
                options: JSON.stringify(originalOptions),
                correct_option_index: origCorrect,
                time_limit: 15,
                topic: 'Geography',
                difficulty: 'medium',
                explanation: `Correct was ${originalOptions[origCorrect]}`,
            };

            const room = new GameRoom(1, 'TEST1', { maxPlayers: 10 }, 'hostToken', [question], () => {});
            
            // Collect which shuffled positions the correct answer lands on across different player tokens
            const positionsSeen = new Set();
            for (let i = 0; i < 50; i++) {
                const token = `player-${origCorrect}-${i}`;
                const { options, mapping } = room._getShuffledOptionsForPlayer(token, 0);

                // Option identity: mapping[shuffledPos] must equal originalPos
                for (let pos = 0; pos < mapping.length; pos++) {
                    expect(options[pos]).toBe(originalOptions[mapping[pos]]);
                }

                const shuffledCorrect = mapping.indexOf(origCorrect);
                expect(shuffledCorrect).toBeGreaterThanOrEqual(0);
                expect(mapping[shuffledCorrect]).toBe(origCorrect);
                expect(options[shuffledCorrect]).toBe(originalOptions[origCorrect]);

                positionsSeen.add(shuffledCorrect);
            }

            // Verify that with seeded permutations, the correct answer appears across all positions (0, 1, 2, 3)
            expect(positionsSeen.size).toBe(4);
            for (let pos = 0; pos < 4; pos++) {
                expect(positionsSeen.has(pos)).toBe(true);
            }
        }
    });

    // ─── 3 & 4: Submitting correct option is marked correct; incorrect is marked incorrect ──
    it('3 & 4. A student selecting the correct shuffled option is marked correct; incorrect options are marked incorrect', () => {
        const question = {
            id: 201,
            text: 'What is 7 * 8?',
            options: JSON.stringify(['48', '54', '56', '64']),
            correct_option_index: 2, // '56'
            time_limit: 20,
            topic: 'Math',
            difficulty: 'easy',
            explanation: '7 * 8 = 56',
        };

        const room = new GameRoom(2, 'MATH1', { maxPlayers: 5 }, 'hostToken', [question], () => {});
        room.addPlayer('sock-correct', 'tok-correct', 'Alice');
        room.addPlayer('sock-wrong', 'tok-wrong', 'Bob');
        room.startGame('hostToken');

        // Alice finds her shuffled correct position
        const aliceOpts = room._getShuffledOptionsForPlayer('tok-correct', 0);
        const aliceCorrectPos = aliceOpts.mapping.indexOf(2);
        expect(aliceOpts.options[aliceCorrectPos]).toBe('56');

        // Bob finds his shuffled incorrect position
        const bobOpts = room._getShuffledOptionsForPlayer('tok-wrong', 0);
        const bobCorrectPos = bobOpts.mapping.indexOf(2);
        const bobWrongPos = (bobCorrectPos + 1) % 4;
        expect(bobOpts.options[bobWrongPos]).not.toBe('56');

        room.submitAnswer('sock-correct', aliceCorrectPos, null);
        room.submitAnswer('sock-wrong', bobWrongPos, null);

        const alice = room.players.get('tok-correct');
        const bob = room.players.get('tok-wrong');

        expect(alice.answers[0].isCorrect).toBe(true);
        expect(alice.answers[0].originalOptionChosen).toBe(2);
        expect(alice.answers[0].shuffledOptionChosen).toBe(aliceCorrectPos);
        expect(alice.score).toBeGreaterThan(0);
        expect(alice.streak).toBe(1);

        expect(bob.answers[0].isCorrect).toBe(false);
        expect(bob.answers[0].originalOptionChosen).not.toBe(2);
        expect(bob.answers[0].shuffledOptionChosen).toBe(bobWrongPos);
        expect(bob.score).toBe(0);
        expect(bob.streak).toBe(0);
    });

    // ─── 5: Multiple students with different shuffled orders get correct scoring ──
    it('5. Multiple students with different shuffled orders all receive correct scores independently', () => {
        const question = {
            id: 301,
            text: 'Which is a primary color?',
            options: JSON.stringify(['Green', 'Blue', 'Orange', 'Purple']),
            correct_option_index: 1, // 'Blue'
            time_limit: 20,
            topic: 'Art',
            difficulty: 'medium',
            explanation: 'Blue is a primary color.',
        };

        const room = new GameRoom(3, 'MULTI1', { maxPlayers: 10 }, 'hostToken', [question], () => {});
        const students = [
            { sock: 's-1', tok: 't-1', name: 'User 1' },
            { sock: 's-2', tok: 't-2', name: 'User 2' },
            { sock: 's-3', tok: 't-3', name: 'User 3' },
            { sock: 's-4', tok: 't-4', name: 'User 4' },
        ];

        students.forEach(s => room.addPlayer(s.sock, s.tok, s.name));
        room.startGame('hostToken');

        // Verify each student sees a shuffled question state with mapping
        students.forEach(s => {
            const qState = room.getQuestionStateForPlayer(s.tok);
            expect(qState.options).toHaveLength(4);
            expect(qState.mapping).toHaveLength(4);
            expect(qState).not.toHaveProperty('correct_option_index');
            expect(qState).not.toHaveProperty('correctOptionIndex');

            // Find where 'Blue' is in their options
            const bluePos = qState.options.indexOf('Blue');
            expect(bluePos).toBeGreaterThanOrEqual(0);
            expect(qState.mapping[bluePos]).toBe(1); // mapping to original index 1
        });

        // First 3 students submit the correct answer for their respective view
        for (let i = 0; i < 3; i++) {
            const s = students[i];
            const opts = room._getShuffledOptionsForPlayer(s.tok, 0);
            const correctPos = opts.mapping.indexOf(1);
            room.submitAnswer(s.sock, correctPos, null);

            const p = room.players.get(s.tok);
            expect(p.answers[0].isCorrect).toBe(true);
            expect(p.score).toBeGreaterThan(0);
        }

        // 4th student submits an incorrect option
        const s4 = students[3];
        const s4Opts = room._getShuffledOptionsForPlayer(s4.tok, 0);
        const wrongPos = (s4Opts.mapping.indexOf(1) + 1) % 4;
        room.submitAnswer(s4.sock, wrongPos, null);

        const p4 = room.players.get(s4.tok);
        expect(p4.answers[0].isCorrect).toBe(false);
        expect(p4.score).toBe(0);
    });

    // ─── 6: Reveal data displays the actual correct option for every student ──
    it('6. The revealAnswer emission and getReconnectState provide the exact correct option for each student', () => {
        const question = {
            id: 401,
            text: 'Smallest prime number?',
            options: JSON.stringify(['0', '1', '2', '3']),
            correct_option_index: 2, // '2'
            time_limit: 20,
            topic: 'Math',
            difficulty: 'easy',
            explanation: '2 is the smallest prime number.',
        };

        const room = new GameRoom(4, 'REV1', { maxPlayers: 5 }, 'hostToken', [question], () => {});
        room.addPlayer('sock-a', 'tok-a', 'Student A');
        room.addPlayer('sock-b', 'tok-b', 'Student B');
        room.startGame('hostToken');

        const { io, emitted } = makeMockIo('REV1', ['sock-a', 'sock-b']);
        room.revealAnswer(io);

        expect(room.state).toBe('REVEAL');

        // Check socket-A reveal payload
        const aReveals = emitted.bySocket.get('sock-a');
        expect(aReveals).toHaveLength(1);
        const aPayload = aReveals[0].data;

        const aOpts = room._getShuffledOptionsForPlayer('tok-a', 0);
        const aCorrectPos = aOpts.mapping.indexOf(2);
        expect(aPayload.correctOptionIndex).toBe(aCorrectPos);
        expect(aPayload.originalCorrectOptionIndex).toBe(2);
        expect(aPayload.correctOptionText).toBe('2');
        expect(aOpts.options[aPayload.correctOptionIndex]).toBe('2');

        // Check socket-B reveal payload
        const bReveals = emitted.bySocket.get('sock-b');
        expect(bReveals).toHaveLength(1);
        const bPayload = bReveals[0].data;

        const bOpts = room._getShuffledOptionsForPlayer('tok-b', 0);
        const bCorrectPos = bOpts.mapping.indexOf(2);
        expect(bPayload.correctOptionIndex).toBe(bCorrectPos);
        expect(bPayload.originalCorrectOptionIndex).toBe(2);
        expect(bPayload.correctOptionText).toBe('2');
        expect(bOpts.options[bPayload.correctOptionIndex]).toBe('2');

        // Check getReconnectState for Student A during REVEAL
        const reconnectStateA = room.getReconnectState('tok-a');
        expect(reconnectStateA.state).toBe('REVEAL');
        expect(reconnectStateA.reveal.correctOptionIndex).toBe(aCorrectPos);
        expect(reconnectStateA.reveal.originalCorrectOptionIndex).toBe(2);
        expect(reconnectStateA.reveal.correctOptionText).toBe('2');
        expect(reconnectStateA.question.options[reconnectStateA.reveal.correctOptionIndex]).toBe('2');
    });

    // ─── 7: Excel/PDF-imported questions continue working end-to-end ──
    it('7. Excel/CSV-imported questions work seamlessly through option shuffling, scoring, and reveal', () => {
        const rawImportData = [{
            question: 'What is the speed of light approx in km/s?',
            option_a: '150,000',
            option_b: '300,000',
            option_c: '450,000',
            option_d: '600,000',
            correct_option: 'B',
            difficulty: 'medium',
            topic: 'Physics',
            time_limit: 15,
            explanation: 'Speed of light is approximately 300,000 km/s',
        }];

        const ws = XLSX.utils.json_to_sheet(rawImportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Questions');
        const excelBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        const parseResult = parseExcelFile(excelBuf, 'physics.xlsx');
        expect(parseResult.errors).toHaveLength(0);
        expect(parseResult.parsedQuestions).toHaveLength(1);

        const parsedQ = parseResult.parsedQuestions[0];
        expect(parsedQ.correctOptionIndex).toBe(1); // 'B' is index 1

        // Convert to DB representation
        const dbQuestion = {
            id: 501,
            text: parsedQ.text,
            options: JSON.stringify(parsedQ.options),
            correct_option_index: parsedQ.correctOptionIndex,
            time_limit: parsedQ.timeLimit,
            topic: parsedQ.topic,
            difficulty: parsedQ.difficulty,
            explanation: parsedQ.explanation,
        };

        const room = new GameRoom(5, 'EXCEL1', { maxPlayers: 3 }, 'hostToken', [dbQuestion], () => {});
        room.addPlayer('sock-excel', 'tok-excel', 'Physicist');
        room.startGame('hostToken');

        const { mapping, options } = room._getShuffledOptionsForPlayer('tok-excel', 0);
        const shuffledCorrect = mapping.indexOf(dbQuestion.correct_option_index);

        expect(options[shuffledCorrect]).toBe('300,000');

        room.submitAnswer('sock-excel', shuffledCorrect, null);
        const player = room.players.get('tok-excel');
        expect(player.answers[0].isCorrect).toBe(true);
        expect(player.answers[0].originalOptionChosen).toBe(1);
    });

    // ─── 8: Repeated shuffling does not corrupt original question or correct answer ──
    it('8. Repeated shuffling across 50 simulated calls does not mutate original options or correct_option_index', () => {
        const originalOptions = ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Argon'];
        const question = {
            id: 601,
            text: 'Most abundant gas in Earth atmosphere?',
            options: JSON.stringify(originalOptions),
            correct_option_index: 1, // 'Nitrogen'
            time_limit: 20,
            topic: 'Science',
            difficulty: 'easy',
        };

        const room = new GameRoom(6, 'CORRUPT_TEST', { maxPlayers: 50 }, 'hostToken', [question], () => {});

        for (let i = 0; i < 50; i++) {
            const token = `repeat-token-${i}`;
            const { options, mapping } = room._getShuffledOptionsForPlayer(token, 0);

            // Shuffling should never mutate room.questions[0]
            expect(question.correct_option_index).toBe(1);
            expect(JSON.parse(question.options)).toEqual(originalOptions);

            const correctPos = mapping.indexOf(1);
            expect(options[correctPos]).toBe('Nitrogen');
        }
    });

    // ─── 9: Seeded shuffle determinism and 50/50 powerup safety ──
    it('9. Seeded shuffle is 100% reproducible for reconnects, and 50/50 powerup never removes the correct option', () => {
        const question = {
            id: 701,
            text: 'HTML stands for?',
            options: JSON.stringify([
                'Hyper Text Markup Language',
                'High Text Modern Language',
                'Hyper Transfer Markup Language',
                'Home Tool Markup Language'
            ]),
            correct_option_index: 0,
            time_limit: 25,
            topic: 'Tech',
            difficulty: 'easy',
        };

        const room = new GameRoom(7, 'SEED1', { maxPlayers: 5 }, 'hostToken', [question], () => {});
        room.addPlayer('sock-p1', 'tok-p1', 'Dev');
        room.startGame('hostToken');

        // Grant 50/50 powerup
        const player = room.players.get('tok-p1');
        player.powerups = { fifty_fifty: 2 };

        // Test determinism
        const first = room._getShuffledOptionsForPlayer('tok-p1', 0);
        const second = room._getShuffledOptionsForPlayer('tok-p1', 0);
        expect(first.options).toEqual(second.options);
        expect(first.mapping).toEqual(second.mapping);

        // Test 50/50 powerup
        const p1CorrectShuffled = first.mapping.indexOf(0);
        const powerupRes = room.usePowerup('sock-p1', 'fifty_fifty');
        expect(powerupRes.success).toBe(true);
        expect(powerupRes.removedIndices).toHaveLength(2);

        // Crucial test: removedIndices must NEVER contain the student's correct option!
        expect(powerupRes.removedIndices).not.toContain(p1CorrectShuffled);

        // Remaining options must include the correct option
        const remainingIndices = [0, 1, 2, 3].filter(idx => !powerupRes.removedIndices.includes(idx));
        expect(remainingIndices).toContain(p1CorrectShuffled);
    });
});
