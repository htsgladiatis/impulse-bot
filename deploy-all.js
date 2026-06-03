const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const config = {
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  password: 'And716443@',
  readyTimeout: 30000,
};

const files = [
  { local: path.join(__dirname, 'bot.js'), remote: '/opt/impulse-bot/bot.js' },
  { local: path.join(__dirname, 'services', 'refDictionary.js'), remote: '/opt/impulse-bot/services/refDictionary.js' },
  { local: path.join(__dirname, 'controllers', 'admin.js'), remote: '/opt/impulse-bot/controllers/admin.js' },
  { local: path.join(__dirname, 'controllers', 'report.js'), remote: '/opt/impulse-bot/controllers/report.js' },
  { local: path.join(__dirname, 'webchat', 'server.js'), remote: '/opt/impulse-bot/webchat/server.js' },
];

console.log('Deploying...');
conn.on('ready', () => {
  console.log('Connected!');
  let uploaded = 0;
  files.forEach((file) => {
    conn.sftp((err, sftp) => {
      if (err) { console.error(err); process.exit(1); }
      const content = fs.readFileSync(file.local);
      console.log('Upload ' + file.remote + ' (' + content.length + ' bytes)');
      const ws = sftp.createWriteStream(file.remote, { mode: 0o644 });
      ws.on('close', () => {
        console.log('OK: ' + file.remote);
        uploaded++;
        if (uploaded === files.length) {
          console.log('Restarting PM2...');
          conn.exec('pm2 restart impulse-bot impulse-webchat', (err, stream) => {
            let out = '';
            stream.on('data', (d) => { out += d.toString(); });
            stream.stderr.on('data', (d) => { out += d.toString(); });
            stream.on('close', () => {
              console.log(out);
              conn.end();
              process.exit(0);
            });
          });
        }
      });
      ws.on('error', (err) => { console.error(err); conn.end(); process.exit(1); });
      ws.end(content);
    });
  });
});
conn.on('error', (err) => { console.error('SSH error:', err.message); process.exit(1); });
console.log('Connecting...');
conn.connect(config);