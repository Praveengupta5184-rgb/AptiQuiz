const os = require('os');
const { spawn } = require('child_process');
const path = require('path');

function getLocalIPv4() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Skip over internal and non-ipv4 addresses
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const ip = getLocalIPv4();
const port = process.env.PORT || 3005;

console.log('\n=============================================');
console.log('🚀 APTIQUIZ LIVE TEST MODE 🚀');
console.log('=============================================');
console.log(`\nLocal URL:  http://localhost:${port}`);
console.log(`LAN URL:    http://${ip}:${port}\n`);
console.log('📢 IMPORTANT:');
console.log('1. If students cannot connect on the LAN URL, you must open the Windows Firewall port:');
console.log(`   New-NetFirewallRule -DisplayName "AptiQuiz" -Direction Inbound -LocalPort ${port} -Protocol TCP -Action Allow`);
console.log('\n2. Or, use a free public tunnel if the college Wi-Fi blocks device-to-device traffic:');
console.log(`   cloudflared tunnel --url http://localhost:${port}`);
console.log('=============================================\n');

console.log('Starting server...');
const serverPath = path.join(__dirname, '../src/index.js');
const child = spawn('node', [serverPath], { stdio: 'inherit' });

child.on('error', (err) => {
    console.error('Failed to start server:', err);
});
