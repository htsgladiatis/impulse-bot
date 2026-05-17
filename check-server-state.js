const { Client } = require('ssh2');
const conn = new Client();

function runCmd(c, cmd) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d.toString(); });
      stream.stderr.on('data', d => { out += d.toString(); });
      stream.on('close', () => resolve(out));
    });
  });
}

conn.on('ready', async () => {
  try {
    console.log('=== MINIAPP FILES ===');
    console.log(await runCmd(conn, 'ls -la /opt/impulse-bot/miniapp/ 2>&1'));

    console.log('=== PM2 CONFIG ===');
    console.log(await runCmd(conn, 'cat /opt/impulse-bot/pm2.config.js 2>&1'));

    console.log('=== PM2 STATUS ===');
    console.log(await runCmd(conn, 'pm2 list 2>&1'));

    console.log('=== HEALTH CHECK ===');
    console.log(await runCmd(conn, 'curl -s http://localhost:3001/health 2>&1'));

    conn.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    conn.end();
    process.exit(1);
  }
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