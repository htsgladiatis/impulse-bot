'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Reuse existing services
const ref = require('../services/refDictionary');
const sheets = require('../services/googleSheets');
const cart = require('../controllers/cart');
const sales = require('../controllers/sales');
const report = require('../controllers/report');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10e6,
  path: '/webchat-ws',
  cors: { origin: '*' }
});

const PORT = process.env.WEBCHAT_PORT || 3002;

// Serve socket.io client JS — nginx strips /webchat/ prefix so request arrives as /socket.io.js
app.get('/socket.io.js', (req, res) => {
  const clientPath = path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js');
  res.sendFile(clientPath);
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'webchat', uptime: process.uptime() }));

// Sessions store
const sessions = new Map();

async function getRef() {
  return typeof ref.getRef === 'function' ? await ref.getRef() : (ref._data || {});
}

function parseNum(text) {
  const n = parseFloat(String(text).replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? null : n;
}

function sendBot(socket, session, text, opts = {}) {
  socket.emit('bot_message', {
    text,
    step: session.step,
    stepNum: opts.stepNum || null,
    buttons: opts.buttons || null,
    paginated: opts.paginated || false,
    fileUpload: opts.fileUpload || false
  });
}

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  const session = sales.createInitialSession('web-user', 'web');
  session._socketId = socket.id;
  sessions.set(socket.id, session);

  socket.emit('bot_message', {
    text: `📅 Дата: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n\n🔢 Шаг 1/10 — Введите номер терминала:`,
    step: 'terminal_number',
    stepNum: 1
  });

  socket.on('user_message', async (data) => {
    const s = sessions.get(socket.id);
    if (!s) return;
    const text = (data.text || '').trim();
    if (!text) return;
    try {
      await handleText(socket, s, text);
    } catch (err) {
      console.error('Text error:', err);
      socket.emit('bot_message', { text: '❌ Ошибка. Попробуйте ещё раз.' });
    }
  });

  socket.on('button_click', async (data) => {
    const s = sessions.get(socket.id);
    if (!s) return;
    try {
      await handleButton(socket, s, data.value);
    } catch (err) {
      console.error('Button error:', err);
      socket.emit('bot_message', { text: '❌ Ошибка. Попробуйте ещё раз.' });
    }
  });

  socket.on('file_upload', async (data) => {
    const s = sessions.get(socket.id);
    if (!s || s.step !== 'waiting_receipt') return;

    if (!data || !data.data) {
      s.receiptUrl = '';
      sendBot(socket, s, '⚠️ Файл не получен, продолжаем без фото.');
      await saveAndStartItems(socket, s);
      return;
    }

    sendBot(socket, s, '⏳ Загружаю фото...');

    try {
      // Convert base64 to buffer
      const base64Data = data.data.includes(',') ? data.data.split(',')[1] : data.data;
      const buffer = Buffer.from(base64Data, 'base64');

      // Upload to Yandex Disk
      const yandexDisk = require('../services/yandexDisk');
      const fs = require('fs');
      const os = require('os');
      const pathModule = require('path');

      const ext = data.name ? pathModule.extname(data.name) : '.jpg';
      const tmpFile = pathModule.join(os.tmpdir(), `receipt_${s.transactionId}${ext}`);
      fs.writeFileSync(tmpFile, buffer);

      const receiptUrl = await yandexDisk.uploadReceipt(tmpFile, s.transactionId, data.name || `receipt${ext}`);

      try { fs.unlinkSync(tmpFile); } catch(e) {}

      if (receiptUrl) {
        s.receiptUrl = receiptUrl;
        sendBot(socket, s, `✅ Фото загружено!\n🔗 ${receiptUrl}`);
      } else {
        s.receiptUrl = '';
        sendBot(socket, s, '⚠️ Не удалось загрузить фото. Продолжаем без него.');
      }
    } catch (err) {
      console.error('File upload error:', err.message);
      s.receiptUrl = '';
      sendBot(socket, s, '⚠️ Ошибка загрузки. Продолжаем без фото.');
    }

    await saveAndStartItems(socket, s);
  });

  socket.on('disconnect', () => {
    setTimeout(() => sessions.delete(socket.id), 30 * 60 * 1000);
  });
});

