const { io } = require('socket.io-client');
const crypto = require('crypto');

const SERVER_URL = process.env.VITE_API_URL || 'http://localhost:3005';
const NUM_PLAYERS = 50;

async function runSimulation() {
    console.log(`Starting 50-player simulation against ${SERVER_URL}...`);
    
    // 1. Create a Teacher account to host the test
    let teacherToken = '';
    const teacherEmail = `teacher_${Date.now()}@simulation.com`;
    try {
        const resReg = await fetch(`${SERVER_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'Sim Teacher', email: teacherEmail, password: 'password123' })
        });
        
        const data = await resReg.json();
        if (data.token) {
            teacherToken = data.token;
        } else {
            console.error('No token received on register.', data);
            process.exit(1);
        }
        console.log(`Created teacher account: ${teacherEmail}`);
    } catch (e) {
        console.error('Failed to connect to server:', e.message);
        process.exit(1);
    }

    // 2. Create a Test
    let testId;
    try {
        const resTest = await fetch(`${SERVER_URL}/api/tests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
            body: JSON.stringify({
                title: 'Simulation Load Test',
                description: 'A test created by the load simulation',
                questions: [
                    { text: 'What is 2 + 2?', options: ['3', '4', '5', '6'], correctOptionIndex: 1, time_limit: 5000 },
                    { text: 'Capital of France?', options: ['Paris', 'London', 'Berlin', 'Rome'], correctOptionIndex: 0, time_limit: 5000 }
                ]
            })
        });
        const testData = await resTest.json();
        if (testData.error) throw new Error(testData.error);
        testId = testData.id;
        console.log(`Created test ID: ${testId}`);
    } catch (e) {
        console.error('Failed to create test:', e.message);
        process.exit(1);
    }

    // 3. Create a Room
    let roomCode;
    let hostTokenHash;
    try {
        const resRoom = await fetch(`${SERVER_URL}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${teacherToken}` },
            body: JSON.stringify({ questionSetId: testId })
        });
        const roomData = await resRoom.json();
        if (roomData.error) throw new Error(roomData.error);
        roomCode = roomData.code;
        hostTokenHash = roomData.hostSocketToken;
        console.log(`Created room Code: ${roomCode}`);
    } catch (e) {
        console.error('Failed to create room:', e.message);
        process.exit(1);
    }

    // 4. Connect Clients
    const clients = [];
    let connectedCount = 0;
    const startTime = Date.now();
    let acks = { success: 0, fail: 0 };
    let pings = [];
    let answersSubmitted = 0;

    for (let i = 0; i < NUM_PLAYERS; i++) {
        // We must authenticate the student first to get a cookie
        const studentEmail = `student_${i}_${Date.now()}@simulation.com`;
        let studentToken = '';
        
        try {
            const resStu = await fetch(`${SERVER_URL}/api/auth/student/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName: `Sim Student ${i}`, email: studentEmail, password: 'password123' })
            });
            const data = await resStu.json();
            if (data.token) studentToken = data.token;
        } catch (e) {
            console.error(`Failed to register student ${i}`, e.message);
        }

        const client = io(SERVER_URL, {
            extraHeaders: {
                Authorization: `Bearer ${studentToken}`
            }
        });
        
        client.on('connect', () => {
            connectedCount++;
            
            client.emit('ping', Date.now(), () => {
                client.emit('pong', 50);
            });

            const start = Date.now();
            const hashedSession = require('crypto').createHash('sha256').update(studentToken).digest('hex');
            client.emit('join_room', { code: roomCode, displayName: `Sim Student ${i}`, sessionTokenHash: hashedSession }, (res) => {
                pings.push(Date.now() - start);
                if (res && res.success) acks.success++;
                else {
                    acks.fail++;
                    console.error('Failed to join:', res);
                }
            });
        });

        client.on('question_active', (qState) => {
            const reactionTime = 1000 + Math.random() * 2000;
            setTimeout(() => {
                const randomOption = Math.floor(Math.random() * 4);
                client.emit('submit_answer', { code: roomCode, optionIndex: randomOption }, (res) => {
                    if (res && res.success) answersSubmitted++;
                });
            }, reactionTime);
        });

        clients.push(client);
    }

    // 5. Host Client starts game
    const hostClient = io(SERVER_URL, {
        extraHeaders: { Authorization: `Bearer ${teacherToken}` }
    });
    
    hostClient.on('connect', () => {
        setTimeout(() => {
            console.log(`Host starting game in room ${roomCode}...`);
            hostClient.emit('join_room', { code: roomCode, sessionTokenHash: hostTokenHash, displayName: 'Teacher', role: 'host' }, (res) => {
                if (res && res.success) {
                    setTimeout(() => {
                        hostClient.emit('start_game', { code: roomCode });
                    }, 1000);
                } else {
                    console.error('Host failed to join:', res);
                    process.exit(1);
                }
            });
        }, 4000); // Wait 4 seconds for bots to join
    });

    // We'll listen on the first bot for game_finished
    clients[0].on('game_finished', (results) => {
        const duration = Date.now() - startTime;
        console.log('\n--- SIMULATION RESULTS ---');
        console.log(`Players Connected: ${connectedCount}/${NUM_PLAYERS}`);
        console.log(`Joins Acked: Success=${acks.success}, Fail=${acks.fail}`);
        console.log(`Answers Submitted: ${answersSubmitted}`);
        
        pings.sort((a,b) => a-b);
        const p50 = pings[Math.floor(pings.length * 0.5)] || 0;
        const p95 = pings[Math.floor(pings.length * 0.95)] || 0;
        console.log(`Join Ack Latency: p50=${p50}ms, p95=${p95}ms`);
        console.log(`Total Duration: ${duration}ms`);
        
        let allSuccess = acks.success === NUM_PLAYERS && answersSubmitted > 0;
        
        clients.forEach(c => c.disconnect());
        hostClient.disconnect();
        
        if (!allSuccess) {
            console.error('Simulation failed: Not all clients joined or submitted answers.');
            process.exit(1);
        }
        console.log('Simulation completed successfully.');
        process.exit(0);
    });

    // 51st client attempt
    setTimeout(() => {
        const extraClient = io(SERVER_URL);
        extraClient.on('connect', () => {
            extraClient.emit('join_room', { code: roomCode }, (res) => {
                if (res && !res.success) {
                    console.log('51st player rejected correctly:', res.error);
                } else {
                    console.log('ERROR: 51st player was allowed to join.');
                }
                extraClient.disconnect();
            });
        });
    }, 3000);
}

runSimulation();
