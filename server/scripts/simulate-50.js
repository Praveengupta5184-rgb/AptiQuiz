const { io } = require('socket.io-client');
const crypto = require('crypto');

const SERVER_URL = process.env.VITE_API_URL || 'http://localhost:3005';
const NUM_PLAYERS = 50;

async function runSimulation() {
    console.log(`Starting 50-player simulation against ${SERVER_URL}...`);
    
    // In a real simulation, we would create a room via HTTP first.
    // For this script, we assume the server is running and we have a room code.
    // However, since we want this script to be standalone, we'll hit the REST API to create a room.
    
    let roomCode;
    try {
        const res = await fetch(`${SERVER_URL}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questionSetId: 1, // Assume seeded
                collegeId: 1, // Assume seeded
                hostTokenHash: 'host123',
                settings: { timePerQuestion: 5000, maxPlayers: 50, advanceEarly: true }
            })
        });
        const data = await res.json();
        if (!data.success) {
            console.error('Failed to create room:', data);
            return;
        }
        roomCode = data.code;
        console.log(`Created room: ${roomCode}`);
    } catch (err) {
        console.error('Could not reach server. Is it running? Make sure to run `npm run dev` in another terminal.', err.message);
        return;
    }

    const clients = [];
    let connectedCount = 0;
    const startTime = Date.now();
    let acks = { success: 0, fail: 0 };
    let pings = [];

    for (let i = 0; i < NUM_PLAYERS; i++) {
        const client = io(SERVER_URL);
        const sessionToken = crypto.randomUUID();
        
        client.on('connect', () => {
            connectedCount++;
            
            // Handle Ping-Pong
            client.emit('ping', Date.now(), () => {
                client.emit('pong', 50); // Fake 50ms latency
            });

            const start = Date.now();
            client.emit('join_room', {
                code: roomCode,
                displayName: `Bot_${i}`,
                sessionTokenHash: sessionToken
            }, (res) => {
                pings.push(Date.now() - start);
                if (res.success) acks.success++;
                else acks.fail++;
            });
        });

        client.on('question_active', (qState) => {
            // Simulate reading time + reaction time (1000ms - 4500ms)
            const reactionTime = 1000 + Math.random() * 3500;
            
            setTimeout(() => {
                // Bots guess randomly from 4 options, some might guess correct if we knew it,
                // but we only have option indexes.
                const randomOption = Math.floor(Math.random() * 4);
                client.emit('submit_answer', { code: roomCode, optionIndex: randomOption }, (res) => {
                    // Ack received
                });
            }, reactionTime);
        });

        clients.push(client);
    }

    // Host client starts the game
    const hostClient = io(SERVER_URL);
    hostClient.on('connect', () => {
        setTimeout(() => {
            console.log(`Starting game in room ${roomCode}...`);
            hostClient.emit('start_game', { code: roomCode, hostTokenHash: 'host123' });
        }, 3000); // Wait 3 seconds for bots to join
    });

    // We'll listen on the first bot for game_finished
    clients[0].on('game_finished', (results) => {
        const duration = Date.now() - startTime;
        console.log('\n--- SIMULATION RESULTS ---');
        console.log(`Players Connected: ${connectedCount}/${NUM_PLAYERS}`);
        console.log(`Joins Acked: Success=${acks.success}, Fail=${acks.fail}`);
        
        pings.sort((a,b) => a-b);
        const p50 = pings[Math.floor(pings.length * 0.5)] || 0;
        const p95 = pings[Math.floor(pings.length * 0.95)] || 0;
        console.log(`Join Ack Latency: p50=${p50}ms, p95=${p95}ms`);
        console.log(`Total Duration: ${duration}ms`);
        
        // Disconnect all
        clients.forEach(c => c.disconnect());
        hostClient.disconnect();
        process.exit(0);
    });

    // 51st client attempt (Capacity check)
    setTimeout(() => {
        const extraClient = io(SERVER_URL);
        extraClient.on('connect', () => {
            extraClient.emit('join_room', {
                code: roomCode,
                displayName: `Bot_51`,
                sessionTokenHash: 'token_51'
            }, (res) => {
                if (!res.success) {
                    console.log('51st player rejected correctly:', res.error);
                } else {
                    console.log('ERROR: 51st player was allowed to join.');
                }
                extraClient.disconnect();
            });
        });
    }, 2000);
}

runSimulation();