// ========== TEXT HANDLER ==========
async function handleText(socket, s, text) {
  const r = await getRef();

  // Edit steps first
  switch (s.step) {
    case 'edit_cash': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.cash = v;
      s.step = 'edit_cashless';
      sendBot(socket, s, `✅ Наличные: ${v} ₽\nВведите безналичные (текущее: ${s.cashless || 0}):`);
      sessions.set(socket.id, s); return;
    }
    case 'edit_cashless': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.cashless = v;
      s.step = 'edit_credit';
      sendBot(socket, s, `✅ Безналичные: ${v} ₽\nВведите кредит/рассрочка (текущее: ${s.credit || 0}):`);
      sessions.set(socket.id, s); return;
    }
    case 'edit_credit': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.credit = v;
      s.step = 'edit_encashment';
      sendBot(socket, s, `✅ Кредит: ${v} ₽\nВведите инкассацию (текущее: ${s.encashment || 0}):`);
      sessions.set(socket.id, s); return;
    }
    case 'edit_encashment': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.encashment = v;
      sendBot(socket, s, `✅ Инкассация: ${v} ₽ — суммы обновлены!`);
      await showPreview(socket, s); sessions.set(socket.id, s); return;
    }
    case 'edit_item_qty': {
      const q = parseNum(text);
      if (q === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s._editNewQty = q;
      s.step = 'edit_item_price';
      sendBot(socket, s, `✅ Кол-во: ${q}\nВведите новую цену:`);
      sessions.set(socket.id, s); return;
    }
    case 'edit_item_price': {
      const p = parseNum(text);
      if (p === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      const item = s.items[s._editIdx];
      item.quantity = s._editNewQty;
      item.unitPrice = p;
      item.lineTotal = cart.calculateLineTotal(item.quantity, p);
      sendBot(socket, s, `✅ Обновлено: ${item.productName} × ${item.quantity} = ${item.lineTotal} ₽`);
      await showPreview(socket, s); sessions.set(socket.id, s); return;
    }
  }

  // Main steps
  switch (s.step) {
    case 'terminal_number':
      s.terminalNumber = text;
      s.step = 'manager';
      const managers = [...new Set(r.managers || [])];
      sendBot(socket, s, `✅ Номер: ${text}\n\n👤 Шаг 2/10 — Выберите менеджера:`, {
        buttons: managers.map(m => ({ text: m, value: m })), stepNum: 2
      });
      break;

    case 'cash': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.cash = v;
      s.step = 'cashless';
      sendBot(socket, s, `✅ Наличные: ${v} ₽\n\n💳 Шаг 7/10 — Безналичные (за день):`, { stepNum: 7 });
      break;
    }

    case 'cashless': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.cashless = v;
      s.step = 'credit';
      sendBot(socket, s, `✅ Безналичные: ${v} ₽\n\n🏦 Шаг 8/10 — Кредит/Рассрочка:`, { stepNum: 8 });
      break;
    }

    case 'credit': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.credit = v;
      s.step = 'encashment';
      sendBot(socket, s, `✅ Кредит: ${v} ₽\n\n🚚 Шаг 9/10 — Инкассация:`, { stepNum: 9 });
      break;
    }

    case 'encashment': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.encashment = v;
      s.step = 'receipt_confirm';
      sendBot(socket, s, `✅ Инкассация: ${v} ₽\n\n📸 Шаг 10/10 — Загрузить фото чека?`, {
        buttons: [
          { text: '✅ Да, загрузить', value: 'Да_чек' },
          { text: '❌ Нет, продолжить', value: 'Нет_чек' }
        ], stepNum: 10
      });
      break;
    }

    case 'quantity': {
      const q = parseNum(text);
      if (q === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.currentItem.quantity = q;
      s.step = 'unit_price';
      sendBot(socket, s, `✅ Кол-во: ${q}\n\n💲 Цена за единицу:`);
      break;
    }

    case 'unit_price': {
      const p = parseNum(text);
      if (p === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.currentItem.unitPrice = p;
      s.currentItem.lineTotal = cart.calculateLineTotal(s.currentItem.quantity, p);
      s.step = 'item_comment';
      sendBot(socket, s, `✅ Цена: ${p} ₽ | Сумма: ${s.currentItem.lineTotal} ₽\n\n💬 Комментарий (или "-"):`);
      break;
    }

    case 'item_comment':
      s.currentItem.comment = text === '-' ? '' : text;
      s.items.push(s.currentItem);
      s.currentItem = null;
      s.step = 'more_confirm';
      sendBot(socket, s, '✅ Товар добавлен!\n\n📦 Ещё товар?', {
        buttons: [
          { text: '✅ Да, ещё', value: 'Да' },
          { text: '❌ Нет, проверить', value: 'Нет' }
        ]
      });
      break;

    default:
      sendBot(socket, s, '⚠️ Используйте кнопки.');
  }

  sessions.set(socket.id, s);
}

