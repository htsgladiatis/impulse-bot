const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const jumpConfig = {
  host: '155.212.228.101',
  port: 22,
  username: 'root',
  privateKey: fs.readFileSync('C:\\Users\\user\\.ssh\\id_ed25519'),
  readyTimeout: 15000,
};

const targetConfig = {
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  readyTimeout: 15000,
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

console.log('Connecting to jump host', jumpConfig.host, '...');
const jumpConn = new Client();

jumpConn.on('ready', () => {
  console.log('Jump host connected! Connecting to target...');
  
  jumpConn.forwardOut('127.0.0.1', 0, targetConfig.host, targetConfig.port, (err, stream) => {
    if (err) {
      console.error('Forward error:', err);
      jumpConn.end();
      process.exit(1);
    }
    
    const targetConn = new Client();
    
    targetConn.on('ready', () => {
      console.log('Target connected!');
      
      targetConn.sftp((err, sftp) => {
        if (err) {
          console.error('SFTP error:', err);
          targetConn.end();
          jumpConn.end();
          process.exit(1);
        }
        
        let uploaded = 0;
        
        files.forEach((file) => {
          const content = fs.readFileSync(file.local);
          console.log(`Uploading ${file.local} -> ${file.remote} (${content.length} bytes)`);
          
          const ws = sftp.createWriteStream(file.remote, { mode: 0o644 });
          
          ws.on('close', () => {
            console.log(`  ✓ Uploaded: ${file.remote}`);
            uploaded++;
            
            if (uploaded === files.length) {
              console.log('\nAll files uploaded! Restarting PM2...');
              
              targetConn.exec('cd /opt/impulse-bot && pm2 restart impulse-webchat', (err, stream) => {
                if (err) {
                  console.error('PM2 error:', err);
                  targetConn.end();
                  jumpConn.end();
                  process.exit(1);
                }
                
                let output = '';
                stream.on('data', (d) => { output += d.toString(); });
                stream.stderr.on('data', (d) => { output += d.toString(); });
                
                stream.on('close', (code) => {
                  console.log(`PM2 exit: ${code}\n${output}`);
                  
                  targetConn.exec('curl -s http://localhost:3002/health', (err, s2) => {
                    let h = '';
                    s2.on('data', (d) => { h += d.toString(); });
                    s2.on('close', () => {
                      console.log('\nHealth:', h.trim());
                      targetConn.end();
                      jumpConn.end();
                      console.log('\n✅ Deploy complete!');
                      process.exit(0);
                    });
                  });
                });
              });
            }
          });
          
          ws.on('error', (err) => {
            console.error(`  ✗ Error:`, err);
            targetConn.end();
            jumpConn.end();
            process.exit(1);
          });
          
          ws.end(content);
        });
      });
    });
    
    targetConn.on('error', (err) => {
      console.error('Target SSH error:', err.message);
      jumpConn.end();
      process.exit(1);
    });
    
    targetConn.connect({ ...targetConfig, sock: stream });
  });
});

jumpConn.on('error', (err) => {
  console.error('Jump host error:', err.message);
  process.exit(1);
});

jumpConn.connect(jumpConfig);