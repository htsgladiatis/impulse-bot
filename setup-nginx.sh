#!/bin/bash
set -e

echo "=== Installing nginx ==="
apt update -qq && apt install -y -qq nginx openssl

echo "=== Creating SSL certificate ==="
mkdir -p /etc/nginx/ssl
if [ ! -f /etc/nginx/ssl/impulse.crt ]; then
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/impulse.key \
    -out /etc/nginx/ssl/impulse.crt \
    -subj "/CN=109.69.22.112"
  echo "Certificate created"
else
  echo "Certificate already exists"
fi

echo "=== Configuring nginx ==="
cat > /etc/nginx/sites-available/impulse << 'NGINX'
server {
    listen 443 ssl;
    server_name 109.69.22.112;

    ssl_certificate /etc/nginx/ssl/impulse.crt;
    ssl_certificate_key /etc/nginx/ssl/impulse.key;

    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/impulse /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "=== Testing nginx config ==="
nginx -t

echo "=== Starting nginx ==="
systemctl enable nginx
systemctl restart nginx

echo "=== Status ==="
systemctl status nginx --no-pager
curl -sk https://localhost:443/ | head -5

echo "=== DONE ==="