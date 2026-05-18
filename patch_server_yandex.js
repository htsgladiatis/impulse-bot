'use strict';
const { Client } = require('ssh2');

// Script to run ON the server that patches server.js
const patchScript = `
const fs = require('fs');
const path = '/opt/impulse-bot/webchat/server.js';
let code = fs.readFileSync(path, 'utf-8');
const oldStr = "const receiptUrl = await yandexDisk.uploadReceipt(tmpFile, s.transactionId, data.name";
if (code.includes(oldStr)) {
  code = code.replace(
    oldStr,
    'const receiptBuffer = require("fs").readFileSync(tmpFile);\\n      const receiptUrl = await yandexDisk.uploadReceiptBuffer(receiptBuffer, s.transactionId, data.name'
  );
  fs.writeFileSync(path, code);
  console.log('PATCHED');
} else {
  console.log('NOT_FOUND');
}
`;

const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    if (e) { console.error(e); c.end(); return; }
    
    // Upload patch script to server
    sftp.writeFile('/tmp/patch_yandex.js', patchScript, (e1) => {
      if (e1) { console.error(e1); c.end(); return; }
      console.log('Patch script uploaded');
      
      // Run the patch
      c.exec('node /tmp/patch_yandex.js', (e2, s2) => {
        let o = '';
        s2.on('data', d => o += d);
        s2.stderr.on('data', d => o += d);
        s2.on('close', () => {
          console.log('Patch result:', o.trim());
          if (o.includes('PATCHED')) {
            // Verify syntax and restart
            c.exec('node -c /opt/impulse-bot/webchat/server.js && echo SYNTAX_OK && pm2 restart impulse-webchat && sleep 2 && pm2 logs impulse-webchat --lines 5 --nostream', (e3, s3) => {
              let o3 = '';
              s3.on('data', d => o3 += d);
              s3.stderr.on('data', d => o3 += d);
              s3.on('close', () => {
                console.log(o3);
                c.end();
              });
            });
          } else {
            console.log('Patch not applied - pattern not found');
            c.end();
          }
        });
      });
    });
  });
});
c.on('error', e => { console.error(e.message); process.exit(1); });
c.connect({ host: '109.69.22.112', port: 22, username: 'root', password: 'And716443@' });