// ========== BUTTON HANDLER ==========
async function handleButton(socket, s, value) {
  const r = await getRef();

  switch (s.step) {
    case 'manager':
      s.manager = value;
      s.step = 'channel';
      sendBot(socket, s, `✅ Менеджер: ${value}\n\n📊 Шаг 3/10 — Канал продаж:`, {
        buttons: (r.channels || []).map(c => ({ text: c, value: c })), stepNum: 3
      });
      break;

    case 'channel':
      s.channel = value;
      s.step = 'city';
      sendBot(socket, s, `✅ Канал: ${value}\n\n🏙️ Шаг 4/10 — Город:`, {
        buttons: (r.cities || []).map(c => ({ text: c, value: c })), stepNum: 4
      });
      break;

    case 'city':
      s.city = value;
      s.step = 'terminal';
      sendBot(socket, s, `✅ Город: ${value}\n\n📍 Шаг 5/10 — Точка:`, {
        buttons: (r.terminals || []).map(t => ({ text: t, value: t })), stepNum: 5, paginated: true
      });
      break;

    case 'terminal':
      s.terminal = value;
      s.step = 'cash';
      sendBot(socket, s, `✅ Точка: ${value}\n\n💰 Шаг 6/10 — Наличные (за день):`, { stepNum: 6 });
      break;

    case 'receipt_confirm':
      if (value === 'Да_чек') {
        s.step = 'waiting_receipt';
        sendBot(socket, s, '📸 Отправьте фото чека:', {
          buttons: [{ text: '⏭️ Пропустить', value: 'skip' }], fileUpload: true
        });
      } else {
        s.receiptUrl = '';
        await saveAndStartItems(socket, s);
      }
      break;

    case 'waiting_receipt':
      if (value === 'skip') {
        s.receiptUrl = '';
        await saveAndStartItems(socket, s);
      }
      break;

    case 'product':
      s.currentItem = { productName: value };
      s.step = 'quantity';
      sendBot(socket, s, `✅ Товар: ${value}\n\n📦 Количество:`);
      break;

    case 'more_confirm':
      if (value === 'Да') {
        await startProductFlow(socket, s);
      } else {
        await showPreview(socket, s);
      }
      break;

    case 'preview':
      if (value === 'confirm') {
        await finalSubmit(socket, s);
      } else if (value === 'edit') {
        s.step = 'edit_choose';
        sendBot(socket, s, '✏️ Что изменить?', {
          buttons: [
            { text: '💰 Суммы оплат', value: 'edit_payments' },
            { text: '📦 Товары', value: 'edit_items' },
            { text: '➕ Добавить товар', value: 'edit_add' },
            { text: '👤 Менеджер', value: 'edit_mgr' },
            { text: '❌ Отмена', value: 'edit_cancel' }
          ]
        });
      }
      break;

    case 'edit_choose':
      if (value === 'edit_payments') {
        s.step = 'edit_cash';
        sendBot(socket, s, `💰 Наличные: ${s.cash || 0} | Безнал: ${s.cashless || 0} | Кредит: ${s.credit || 0} | Инкасс: ${s.encashment || 0}\n\nВведите новые наличные:`);
      } else if (value === 'edit_items') {
        if (s.items.length === 0) {
          sendBot(socket, s, '📦 Нет товаров. Добавить?', { buttons: [{ text: '➕ Добавить', value: 'edit_add' }] });
        } else {
          s.step = 'edit_item_choose';
          const btns = s.items.map((item, i) => ({ text: `✏️ ${item.productName} × ${item.quantity}`, value: `ei_${i}` }));
          btns.push({ text: '🗑 Удалить все', value: 'del_all' });
          btns.push({ text: '↩️ Назад', value: 'back' });
          sendBot(socket, s, '📦 Выберите товар:', { buttons: btns });
        }
      } else if (value === 'edit_add') {
        await startProductFlow(socket, s);
      } else if (value === 'edit_mgr') {
        s.step = 'edit_manager';
        sendBot(socket, s, '👤 Менеджер:', { buttons: [...new Set(r.managers || [])].map(m => ({ text: m, value: m })) });
      } else if (value === 'edit_cancel') {
        s.step = 'terminal_number';
        s.items = [];
        sendBot(socket, s, '❌ Отменено. Введите номер терминала для новой записи.');
      }
      break;

    case 'edit_manager':
      s.manager = value;
      sendBot(socket, s, `✅ Менеджер: ${value}`);
      await showPreview(socket, s);
      break;

    case 'edit_item_choose':
      if (value === 'del_all') {
        s.items = [];
        sendBot(socket, s, '🗑 Удалены.');
        await showPreview(socket, s);
      } else if (value === 'back') {
        await showPreview(socket, s);
      } else if (value.startsWith('ei_')) {
        const idx = parseInt(value.split('_')[1]);
        const item = s.items[idx];
        if (item) {
          s._editIdx = idx;
          s.step = 'edit_item_qty';
          sendBot(socket, s, `✏️ ${item.productName}\nКол-во: ${item.quantity} | Цена: ${item.unitPrice} ₽\n\nНовое количество:`);
        }
      }
      break;
  }

  sessions.set(socket.id, s);
}

