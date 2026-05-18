'use strict';
const { Client } = require('ssh2');
const fs = require('fs');

const yandexCode = fs.readFileSync('yandex-disk-server.js', 'utf-8');

// Вебчат server.js — замена uploadReceipt(tmpFile, ...) на uploadReceiptBuffer(buffer, ...)
const serverFix = `
// Read file into buffer instead of passing tmpFile path
const receiptBuffer = require('fs').readFileSync(tmpFile);
const receiptUrl = await yandexDisk.uploadReceiptBuffer(receiptBuffer, s.transactionId, data.name);
`;

const c = new Client();
c.on('ready', () => {
  c.sftp((e, sftp) => {
    if (e) { console.error(e); c.end(); return; }

    // 1. Upload yandex-disk.js
    sftp.writeFile('/opt/impulse-bot/yandex-disk.js', yandexCode, (e1) => {
      if (e1) console.error('yandex-disk.js error:', e1);
      else console.log('[1/2] yandex-disk.js uploaded OK');

      // 2. Fix webchat/server.js line 123
      c.exec("sed -n '120,126p' /opt/impulse-bot/webchat/server.js", (e2, s2) => {
        let o = '';
        s2.on('data', d => o += d);
        s2.on('close', () => {
          console.log('Current lines 120-126:', o);

          // Replace the problematic line
          c.exec("sed -i 's|const receiptUrl = await yandexDisk.uploadReceipt(tmpFile, s.transactionId, data.name);|const receiptBuffer = require(\"fs\").readFileSync(tmpFile);const receiptUrl = await yandexDisk.uploadReceiptBuffer(receiptBuffer, s.transactionId, data.name);|' /opt/impulse-bot/webchat/server.js", (e3, s3) => {
            let o3 = '';
            s3.on('data', d => o3 += d);
            s3.stderr.on('data', d => o3 += d);
            s3.on('close', () => {
              console.log('[2/2] server.js patched:', o3 || 'OK');

              // Verify syntax and restart
              c.exec('node -c /opt/impulse-bot/yandex-disk.js && echo YANDEX_SYNTAX_OK && node -c /opt/impulse-bot/webchat/server.js && echo SERVER_SYNTAX_OK', (e4, s4) => {
                let o4 = '';
                s4.on('data', d => o4 += d);
                s4.stderr.on('data', d => o4 += d);
                s4.on('close', () => {
                  console.log('Syntax check:', o4);

                  if (o4.includes('YANDEX_SYNTAX_OK') && o4.includes('SERVER_SYNTAX_OK')) {
                    c.exec('pm2 restart impulse-webchat && sleep 3 && pm2 logs impulse-webchat --lines 8 --nostream', (e5, s5) => {
                      let o5 = '';
                      s5.on('data', d => o5 += d);
                      s5.stderr.on('data', d => o5 += d);
                      s5.on('close', () => {
                        console.log('Restart result:', o5);
                        c.end();
                      });
                    });
                  } else {
                    console.log('SYNTAX ERRORS - not restarting');
                    c.end();
                  }
                });
              });
            });
          });
        });
      });
    });
  });
});
c.on('error', e => { console.error(e.message); process.exit(1); });
c.connect({ host: '109.69.22.112', port: 22, username: 'root', password: 'And716443@' });