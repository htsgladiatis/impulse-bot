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
    console.log('=== FULL INDEX.HTML ===');
    console.log(await runCmd(conn, 'cat /opt/impulse-bot/webchat/public/index.html 2>&1'));

    console.log('=== FULL SERVER.JS ===');
    console.log(await runCmd(conn, 'cat /opt/impulse-bot/webchat/server.js 2>&1'));

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