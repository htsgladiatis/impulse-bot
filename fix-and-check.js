const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

// Strip BOM from files
function stripBOM(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3);
  }
  return buf;
}

const srvContent = stripBOM(fs.readFileSync(path.join(__dirname, 'webchat', 'server.js')));
const htmlContent = stripBOM(fs.readFileSync(path.join(__dirname, 'webchat', 'public', 'index.html')));

console.log(`server.js: ${srvContent.length} bytes, starts with: ${srvContent.slice(0, 20).toString()}`);
console.log(`index.html: ${htmlContent.length} bytes, starts with: ${htmlContent.slice(0, 20).toString()}`);

conn.on('ready', () => {
  console.log('SSH connected!');

  // First find nginx config
  conn.exec('find /etc/nginx -name "*.conf" 2>/dev/null && echo "===NGINX===" && nginx -T 2>&1 | head -80 && echo "===PM2_STATUS===" && pm2 show impulse-webchat 2>&1 | grep -E "script path|cwd|exec mode"', (e, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => {
      console.log('\n=== NGINX & PM2 INFO ===');
      console.log(out);

      // Upload fixed files (without BOM)
      conn.sftp((err, sftp) => {
        if (err) { console.error('SFTP error:', err); conn.end(); process.exit(1); }

        let uploaded = 0;
        const files = [
          { content: srvContent, remote: '/opt/impulse-bot/webchat/server.js' },
          { content: htmlContent, remote: '/opt/impulse-bot/webchat/public/index.html' },
        ];

        files.forEach((file) => {
          console.log(`\nUploading ${file.remote} (${file.content.length} bytes, BOM stripped)`);
          const ws = sftp.createWriteStream(file.remote, { mode: 0o644 });
          ws.on('close', () => {
            console.log(`  OK: ${file.remote}`);
            uploaded++;
            if (uploaded === files.length) {
              // Verify file on server
              conn.exec('head -1 /opt/impulse-bot/webchat/server.js | xxd | head -1', (e2, s2) => {
                let verify = '';
                s2.on('data', d => verify += d);
                s2.on('close', () => {
                  console.log('\nVerify first bytes:', verify.trim());
                  
                  // Restart PM2
                  conn.exec('cd /opt/impulse-bot && pm2 restart impulse-webchat && sleep 3 && pm2 logs impulse-webchat --lines 5 --nostream 2>&1 && echo "===HEALTH===" && curl -s http://localhost:3002/health', (e3, s3) => {
                    let result = '';
                    s3.on('data', d => result += d);
                    s3.stderr.on('data', d => result += d);
                    s3.on('close', () => {
                      console.log('\n=== RESTART RESULT ===');
                      console.log(result);
                      conn.end();
                      process.exit(0);
                    });
                  });
                });
              });
            }
          });
          ws.on('error', e => { console.error('Upload error:', e); conn.end(); process.exit(1); });
          ws.end(file.content);
        });
      });
    });
  });
});

conn.on('error', (err) => {
  console.error('SSH error:', err.message);
  process.exit(1);
});

console.log('Connecting...');
conn.connect({
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  password: 'And716443@',
  readyTimeout: 30000,
});