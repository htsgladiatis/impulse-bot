/**
 * Deploy webchat v2 - Socket.IO с path=/webchat + nginx WebSocket proxy
 * 
 * Usage: node deploy-webchat-v2.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SSH_HOST = 'root@109.69.22.112';
const REMOTE_DIR = '/opt/impulse-bot';

function ssh(cmd) {
  try {
    return execSync(`ssh ${SSH_HOST} "${cmd}"`, { encoding: 'utf-8', timeout: 30000 });
  } catch (e) {
    console.error(`SSH error: ${e.message}`);
    return null;
  }
}

function scp(localPath, remotePath) {
  try {
    execSync(`scp "${localPath}" ${SSH_HOST}:"${remotePath}"`, { encoding: 'utf-8', timeout: 30000 });
    return true;
  } catch (e) {
    console.error(`SCP error: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('=== Deploy Webchat v2 ===\n');

  // 1. Test SSH
  console.log('1. Testing SSH...');
  const test = ssh('echo OK');
  if (!test || !test.trim().includes('OK')) {
    console.error('❌ SSH connection failed. Make sure SSH key is configured.');
    process.exit(1);
  }
  console.log('✅ SSH OK\n');

  // 2. Copy files
  console.log('2. Copying webchat files...');
  const files = [
    { local: 'webchat/server.js', remote: `${REMOTE_DIR}/webchat/server.js` },
    { local: 'webchat/public/index.html', remote: `${REMOTE_DIR}/webchat/public/index.html` }
  ];
  
  for (const f of files) {
    const localPath = path.join(__dirname, f.local);
    if (!fs.existsSync(localPath)) {
      console.error(`❌ File not found: ${localPath}`);
      process.exit(1);
    }
    console.log(`   Copying ${f.local}...`);
    if (!scp(localPath, f.remote)) {
      console.error(`❌ Failed to copy ${f.local}`);
      process.exit(1);
    }
  }
  console.log('✅ Files copied\n');

  // 3. Update nginx
  console.log('3. Updating nginx config...');
  const nginxConfig = `
server {
    listen 80;
    server_name 109.69.22.112;

    client_max_body_size 20m;

    # Webchat Socket.IO - websocket support
    location /webchat {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    # Webchat static files (root)
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Telegram MiniApp on port 3001
    location /miniapp {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}`;

  // Write nginx config via heredoc
  const nginxCmd = `cat > /etc/nginx/sites-enabled/default << 'NGINEOF'
${nginxConfig}
NGINEOF`;
  ssh(nginxCmd);
  
  // Test and reload
  const nginxTest = ssh('nginx -t 2>&1');
  console.log('   nginx -t:', nginxTest?.trim());
  
  ssh('systemctl reload nginx');
  console.log('✅ Nginx reloaded\n');

  // 4. Restart PM2
  console.log('4. Restarting webchat via PM2...');
  const pm2Result = ssh(`cd ${REMOTE_DIR} && pm2 restart impulse-webchat 2>&1 || pm2 start pm2.config.js --only impulse-webchat 2>&1`);
  console.log('   PM2:', pm2Result?.trim().substring(0, 200));
  console.log('✅ PM2 restarted\n');

  // 5. Health check
  console.log('5. Health check...');
  await new Promise(r => setTimeout(r, 2000));
  const health = ssh('curl -s http://localhost:3002/health');
  console.log('   Health:', health?.trim());
  
  // 6. Status
  const status = ssh('pm2 status --no-color');
  console.log('\n' + (status?.trim() || 'No status'));
  
  console.log('\n=== DONE ===');
  console.log('🌐 Webchat: http://109.69.22.112/');
  console.log('📡 Socket.IO path: /webchat');
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});