const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const config = {
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  privateKey: fs.readFileSync('C:\\Users\\user\\.ssh\\id_ed25519'),
  readyTimeout: 30000,
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
  console.log('SSH connected!');
  
  // Upload files via SFTP
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP error:', err);
      conn.end();
      process.exit(1);
    }

    let uploaded = 0;
    
    files.forEach((file) => {
      const content = fs.readFileSync(file.local);
      console.log(`Uploading ${file.local} -> ${file.remote} (${content.length} bytes)`);
      
      const writeStream = sftp.createWriteStream(file.remote, { mode: 0o644 });
      
      writeStream.on('close', () => {
        console.log(`  ✓ Uploaded: ${file.remote}`);
        uploaded++;
        
        if (uploaded === files.length) {
          console.log('\nAll files uploaded! Restarting PM2...');
          
          conn.exec('cd /opt/impulse-bot && pm2 restart impulse-webchat', (err, stream) => {
            if (err) {
              console.error('PM2 restart error:', err);
              conn.end();
              process.exit(1);
            }
            
            let output = '';
            stream.on('data', (data) => { output += data.toString(); });
            stream.stderr.on('data', (data) => { output += data.toString(); });
            
            stream.on('close', (code) => {
              console.log(`PM2 restart exit code: ${code}`);
              console.log(output);
              
              // Health check
              conn.exec('curl -s http://localhost:3002/health', (err, stream2) => {
                let health = '';
                stream2.on('data', (data) => { health += data.toString(); });
                stream2.on('close', () => {
                  console.log('\nHealth check:', health.trim());
                  conn.end();
                  console.log('\n✅ Deploy complete!');
                  process.exit(0);
                });
              });
            });
          });
        }
      });
      
      writeStream.on('error', (err) => {
        console.error(`  ✗ Upload error for ${file.remote}:`, err);
        conn.end();
        process.exit(1);
      });
      
      writeStream.end(content);
    });
  });
});

conn.on('error', (err) => {
  console.error('SSH connection error:', err.message);
  process.exit(1);
});

console.log(`Connecting to ${config.host}...`);
conn.connect(config);