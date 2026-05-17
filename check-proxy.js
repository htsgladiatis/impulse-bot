const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  const cmd = [
    'cat /opt/impulse-bot/pm2.config.js',
    '===SEP===',
    'ls -la /etc/nginx/sites-enabled/',
    '===SEP===',
    'cat /etc/nginx/sites-enabled/* 2>/dev/null || echo "empty"',
    '===SEP===',
    'cat /etc/nginx/conf.d/*.conf 2>/dev/null || echo "no conf.d"',
    '===SEP===',
    'curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/',
    '===SEP===',
    'curl -s http://localhost:3001/health',
    '===SEP===',
    'curl -s -o /dev/null -w "%{http_code}" https://109.69.22.112/ --insecure',
    '===SEP===',
    'ss -tlnp | grep -E "80|443|3001|3002"',
    '===SEP===',
    'pm2 ls',
  ].join(' && echo "NEXT_CMD" && ');

  conn.exec(cmd, (e, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => {
      console.log(out);
      conn.end();
      process.exit(0);
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