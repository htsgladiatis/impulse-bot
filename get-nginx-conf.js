const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  conn.exec('cat /etc/nginx/sites-enabled/impulse', (e1, s1) => {
    let o1 = '';
    s1.on('data', d => o1 += d);
    s1.stderr.on('data', d => o1 += d);
    s1.on('close', () => {
      console.log('=== NGINX IMPULSE CONFIG ===');
      console.log(o1);
      conn.end();
      process.exit(0);
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