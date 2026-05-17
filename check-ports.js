const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  const cmds = [
    'ss -tlnp | grep -E "80|443|3001|3002"',
    '---',
    'curl -s http://localhost:3002/ | head -5',
    '---',
    'curl -s http://localhost:3001/ | head -5',
    '---',
    'pm2 ls',
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
        console.log(`CMD: ${cmd}`);
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

console.log('Connecting...');
conn.connect({
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  password: 'And716443@',
  readyTimeout: 30000,
});