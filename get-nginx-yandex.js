const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  // Step 1: nginx config
  conn.exec('nginx -T 2>&1 | head -100', (e1, s1) => {
    let o1 = '';
    s1.on('data', d => o1 += d);
    s1.stderr.on('data', d => o1 += d);
    s1.on('close', () => {
      console.log('=== NGINX CONFIG (first 100 lines) ===');
      console.log(o1);
      
      // Step 2: yandexDisk service
      conn.exec('cat /opt/impulse-bot/services/yandexDisk.js', (e2, s2) => {
        let o2 = '';
        s2.on('data', d => o2 += d);
        s2.stderr.on('data', d => o2 += d);
        s2.on('close', () => {
          console.log('\n=== YANDEX DISK SERVICE ===');
          console.log(o2);
          
          // Step 3: nginx conf.d
          conn.exec('ls -la /etc/nginx/conf.d/ 2>&1', (e3, s3) => {
            let o3 = '';
            s3.on('data', d => o3 += d);
            s3.stderr.on('data', d => o3 += d);
            s3.on('close', () => {
              console.log('\n=== NGINX CONF.D ===');
              console.log(o3);
              conn.end();
              process.exit(0);
            });
          });
        });
      });
    });
  });
});

conn.on('error', (err) => {
  console.error('SSH error:', err.message);
  process.exit(1);
});

conn.connect({
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  password: 'And716443@',
  readyTimeout: 30000,
});