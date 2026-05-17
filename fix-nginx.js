const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  // Step 1: Remove conflicting config, show existing one
  const cmd1 = 'rm -f /etc/nginx/sites-enabled/webchat && echo "Removed webchat config" && echo "===EXISTING===" && cat /etc/nginx/sites-enabled/impulse';
  
  conn.exec(cmd1, (e, stream) => {
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