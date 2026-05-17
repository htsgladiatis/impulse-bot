const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  conn.exec('grep -n "socket\\|addButtons\\|buttons-container\\|bot_message" /opt/impulse-bot/webchat/public/index.html', (e, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => {
      console.log('=== GREP ===');
      console.log(out);
      
      // Also check the sendBot output for managers step
      conn.exec('cd /opt/impulse-bot && node -e "const ref=require(\'./services/refDictionary\');const r=ref.getRef();console.log(\'managers:\',JSON.stringify(r.managers?.slice(0,3)));console.log(\'count:\',r.managers?.length)"', (e2, s2) => {
        let out2 = '';
        s2.on('data', d => out2 += d);
        s2.stderr.on('data', d => out2 += d);
        s2.on('close', () => {
          console.log('=== REF TEST ===');
          console.log(out2);
          conn.end();
          process.exit(0);
        });
      });
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