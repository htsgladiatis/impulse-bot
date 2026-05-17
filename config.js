'use strict';

// Load .env if present (local dev only; VPS uses PM2 env or process.env)
try { require('dotenv').config(); } catch (_e) { /* dotenv is optional */ }

const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '',
  },
  vk: {
    token: process.env.VK_GROUP_TOKEN || '',
    groupId: process.env.VK_GROUP_ID || '',
    confirmationCode: process.env.VK_CONFIRMATION_CODE || '',
    secretKey: process.env.VK_SECRET_KEY || '',
  },
  google: {
    spreadsheetId: process.env.SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '',
    credentials: process.env.GOOGLE_CREDENTIALS_JSON
      ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
      : null,
  },
  yandex: {
    token: process.env.YANDEX_DISK_TOKEN || '',
  },
  adminIds: (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  session: {
    store: process.env.SESSION_STORE || 'memory',
  },
  port: parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;