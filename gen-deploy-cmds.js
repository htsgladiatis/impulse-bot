const fs = require('fs');
const path = require('path');

const srvPath = path.join(__dirname, 'webchat', 'server.js');
const htmlPath = path.join(__dirname, 'webchat', 'public', 'index.html');

const srvB64 = fs.readFileSync(srvPath).toString('base64');
const htmlB64 = fs.readFileSync(htmlPath).toString('base64');

console.log('=== COPY AND PASTE THESE COMMANDS ON THE SERVER ===\n');
console.log('echo "' + srvB64 + '" | base64 -d > /opt/impulse-bot/webchat/server.js');
console.log('');
console.log('mkdir -p /opt/impulse-bot/webchat/public');
console.log('');
console.log('echo "' + htmlB64 + '" | base64 -d > /opt/impulse-bot/webchat/public/index.html');
console.log('');
console.log('cd /opt/impulse-bot && pm2 restart impulse-webchat && sleep 2 && curl -s http://localhost:3002/health');
console.log('\n=== END ===');