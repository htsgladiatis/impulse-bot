const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  const cmds = [
    // Check refDictionary exports
    "cd /opt/impulse-bot && node -e \"const ref=require('./services/refDictionary');console.log('type:',typeof ref);console.log('keys:',Object.keys(ref));console.log('getRef type:',typeof ref.getRef);console.log('load type:',typeof ref.load);\"",
    '---',
    // Try loading manually
    "cd /opt/impulse-bot && node -e \"const ref=require('./services/refDictionary');if(typeof ref.load==='function'){ref.load();console.log('loaded OK');}const r=typeof ref.getRef==='function'?ref.getRef():ref._data;console.log('result:',JSON.stringify(r?.managers?.slice(0,2)));console.log('full type:',typeof r);\"",
    '---',
    // Check if webchat server.js has a different import path
    "head -15 /opt/impulse-bot/webchat/server.js",
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
        console.log(`CMD: ${cmd.substring(0, 80)}`);
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