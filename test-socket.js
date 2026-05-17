const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  const cmds = [
    // Test socket.io handshake through nginx
    'curl -sv "http://localhost/webchat-ws/?EIO=4&transport=polling" 2>&1 | head -30',
    '---',
    // Test direct to port 3002
    'curl -sv "http://localhost:3002/webchat-ws/?EIO=4&transport=polling" 2>&1 | head -30',
    '---',
    // Test socket.io.js file through nginx
    'curl -s -o /dev/null -w "HTTP %{http_code} size:%{size_download}" "http://localhost/webchat-ws/socket.io.js"',
    '---',
    // Reload nginx
    'nginx -s reload 2>&1 && echo "RELOAD_OK"',
    '---',
    // Test again after reload
    'curl -s "http://localhost/webchat-ws/?EIO=4&transport=polling" | head -5',
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