# Impulse Webchat — Деплой на сервер

## Шаг 1: Скопировать файлы на сервер

```cmd
pscp -r C:\Users\user\Desktop\cline\impulse-bot\webchat root@109.69.22.112:/opt/impulse-bot/webchat
```

## Шаг 2: На сервере — установить зависимости

```bash
cd /opt/impulse-bot/webchat && npm install --production
```

## Шаг 3: Добавить в PM2

```bash
cd /opt/impulse-bot && pm2 start webchat/server.js --name impulse-webchat -- --env production
pm2 save
```

## Шаг 4: Проверить

```bash
pm2 status
curl -s http://localhost:3002/health
```

## Шаг 5: Nginx — добавить location для /webchat

Добавить в server блок с доменом impulse.is-a.dev:

```nginx
# Webchat
location /webchat/ {
    proxy_pass http://127.0.0.1:3002/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
}
```

Затем:
```bash
nginx -t && systemctl reload nginx
```

## Шаг 6: Открыть в браузере

https://impulse.is-a.dev/webchat/