import paramiko, sys, io, os
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

sftp = ssh.open_sftp()

# 1. Fix server.js - change Socket.IO path
print("\n=== Fixing server.js ===")
server_js = r"""const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  path: '/webchat-ws'
});

const PORT = 3002;

// Store conversation states by socket id
const conversations = new Map();

// All bot questions/steps (same as bot.js on server)
const STEPS = [
  { field: 'clientName', text: 'Как зовут клиента?', buttons: null },
  { field: 'phone', text: 'Какой у клиента телефон?', buttons: null },
  { field: 'address', text: 'Какой адрес клиента?', buttons: null },
  { field: 'type', text: 'Что клиент хочет?', buttons: [
    {text: 'Кухня', value: 'Кухня'}, {text: 'Шкаф-купе', value: 'Шкаф-купе'},
    {text: 'Диван', value: 'Диван'}, {text: 'Кровать', value: 'Кровать'},
    {text: 'Другое', value: 'Другое'}
  ]},
  { field: 'comment', text: 'Комментарий к заказу (или "нет")', buttons: null },
  { field: 'amount', text: 'Предварительная сумма (₽) или "неизвестно"', buttons: null },
  { field: 'photo', text: 'Отправьте фото (или нажмите "Пропустить")', buttons: [
    {text: '⏭ Пропустить', value: 'skip'}
  ], fileUpload: true },
  { field: 'manager', text: 'Кто менеджер?', buttons: null },
  { field: 'source', text: 'Откуда клиент? (Реклама, Сайт, Звонок, Рекомендация)', buttons: [
    {text: 'Реклама', value: 'Реклама'}, {text: 'Сайт', value: 'Сайт'},
    {text: 'Звонок', value: 'Звонок'}, {text: 'Рекомендация', value: 'Рекомендация'}
  ]},
  { field: 'confirm', text: null, buttons: [
    {text: '✅ Подтвердить', value: 'confirm'}, {text: '✏️ Исправить', value: 'edit'}
  ]}
];

// Summary function
function buildSummary(data) {
  return [
    '📋 Проверьте запись:',
    '',
    data.clientName ? '👤 Клиент: ' + data.clientName : '',
    data.phone ? '📞 Телефон: ' + data.phone : '',
    data.address ? '📍 Адрес: ' + data.address : '',
    data.type ? '🔧 Изделие: ' + data.type : '',
    data.comment && data.comment !== 'нет' ? '💬 Комментарий: ' + data.comment : '',
    data.amount && data.amount !== 'неизвестно' ? '💰 Сумма: ' + data.amount + ' ₽' : '',
    data.photo ? '📸 Фото: прикреплено' : '',
    data.manager ? '👨‍💼 Менеджер: ' + data.manager : '',
    data.source ? '📢 Источник: ' + data.source : '',
    '',
    'Всё верно?'
  ].filter(Boolean).join('\n');
}

// Initialize conversation
function initConversation(socketId) {
  conversations.set(socketId, {
    step: 0,
    data: {},
    startedAt: Date.now()
  });
}

// Send bot message
function sendBotStep(socket, stepIdx) {
  const state = conversations.get(socket.id);
  if (!state) return;

  if (stepIdx >= STEPS.length) {
    // Done
    socket.emit('bot_message', {
      text: '✅ Запись сохранена! Спасибо за работу!',
      stepNum: STEPS.length
    });
    conversations.delete(socket.id);
    return;
  }

  const step = STEPS[stepIdx];

  // Special case: summary step
  if (step.field === 'confirm') {
    socket.emit('bot_message', {
      text: buildSummary(state.data),
      buttons: step.buttons,
      stepNum: stepIdx + 1
    });
    return;
  }

  socket.emit('bot_message', {
    text: step.text,
    buttons: step.buttons || [],
    stepNum: stepIdx + 1,
    fileUpload: step.fileUpload || false
  });
}

// Process user answer
function processAnswer(socket, value) {
  const state = conversations.get(socket.id);
  if (!state) return;

  const currentStep = STEPS[state.step];
  if (!currentStep) return;

  // Confirm step
  if (currentStep.field === 'confirm') {
    if (value === 'confirm') {
      // Save to file
      saveToWebchatFile(state.data, socket.id);
      socket.emit('bot_message', {
        text: '✅ Запись сохранена! Спасибо!',
        stepNum: STEPS.length
      });
      // Try to notify Telegram admin
      notifyTelegram(state.data);
      conversations.delete(socket.id);
    } else if (value === 'edit') {
      state.step = 3; // Go back to type selection
      state.data.type = '';
      sendBotStep(socket, 3);
    }
    return;
  }

  // Skip photo
  if (currentStep.field === 'photo' && value === 'skip') {
    state.data.photo = null;
  } else {
    state.data[currentStep.field] = value;
  }

  state.step++;
  sendBotStep(socket, state.step);
}

// Save to JSON file
function saveToWebchatFile(data, socketId) {
  const fs = require('fs');
  const filePath = path.join(__dirname, '..', 'webchat_records.json');

  let records = [];
  try {
    if (fs.existsSync(filePath)) {
      records = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading webchat records:', e.message);
  }

  records.push({
    ...data,
    timestamp: new Date().toISOString(),
    source: 'webchat',
    socketId
  });

  try {
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');
    console.log('[WEBCHAT] Record saved:', data.clientName);
  } catch (e) {
    console.error('Error saving webchat record:', e.message);
  }
}

// Notify Telegram admin
function notifyTelegram(data) {
  const https = require('https');
  const token = process.env.TG_BOT_TOKEN || '';
  const adminId = process.env.TG_ADMIN_ID || '';

  if (!token || !adminId) {
    console.log('[WEBCHAT] No TG_BOT_TOKEN or TG_ADMIN_ID, skipping notification');
    return;
  }

  const text = [
    '🌐 Новая запись с WEB-ЧАТА:',
    '',
    data.clientName ? '👤 ' + data.clientName : '',
    data.phone ? '📞 ' + data.phone : '',
    data.type ? '🔧 ' + data.type : '',
    data.amount && data.amount !== 'неизвестно' ? '💰 ' + data.amount + '₽' : '',
    data.manager ? '👨‍💼 ' + data.manager : '',
    data.source ? '📢 ' + data.source : '',
  ].filter(Boolean).join('\n');

  const url = 'https://api.telegram.org/bot' + token + '/sendMessage';

  const postData = JSON.stringify({
    chat_id: adminId,
    text: text
  });

  try {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('[WEBCHAT] Telegram notification sent');
        } else {
          console.log('[WEBCHAT] Telegram error:', res.statusCode, body);
        }
      });
    });
    req.on('error', (e) => console.error('[WEBCHAT] TG request error:', e.message));
    req.write(postData);
    req.end();
  } catch (e) {
    console.error('[WEBCHAT] notifyTelegram error:', e.message);
  }
}

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
  console.log('[WEBCHAT] Client connected:', socket.id);
  initConversation(socket.id);

  // Welcome + first question
  socket.emit('bot_message', {
    text: 'Добро пожаловать! Я помогу вам записать продажу. Давайте заполним карточку клиента.'
  });

  // Small delay then send first question
  setTimeout(() => {
    sendBotStep(socket, 0);
  }, 500);

  // Handle text messages
  socket.on('user_message', (data) => {
    if (!data.text) return;
    processAnswer(socket, data.text);
  });

  // Handle button clicks
  socket.on('button_click', (data) => {
    if (!data.value) return;
    processAnswer(socket, data.value);
  });

  // Handle file uploads
  socket.on('file_upload', (data) => {
    const state = conversations.get(socket.id);
    if (!state) return;

    const currentStep = STEPS[state.step];
    if (currentStep && currentStep.field === 'photo') {
      // Save file
      const fs = require('fs');
      const uploadDir = path.join(__dirname, '..', 'uploads', 'webchat');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileName = Date.now() + '_' + data.name;
      const filePath = path.join(uploadDir, fileName);

      // Extract base64 data
      const base64Data = data.data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

      state.data.photo = 'webchat/' + fileName;
      console.log('[WEBCHAT] File saved:', fileName);

      state.step++;
      sendBotStep(socket, state.step);
    }
  });

  socket.on('disconnect', () => {
    console.log('[WEBCHAT] Client disconnected:', socket.id);
    conversations.delete(socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'webchat', uptime: process.uptime() });
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log('WebChat server running on port ' + PORT);
  console.log('Health: http://localhost:' + PORT + '/health');
});
"""
with sftp.open('/opt/impulse-bot/webchat/server.js', 'w') as f:
    f.write(server_js)
