const { io } = require('socket.io-client');
const os = require('os');

function getLocalIPv4() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const LAN_IP = getLocalIPv4();
const SERVER_URL = `http://${LAN_IP}:3005`;

async function testLive() {
    console.log(`Connecting 2 test clients to LAN IP: ${SERVER_URL} (Origin simulation)`);

    const client1 = io(SERVER_URL, {
        extraHeaders: {
            origin: `http://${LAN_IP}:3005` // simulate same-origin fetch from browser
        }
    });

    const client2 = io(SERVER_URL, {
        extraHeaders: {
            origin: `http://${LAN_IP}:3005`
        }
    });

    let connectedCount = 0;

    const checkDone = () => {
        if (connectedCount === 2) {
            console.log('✅ Success! Both clients connected using LAN IP and Origin headers.');
            client1.disconnect();
            client2.disconnect();
            process.exit(0);
        }
    };

    client1.on('connect', () => {
        console.log(`Client 1 connected with ID: ${client1.id}`);
        connectedCount++;
        checkDone();
    });

    client2.on('connect', () => {
        console.log(`Client 2 connected with ID: ${client2.id}`);
        connectedCount++;
        checkDone();
    });

    client1.on('connect_error', (err) => {
        console.error('Client 1 Error:', err.message);
    });
}

testLive();