// ========== HELPERS ==========
async function saveAndStartItems(socket, s) {
  const ok = await sheets.appendSale(sales.buildSaleRecord(s, 'web-user'));
  if (ok) {
    sendBot(socket, s, sales.formatSaleSavedMessage(s));
    await startProductFlow(socket, s);
  } else {
    sendBot(socket, s, '❌ Ошибка записи. Обновите страницу.');
  }
}

async function startProductFlow(socket, s) {
  s.step = 'product';
  const r = await getRef();
  const products = r.products || [];
  sendBot(socket, s, '📦 Выберите товар:', {
    buttons: products.map(p => ({ text: p, value: p })),
    paginated: products.length > 15
  });
}

async function showPreview(socket, s) {
  s.step = 'preview';
  sendBot(socket, s, report.formatPreviewReport(s), {
    buttons: [
      { text: '✅ Подтвердить', value: 'confirm' },
      { text: '✏️ Редактировать', value: 'edit' }
    ]
  });
}

async function finalSubmit(socket, s) {
  if (s.items.length > 0) {
    await sheets.appendItems(s.transactionId, s.items, {
      manager: s.manager || '', timestamp: s.timestamp || '',
      city: s.city || '', terminal: s.terminal || '',
      channel: s.channel || '', terminalNumber: s.terminalNumber || ''
    });
  }
  if (s.receiptUrl) {
    await sheets.updateReceiptUrl(s.transactionId, s.receiptUrl);
  }
  sendBot(socket, s, report.formatFinalReport(s) + '\n\n🔄 Для новой записи — любой текст.');

  const ns = sales.createInitialSession('web-user', 'web');
  ns._socketId = socket.id;
  sessions.set(socket.id, ns);
}

// ========== START ==========
async function start() {
  await ref.load();
  await sheets.init();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Webchat: http://localhost:${PORT}`);
  });
}

start().catch(err => { console.error('Start failed:', err); process.exit(1); });