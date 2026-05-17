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

sftp = ssh.open_sftp()

# 1. Create public directory
run("mkdir -p /opt/impulse-bot/webchat/public")

# 2. Create index.html with fixed Socket.IO path
HTML = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Impulse — Запись продаж</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column;
    }
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      padding: 16px 20px; display: flex; align-items: center; gap: 12px;
      border-bottom: 1px solid #2a2a3e; flex-shrink: 0;
    }
    .header-logo {
      width: 40px; height: 40px;
      background: linear-gradient(135deg, #6c5ce7, #a29bfe);
      border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;
    }
    .header-info h1 { font-size: 16px; font-weight: 600; color: #fff; }
    .header-info .status { font-size: 12px; color: #6c5ce7; }
    .progress-bar { background: #1a1a2e; padding: 12px 20px; border-bottom: 1px solid #2a2a3e; flex-shrink: 0; }
    .progress-track { background: #2a2a3e; border-radius: 10px; height: 6px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #6c5ce7, #a29bfe); border-radius: 10px; transition: width 0.5s ease; width: 10%; }
    .progress-label { font-size: 11px; color: #888; margin-top: 6px; text-align: center; }
    .chat-area { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
    .chat-area::-webkit-scrollbar { width: 6px; }
    .chat-area::-webkit-scrollbar-track { background: transparent; }
    .chat-area::-webkit-scrollbar-thumb { background: #3a3a4e; border-radius: 3px; }
    .message { max-width: 85%; padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.5; animation: fadeIn 0.3s ease; white-space: pre-wrap; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .message.bot { align-self: flex-start; background: #1a1a2e; border: 1px solid #2a2a3e; border-bottom-left-radius: 4px; }
    .message.user { align-self: flex-end; background: linear-gradient(135deg, #6c5ce7, #5a4bd1); color: #fff; border-bottom-right-radius: 4px; }
    .buttons-container { display: flex; flex-wrap: wrap; gap: 8px; max-width: 85%; animation: fadeIn 0.3s ease; }
    .btn { padding: 10px 16px; background: #1e1e32; border: 1px solid #3a3a5e; border-radius: 12px; color: #a29bfe; font-size: 13px; cursor: pointer; transition: all 0.2s ease; text-align: left; word-break: break-word; }
    .btn:hover { background: #2a2a42; border-color: #6c5ce7; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .input-area { padding: 16px 20px; background: #1a1a2e; border-top: 1px solid #2a2a3e; display: flex; gap: 12px; align-items: center; flex-shrink: 0; }
    .input-area input { flex: 1; padding: 12px 16px; background: #0f0f1a; border: 1px solid #2a2a3e; border-radius: 12px; color: #e0e0e0; font-size: 14px; outline: none; transition: border-color 0.2s; }
    .input-area input:focus { border-color: #6c5ce7; }
    .input-area input::placeholder { color: #555; }
    .send-btn { width: 44px; height: 44px; background: linear-gradient(135deg, #6c5ce7, #5a4bd1); border: none; border-radius: 12px; color: #fff; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
    .send-btn:hover { transform: scale(1.05); }
    .send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
    .file-upload-area { display: none; padding: 12px 20px; background: #1a1a2e; border-top: 1px solid #2a2a3e; flex-shrink: 0; }
    .file-upload-area.active { display: flex; gap: 12px; align-items: center; }
    .file-upload-area label { padding: 10px 20px; background: #1e1e32; border: 2px dashed #3a3a5e; border-radius: 12px; color: #a29bfe; cursor: pointer; flex: 1; text-align: center; font-size: 13px; transition: all 0.2s; }
    .file-upload-area label:hover { border-color: #6c5ce7; background: #2a2a42; }
    .typing { display: none; align-self: flex-start; padding: 12px 16px; background: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 16px; border-bottom-left-radius: 4px; }
    .typing.active { display: flex; gap: 4px; }
    .typing span { width: 8px; height: 8px; background: #6c5ce7; border-radius: 50%; animation: typing 1.2s infinite; }
    .typing span:nth-child(2) { animation-delay: 0.2s; }
    .typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing { 0%, 60%, 100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-8px); opacity: 1; } }
    .welcome { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; text-align: center; }
    .welcome-icon { font-size: 48px; margin-bottom: 16px; }
    .welcome h2 { font-size: 20px; color: #fff; margin-bottom: 8px; }
    .welcome p { color: #888; font-size: 14px; }
    @media (max-width: 600px) { .message { max-width: 92%; } .buttons-container { max-width: 92%; } .header { padding: 12px 16px; } .chat-area { padding: 16px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-logo">⚡</div>
    <div class="header-info">
      <h1>Impulse — Запись продаж</h1>
      <div class="status" id="connectionStatus">Подключение...</div>
    </div>
  </div>
  <div class="progress-bar" id="progressBar" style="display:none;">
    <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
    <div class="progress-label" id="progressLabel">Шаг 1 из 10</div>
  </div>
  <div class="chat-area" id="chatArea">
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-icon">⚡</div>
      <h2>Impulse — Запись продаж</h2>
      <p>Подождите, загрузка...</p>
    </div>
  </div>
  <div class="file-upload-area" id="fileUploadArea">
    <label>📸 Выберите фото чека<input type="file" id="fileInput" accept="image/*"></label>
  </div>
  <div class="input-area">
    <input type="text" id="messageInput" placeholder="Введите сообщение..." autocomplete="off">
    <button class="send-btn" id="sendBtn">➤</button>
  </div>
  <script src="/webchat-ws/socket.io.js"></script>
  <script>
    const socket = io({ path: '/webchat-ws' });
    const chatArea = document.getElementById('chatArea');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const connectionStatus = document.getElementById('connectionStatus');
    const welcomeScreen = document.getElementById('welcomeScreen');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const progressLabel = document.getElementById('progressLabel');
    const fileUploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('fileInput');

    socket.on('connect', () => { connectionStatus.textContent = '● В сети'; connectionStatus.style.color = '#6c5ce7'; });
    socket.on('disconnect', () => { connectionStatus.textContent = '● Отключён'; connectionStatus.style.color = '#e74c3c'; });

    socket.on('bot_message', (data) => {
      if (welcomeScreen) { welcomeScreen.style.display = 'none'; progressBar.style.display = 'block'; }
      const typingEl = document.querySelector('.typing.active');
      if (typingEl) typingEl.remove();
      addMessage(data.text, 'bot');
      if (data.stepNum) { const p = (data.stepNum / 10) * 100; progressFill.style.width = p + '%'; progressLabel.textContent = 'Шаг ' + data.stepNum + ' из 10'; }
      if (data.buttons && data.buttons.length > 0) addButtons(data.buttons);
      if (data.fileUpload) { fileUploadArea.classList.add('active'); } else { fileUploadArea.classList.remove('active'); }
      scrollToBottom();
    });

    function sendMessage() {
      const text = messageInput.value.trim();
      if (!text) return;
      addMessage(text, 'user');
      socket.emit('user_message', { text });
      messageInput.value = '';
      showTyping();
      scrollToBottom();
    }
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    function addMessage(text, type) {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.textContent = text;
      chatArea.appendChild(div);
      scrollToBottom();
    }

    function addButtons(buttons) {
      const container = document.createElement('div');
      container.className = 'buttons-container';
      buttons.forEach(btn => {
        const el = document.createElement('button');
        el.className = 'btn';
        el.textContent = btn.text;
        el.addEventListener('click', () => {
          addMessage(btn.text, 'user');
          socket.emit('button_click', { value: btn.value, index: btn.index });
          container.remove();
          showTyping();
          scrollToBottom();
        });
        container.appendChild(el);
      });
      chatArea.appendChild(container);
      scrollToBottom();
    }

    function showTyping() {
      const existing = document.querySelector('.typing');
      if (existing) existing.remove();
      const div = document.createElement('div');
      div.className = 'typing active';
      div.innerHTML = '<span></span><span></span><span></span>';
      chatArea.appendChild(div);
      scrollToBottom();
    }

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      addMessage('📸 Фото: ' + file.name, 'user');
      const reader = new FileReader();
      reader.onload = () => {
        socket.emit('file_upload', { name: file.name, type: file.type, data: reader.result });
        showTyping();
      };
      reader.readAsDataURL(file);
      fileUploadArea.classList.remove('active');
    });

    function scrollToBottom() { requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; }); }
    messageInput.focus();
  </script>
</body>
</html>"""

with sftp.open('/opt/impulse-bot/webchat/public/index.html', 'w') as f:
    f.write(HTML)
print("  public/index.html created")

# 3. Update nginx config
NGINX_CONF = """server {
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

with sftp.open('/etc/nginx/sites-enabled/impulse', 'w') as f:
    f.write(NGINX_CONF)
sftp.close()
print("  nginx config updated")

# 4. Reload and restart
run("nginx -t")
run("systemctl reload nginx")
run("pm2 restart impulse-webchat")

import time
time.sleep(2)
run("curl -s http://localhost:3002/health")
run("curl -s http://localhost/webchat/health")

ssh.close()
print("\nDone!")