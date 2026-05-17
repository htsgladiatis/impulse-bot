import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("109.69.22.112", username="root", password="And716443@", timeout=15)
print("Connected!")

def run(cmd):
    print(f"> {cmd}")
    _, o, e = ssh.exec_command(cmd, timeout=60)
    out = o.read().decode(errors='replace')
    err = e.read().decode(errors='replace')
    if out: print(out)
    if err: print(err)
    return out, err

# New nginx config with webchat location
NGINX_CONF = """server {
    listen 443 ssl;
    server_name 109.69.22.112 impulse.is-a.dev;
    ssl_certificate /etc/nginx/ssl/impulse.crt;
    ssl_certificate_key /etc/nginx/ssl/impulse.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /webchat/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name 109.69.22.112 impulse.is-a.dev;

    location /webchat/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
"""

# Write new config
sftp = ssh.open_sftp()
with sftp.open('/etc/nginx/sites-enabled/impulse', 'w') as f:
    f.write(NGINX_CONF)
sftp.close()
print("Nginx config updated!")

# Test and reload
run("nginx -t")
run("systemctl reload nginx")
run("curl -s http://localhost:3002/health")
run("curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/webchat/")

ssh.close()
print("Done!")