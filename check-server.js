const { Client } = require('ssh2');
const conn = new Client();

const cmds = [
  'cat /etc/nginx/sites-enabled/default 2>/dev/null || cat /etc/nginx/conf.d/default.conf 2>/dev/null || echo "No nginx config found"',
  '===NGINX_CONF_END===',
  'pm2 logs impulse-webchat --lines 15 --nostream 2>&1',
  '===PM2_LOGS_END===',
  'cat /opt/impulse-bot/webchat/server.js | head -5',
  '===SERVER_HEAD_END===',
  'curl -s http://localhost:3002/health',
  'curl -s http://localhost:3001/health 2>/dev/null || echo "port 3001 not responding"',
];

conn.on('ready', () => {
  console.log('SSH connected!');
  const cmd = cmds.filter(c => !c.startsWith('===')).join(' && echo "SEPARATOR" && ');
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