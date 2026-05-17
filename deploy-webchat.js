const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();
const serverContent = fs.readFileSync(path.join(__dirname, 'webchat', 'server.js'), 'utf-8');

conn.on('ready', () => {
  console.log('SSH connected!');
  
  // Upload the fixed file using SFTP
  conn.sftp((err, sftp) => {
    if (err) { console.error('SFTP error:', err); conn.end(); process.exit(1); return; }
    const ws = sftp.createWriteStream('/opt/impulse-bot/webchat/server.js', { mode: 0o644 });
    ws.on('close', () => {
      console.log('File uploaded via SFTP');
      
      sftp.end();
      // Restart PM2
      conn.exec('cd /opt/impulse-bot && pm2 restart impulse-webchat && sleep 2 && pm2 logs impulse-webchat --lines 10 --nostream', (e2, stream2) => {
        let out2 = '';
        stream2.on('data', d => out2 += d);
        stream2.stderr.on('data', d => out2 += d);
        stream2.on('close', () => {
          console.log('\n=== PM2 RESTART ===');
          console.log(out2);
          
          // Quick health test
          conn.exec('curl -s http://localhost:3002/health && echo "" && curl -s -X POST http://localhost:3002/socket.io/?EIO=4\\&transport=polling | head -c 200', (e3, stream3) => {
            let out3 = '';
            stream3.on('data', d => out3 += d);
            stream3.stderr.on('data', d => out3 += d);
            stream3.on('close', () => {
              console.log('\n=== HEALTH TEST ===');
              console.log(out3);
              conn.end();
              process.exit(0);
            });
          });
        });
      });
    });
    ws.write(serverContent);
    ws.end();
  });
});

conn.on('error', (err) => {
  console.error('SSH error:', err.message);
  process.exit(1);
});

console.log('Deploying fixed webchat server.js...');
conn.connect({
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  password: 'And716443@',
  readyTimeout: 30000,
});