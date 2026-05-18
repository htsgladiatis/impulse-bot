const {Client} = require('ssh2');
const c = new Client();
c.on('ready', () => {
  // Fix line 27: use path.join instead of require.resolve
  const fix = [
    "cd /opt/impulse-bot/webchat",
    "sed -i \"s|const clientPath = require.resolve('socket.io/client-dist/socket.io.js');|const clientPath = path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js');|\" server.js",
    "pm2 restart impulse-webchat",
    "sleep 2",
    "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/socket.io.js",
    "echo",
    "curl -ksS -o /dev/null -w '%{http_code}' https://109.69.22.112/webchat/socket.io.js",
    "echo"
  ].join(' && ');
  c.exec(fix, (e, s) => {
    let o = '';
    s.on('data', d => o += d);
    s.stderr.on('data', d => o += d);
    s.on('close', () => { console.log(o); c.end(); });
  });
});
c.on('error', e => { console.error(e.message); process.exit(1); });
c.connect({host:'109.69.22.112',port:22,username:'root',password:'And716443@'});