print("  server.js updated (Socket.IO path: /webchat-ws)")

# 2. Fix index.html - change Socket.IO client path
print("\n=== Fixing index.html ===")
with sftp.open('/opt/impulse-bot/webchat/index.html', 'r') as f:
    html = f.read()

# Fix script src
html = html.replace('<script src="/socket.io/socket.io.js"></script>', 
                     '<script src="/webchat-ws/socket.io.js"></script>')
# Fix io() call
html = html.replace("const socket = io();", 
                     "const socket = io({ path: '/webchat-ws' });")

with sftp.open('/opt/impulse-bot/webchat/index.html', 'w') as f:
    f.write(html)
print("  index.html updated")

sftp.close()

# 3. Update nginx config
print("\n=== Updating nginx ===")
NGINX_CONF = r"""server {
    listen 443 ssl;
    server_name 109.69.22.112 impulse.is-a.dev;
    ssl_certificate /etc/nginx/ssl/impulse.crt;
    ssl_certificate_key /etc/nginx/ssl/impulse.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /webchat-ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

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

    location /webchat-ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

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
sftp = ssh.open_sftp()
with sftp.open('/etc/nginx/sites-enabled/impulse', 'w') as f:
    f.write(NGINX_CONF)
sftp.close()
print("  nginx config updated (added /webchat-ws for WebSocket)")

# 4. Reload nginx
run("nginx -t")
run("systemctl reload nginx")

# 5. Restart webchat
run("pm2 restart impulse-webchat")

# 6. Wait and test
import time
time.sleep(2)
run("curl -s http://localhost:3002/health")
run("curl -s http://localhost/webchat/health")
run("curl -s http://localhost/webchat/ | head -5")

ssh.close()
print("\nDone! Webchat available at: https://impulse.is-a.dev/webchat/")