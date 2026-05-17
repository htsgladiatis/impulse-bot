const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const config = {
  host: '109.69.22.112',
  port: 2222,
  username: 'root',
  privateKey: fs.readFileSync('C:\\Users\\user\\.ssh\\id_ed25519'),
  readyTimeout: 15000,
  keepaliveInterval: 10000,
};

const files = [
  {
    local: path.join(__dirname, 'webchat', 'server.js'),
    remote: '/opt/impulse-bot/webchat/server.js',
  },
  {
    local: path.join(__dirname, 'webchat', 'public', 'index.html'),
    remote: '/opt/impulse-bot/webchat/public/index.html',
  },
];

conn.on('ready', () => {
  console.log('SSH connected on port 2222!');

  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); process.exit(1); }

    let uploaded = 0;
    files.forEach((file) => {
      const content = fs.readFileSync(file.local);
      console.log(`Uploading ${file.remote} (${content.length} bytes)`);
      const ws = sftp.createWriteStream(file.remote, { mode: 0o644 });
      ws.on('close', () => {
        console.log(`  OK: ${file.remote}`);
        uploaded++;
        if (uploaded === files.length) {
          console.log('Restarting PM2...');
          conn.exec('cd /opt/impulse-bot && pm2 restart impulse-webchat', (e, stream) => {
            let out = '';
            stream.on('data', d => out += d);
            stream.stderr.on('data', d => out += d);
            stream.on('close', code => {
              console.log(`PM2: ${code}\n${out}`);
              conn.exec('sleep 2 && curl -s http://localhost:3002/health', (e2, s2) => {
                let h = '';
                s2.on('data', d => h += d);
                s2.on('close', () => {
                  console.log('Health:', h.trim());
                  conn.end();
                  console.log('Done!');
                  process.exit(0);
                });
              });
            });
          });
        }
      });
      ws.on('error', e => { console.error('Error:', e); conn.end(); process.exit(1); });
      ws.end(content);
    });
  });
});

conn.on('error', (err) => {
  console.error('SSH error:', err.message);
  process.exit(1);
});

console.log(`Connecting to ${config.host}:${config.port}...`);
conn.connect(config);