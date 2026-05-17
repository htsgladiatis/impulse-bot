const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  const cmds = [
    // Check ref.json has data
    "cat /opt/impulse-bot/ref.json | head -30",
    '---',
    // Check recent PM2 logs for any errors after restart
    "pm2 logs impulse-webchat --lines 5 --nostream",
    '---',
    // Test that webchat page loads
    "curl -s http://localhost:3002/ | head -20",
  ];

  let i = 0;
  function runNext() {
    if (i >= cmds.length) { conn.end(); process.exit(0); return; }
    const cmd = cmds[i++];
    if (cmd === '---') { console.log('\n---'); runNext(); return; }
    conn.exec(cmd, (e, stream) => {
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => {
        console.log(`CMD: ${cmd.substring(0, 60)}`);
        console.log(out);
        runNext();
      });
    });
  }
  runNext();
});

conn.on('error', (err) => {
  console.error('SSH error:', err.message);
  process.exit(1);
});

console.log('Testing buttons...');
conn.connect({
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  password: 'And716443@',
  readyTimeout: 30000,
});