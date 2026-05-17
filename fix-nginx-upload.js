const { Client } = require('ssh2');
const conn = new Client();

const NEW_CONFIG = "server {\n    listen 443 ssl;\n    server_name 109.69.22.112 impulse.is-a.dev;\n    ssl_certificate /etc/nginx/ssl/impulse.crt;\n    ssl_certificate_key /etc/nginx/ssl/impulse.key;\n    ssl_protocols TLSv1.2 TLSv1.3;\n\n    client_max_body_size 20m;\n\n    location /webchat-ws {\n        proxy_pass http://127.0.0.1:3002;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection \"upgrade\";\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_read_timeout 86400;\n    }\n\n    location /webchat/ {\n        proxy_pass http://127.0.0.1:3002/;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        client_max_body_size 20m;\n    }\n\n    location / {\n        proxy_pass http://127.0.0.1:3001;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n}\n\nserver {\n    listen 80;\n    server_name 109.69.22.112 impulse.is-a.dev;\n\n    location /webchat-ws {\n        proxy_pass http://127.0.0.1:3002;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection \"upgrade\";\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_read_timeout 86400;\n    }\n\n    location /webchat/ {\n        proxy_pass http://127.0.0.1:3002/;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        client_max_body_size 20m;\n    }\n\n    location / {\n        proxy_pass http://127.0.0.1:3001;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }\n}";

function runCmd(c, cmd) {
  return new Promise((resolve, reject) => {
    c.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      stream.on('data', d => { out += d.toString(); });
      stream.stderr.on('data', d => { out += d.toString(); });
      stream.on('close', () => resolve(out));
    });
  });
}

conn.on('ready', async () => {
  try {
    // Write new nginx config via base64 to avoid shell escaping issues
    const b64 = Buffer.from(NEW_CONFIG).toString('base64');
    const result1 = await runCmd(conn, `echo ${b64} | base64 -d > /etc/nginx/sites-enabled/impulse`);
    console.log('Config written:', result1 || 'OK');

    // Test nginx config
    const result2 = await runCmd(conn, 'nginx -t 2>&1');
    console.log('Nginx test:', result2);

    // Reload nginx
    const result3 = await runCmd(conn, 'nginx -s reload 2>&1');
    console.log('Nginx reload:', result3 || 'OK');

    // Restart webchat
    const result4 = await runCmd(conn, 'pm2 restart impulse-webchat 2>&1');
    console.log('PM2 restart:', result4);

    conn.end();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    conn.end();
    process.exit(1);
  }
});

conn.on('error', (err) => {
  console.error('SSH error:', err.message);
  process.exit(1);
});

conn.connect({
  host: '109.69.22.112',
  port: 22,
  username: 'root',
  password: 'And716443@',
  readyTimeout: 30000,
});