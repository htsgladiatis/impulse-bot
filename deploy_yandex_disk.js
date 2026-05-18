'use strict';
const { Client } = require('ssh2');
const fs = require('fs');

const code = fs.readFileSync('yandex-disk-server.js', 'utf-8');

const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    if (e) { console.error(e); c.end(); return; }
    sftp.writeFile('/opt/impulse-bot/yandex-disk.js', code, (e2) => {
      if (e2) console.error(e2);
      else console.log('yandex-disk.js uploaded OK');
      c.exec('node -c /opt/impulse-bot/yandex-disk.js && echo SYNTAX_OK && pm2 restart impulse-webchat && sleep 2 && pm2 logs impulse-webchat --lines 5 --nostream', (e3, s3) => {
        let o = '';
        s3.on('data', d => o += d);
        s3.stderr.on('data', d => o += d);
        s3.on('close', () => { console.log(o); c.end(); });
      });
    });
  });
});
c.on('error', e => { console.error(e.message); process.exit(1); });
c.connect({ host: '109.69.22.112', port: 22, username: 'root', password: 'And716443@' });