const { Client } = require('ssh2');
const conn = new Client();

conn.on('ready', () => {
  console.log('SSH connected!');
  
  // Check current state
  const checkCmd = 'ls -la /etc/nginx/sites-enabled/ && echo "===" && ls -la /etc/nginx/sites-available/ && echo "===" && ls /etc/ssl/certs/ 2>/dev/null | head -5 && echo "===" && ls /etc/nginx/snippets/snakeoil.* 2>/dev/null || echo "no snakeoil" && echo "===" && cat /etc/nginx/sites-enabled/default 2>/dev/null || echo "no default site" && echo "===" && nginx -T 2>&1 | grep -A5 "server_name\\|listen\\|proxy_pass" | head -40';
  
  conn.exec(checkCmd, (e, stream) => {
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => {
      console.log('Current nginx state:');
      console.log(out);
      
      // Create nginx config for webchat
      const nginxConf = `# Webchat proxy config
server {
    listen 80;
    server_name 109.69.22.112;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
`;

      // Write config
      conn.exec(`cat > /etc/nginx/sites-enabled/webchat << 'NGINXEOF'\n${nginxConf}\nNGINXEOF`, (e2, s2) => {
        let out2 = '';
        s2.on('data', d => out2 += d);
        s2.stderr.on('data', d => out2 += d);
        s2.on('close', () => {
          console.log('\nWrite config:', out2 || 'OK');
          
          // Test
          conn.exec('nginx -t 2>&1', (e3, s3) => {
            let out3 = '';
            s3.on('data', d => out3 += d);
            s3.stderr.on('data', d => out3 += d);
            s3.on('close', () => {
              console.log('Nginx test:', out3);
              
              if (out3.includes('syntax is ok') && out3.includes('test is successful')) {
                // Reload
                conn.exec('nginx -s reload 2>&1 && echo "RELOAD_OK"', (e4, s4) => {
                  let out4 = '';
                  s4.on('data', d => out4 += d);
                  s4.stderr.on('data', d => out4 += d);
                  s4.on('close', () => {
                    console.log('Reload:', out4);
                    
                    // Test proxy
                    setTimeout(() => {
                      conn.exec('curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost/ && echo "" && curl -s http://localhost/ | head -3 && echo "===SOCKET===" && curl -s http://localhost/socket.io/?EIO=4 | head -1', (e5, s5) => {
                        let out5 = '';
                        s5.on('data', d => out5 += d);
                        s5.stderr.on('data', d => out5 += d);
                        s5.on('close', () => {
                          console.log('\n=== PROXY TEST ===');
                          console.log(out5);
                          conn.end();
                          process.exit(0);
                        });
                      });
                    }, 1000);
                  });
                });
              } else {
                console.log('Nginx config test failed! Not reloading.');
                conn.end();
                process.exit(1);
              }
            });
          });
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