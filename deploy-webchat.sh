#!/bin/bash
# Deploy webchat with fixed Socket.IO path and nginx config
# Run this from the server or pipe via ssh

set -e

echo "=== 1. Copy webchat files ==="
# Files should already be copied via pscp

echo "=== 2. Update nginx config for /webchat websocket proxy ==="
cat > /etc/nginx/sites-enabled/default << 'NGINX'
server {
    listen 80;
    server_name 109.69.22.112;

    client_max_body_size 20m;

    # Webchat Socket.IO - websocket support
    location /webchat {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    # Webchat static files
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Telegram MiniApp on port 3001
    location /miniapp {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX

echo "=== 3. Test nginx config ==="
nginx -t

echo "=== 4. Reload nginx ==="
systemctl reload nginx

echo "=== 5. Restart webchat via PM2 ==="
cd /opt/impulse-bot
pm2 restart impulse-webchat 2>/dev/null || pm2 start pm2.config.js --only impulse-webchat

echo "=== 6. Check status ==="
pm2 status
echo ""
echo "=== 7. Health check ==="
sleep 2
curl -s http://localhost:3002/health
echo ""
echo "=== DONE ==="