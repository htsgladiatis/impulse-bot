'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Reuse existing services
const ref = require('../services/refDictionary');
const sheets = require('../services/googleSheets');
const cart = require('../controllers/cart');
const report = require('../controllers/report');
const { DateFormatter, DateValidator, TimestampGenerator, MONTHS_RU, DAYS_RU, CALENDAR_LABELS } = require('../utils/dateUtils');

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
    calendar: opts.calendar || false,
    fileUpload: opts.fileUpload || false,
    backButton: opts.backButton || null
  });
}

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.id}`);

  const session = createInitialSession('web-user', 'web');
  session._socketId = socket.id;
  sessions.set(socket.id, session);

  // Show date selection prompt
  const today = DateFormatter.toDisplay(session.reportDate);
  socket.emit('bot_message', {
    text: `📅 ${CALENDAR_LABELS.chooseDate}:`,
    step: 'date_select',
    stepNum: null,
    buttons: [
      { text: `📅 ${CALENDAR_LABELS.today} (${today})`, value: 'date|today' },
      { text: `📆 ${CALENDAR_LABELS.selectOther}`, value: 'date|custom' }
    ]
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
      sendBot(socket, s, '⚠️ Файл не получен, продолжаем без фото.\n\n✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):');
      s.step = 'business_trip';
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

      // Use uploadReceiptBuffer with the buffer directly (uploadReceipt expects a Telegram URL)
      const receiptUrl = await yandexDisk.uploadReceiptBuffer(buffer, s.transactionId, data.name || `receipt${ext}`);

      if (receiptUrl) {
        s.receiptUrl = receiptUrl;
        sendBot(socket, s, `✅ Фото загружено!\n🔗 ${receiptUrl}\n\n✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):`);
      } else {
        s.receiptUrl = '';
        sendBot(socket, s, '⚠️ Не удалось загрузить фото. Продолжаем без него.\n\n✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):');
      }
    } catch (err) {
      console.error('File upload error:', err.message);
      s.receiptUrl = '';
      sendBot(socket, s, '⚠️ Ошибка загрузки. Продолжаем без фото.\n\n✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):');
    }

    s.step = 'business_trip';
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
      sendBot(socket, s, `✅ Номер: ${text}\n\n👤 Шаг 2/11 — Выберите менеджера:`, {
        buttons: managers.map(m => ({ text: m, value: m })), stepNum: 2
      });
      break;

    case 'cash': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.cash = v;
      s.step = 'cashless';
      sendBot(socket, s, `✅ Наличные: ${v} ₽\n\n💳 Шаг 7/11 — Безналичные (за день):`, { stepNum: 7 });
      break;
    }

    case 'cashless': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.cashless = v;
      s.step = 'credit';
      sendBot(socket, s, `✅ Безналичные: ${v} ₽\n\n🏦 Шаг 8/11 — Кредит/Рассрочка:`, { stepNum: 8 });
      break;
    }

    case 'credit': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.credit = v;
      s.step = 'encashment';
      sendBot(socket, s, `✅ Кредит: ${v} ₽\n\n🚚 Шаг 9/11 — Инкассация:`, { stepNum: 9 });
      break;
    }

    case 'encashment': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.encashment = v;
      s.step = 'receipt_confirm';
      sendBot(socket, s, `✅ Инкассация: ${v} ₽\n\n📸 Шаг 10/11 — Загрузить фото чека?`, {
        buttons: [
          { text: '✅ Да, загрузить', value: 'Да_чек' },
          { text: '❌ Нет, продолжить', value: 'Нет_чек' }
        ], stepNum: 10
      });
      break;
    }

    case 'business_trip': {
      const v = parseNum(text);
      if (v === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.businessTripAllowance = v;
      await saveAndStartItems(socket, s);
      break;
    }

    case 'quantity': {
      const q = parseNum(text);
      if (q === null) { sendBot(socket, s, '⚠️ Введите число:'); return; }
      s.currentItem.quantity = q;
      s.step = 'unit_price';
      sendBot(socket, s, `✅ Кол-во: ${q}\n\n� Цена за единицу:`);
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

  // DATE SELECTION
  if (value === 'date|today') {
    s.reportDate = new Date().toISOString().split('T')[0];
    s.timestamp = TimestampGenerator.generate(s.reportDate);
    s.step = 'terminal_number';
    sendBot(socket, s, 
      `📅 Дата отчёта: ${DateFormatter.toDisplay(s.reportDate)}\n\n🔢 Шаг 1/11 — Введите номер терминала:`,
      { stepNum: 1 }
    );
    sessions.set(socket.id, s);
    return;
  }
  
  if (value === 'date|custom') {
    s.step = 'calendar';
    sendCalendar(socket, s);
    sessions.set(socket.id, s);
    return;
  }
  
  // CALENDAR NAVIGATION
  if (value.startsWith('cal|')) {
    await handleCalendarCallback(socket, s, value);
    sessions.set(socket.id, s);
    return;
  }

  switch (s.step) {
    case 'manager':
      s.manager = value;
      s.step = 'channel';
      sendBot(socket, s, `✅ Менеджер: ${value}\n\n📊 Шаг 3/11 — Канал продаж:`, {
        buttons: (r.channels || []).map(c => ({ text: c, value: c })), stepNum: 3
      });
      break;

    case 'channel':
      s.channel = value;
      s.step = 'city';
      sendBot(socket, s, `✅ Канал: ${value}\n\n🏙️ Шаг 4/11 — Город:`, {
        buttons: ref.getCitiesList().map(c => ({ text: c, value: c })),
        stepNum: 4,
        backButton: { text: '↩️ Назад к каналу', value: '__back_channel' }
      });
      break;

    case 'city':
      s.city = value;
      s.step = 'terminal';
      sendBot(socket, s, `✅ Город: ${value}\n\n📍 Шаг 5/11 — Точка:`, {
        buttons: ref.getTerminalsByCity(s.city).map(t => ({ text: t, value: t })),
        stepNum: 5,
        paginated: true,
        backButton: { text: '↩️ Назад к городу', value: '__back_city' }
      });
      break;

    case 'terminal':
      if (value === '__back_city') {
        s.step = 'city';
        const r = await getRef();
        sendBot(socket, s, `🏙️ Шаг 4/11 — Город:`, {
          buttons: ref.getCitiesList().map(c => ({ text: c, value: c })), stepNum: 4
        });
        break;
      }

      s.terminal = value;
      s.step = 'cash';
      sendBot(socket, s, `✅ Точка: ${value}\n\n💰 Шаг 6/11 — Наличные (за день):`, { stepNum: 6 });
      break;

    case 'receipt_confirm':
      if (value === 'Да_чек') {
        s.step = 'waiting_receipt';
        sendBot(socket, s, '📸 Отправьте фото чека:', {
          buttons: [{ text: '⏭️ Пропустить', value: 'skip' }], fileUpload: true
        });
      } else {
        s.receiptUrl = '';
        s.step = 'business_trip';
        sendBot(socket, s, `✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):`);
      }
      break;

    case 'waiting_receipt':
      if (value === 'skip') {
        s.receiptUrl = '';
        s.step = 'business_trip';
        sendBot(socket, s, `✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):`);
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
function createInitialSession(platform) {
  const today = new Date().toISOString().split('T')[0];
  return { 
    step: 'date_select',  // Changed from 'terminal_number' to 'date_select'
    reportDate: today,  // ISO format YYYY-MM-DD
    platform, 
    timestamp: TimestampGenerator.generate(today),
    items: [], 
    lastMsgId: null,
    _calendarYear: new Date().getFullYear(),
    _calendarMonth: new Date().getMonth()
  };
}

function ensureTransactionId(session) {
  if (!session.transactionId) session.transactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return session.transactionId;
}

function buildSaleRecord(session, userId) {
  ensureTransactionId(session);
  
  // Ensure timestamp uses the selected report date
  if (!session.timestamp || !session.reportDate) {
    session.reportDate = new Date().toISOString().split('T')[0];
    session.timestamp = TimestampGenerator.generate(session.reportDate);
  }
  
  return {
    transactionId: session.transactionId, 
    timestamp: session.timestamp,
    reportDate: session.reportDate,  // Add ISO date
    telegramId: userId,
    username: session.username, 
    terminalNumber: session.terminalNumber, 
    manager: session.manager,
    channel: session.channel, 
    city: session.city, 
    terminal: session.terminal,
    cash: session.cash || 0, 
    cashless: session.cashless || 0, 
    credit: session.credit || 0,
    encashment: session.encashment || 0, 
    businessTripAllowance: session.businessTripAllowance || 0,
    totalRevenue: report.calculateTotalRevenue(session),
    receiptUrl: session.receiptUrl || '',
  };
}

function formatSaleSavedMessage(session) {
  const t = report.calculateTotalRevenue(session);
  return `✅ Продажа записана!\n\n📅 ${session.timestamp}\n🔢 Терминал #${session.terminalNumber} | 📍 ${session.terminal}\n👤 ${session.manager} | 📊 ${session.channel}\n🏙️ ${session.city}\n💰 Налич: ${session.cash} | 💳 Безнал: ${session.cashless}\n🏦 Кредит: ${session.credit} | 🚚 Инкассация: ${session.encashment}\n🧳 Командировка: ${session.businessTripAllowance || 0}\n📊 Итого: ${t} ₽\n\n📦 Теперь добавим товары...`;
}

async function saveAndStartItems(socket, s) {
  const ok = await sheets.appendSale(buildSaleRecord(s, 'web-user'));
  if (ok) {
    sendBot(socket, s, formatSaleSavedMessage(s));
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

/**
 * Send calendar to user
 */
function sendCalendar(socket, s) {
  const year = s._calendarYear || new Date().getFullYear();
  const month = s._calendarMonth !== undefined ? s._calendarMonth : new Date().getMonth();
  
  const calendarButtons = buildCalendarButtons(year, month, s.reportDate);
  
  sendBot(socket, s, `📆 Выберите дату:\n\n${MONTHS_RU[month]} ${year}`, {
    buttons: calendarButtons,
    calendar: true
  });
}

/**
 * Build calendar buttons for web
 */
function buildCalendarButtons(year, month, selectedDate) {
  const buttons = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const maxPastDate = new Date(today);
  maxPastDate.setDate(maxPastDate.getDate() - 90);
  
  // Navigation row
  buttons.push({ text: '◄◄', value: 'cal|prev_year' });
  buttons.push({ text: '◄', value: 'cal|prev_month' });
  buttons.push({ text: `${MONTHS_RU[month]} ${year}`, value: 'cal|noop' });
  buttons.push({ text: '►', value: 'cal|next_month' });
  buttons.push({ text: '►►', value: 'cal|next_year' });
  
  // Day headers
  DAYS_RU.forEach(day => {
    buttons.push({ text: day, value: 'cal|noop', header: true });
  });
  
  // Calculate first day
  const firstDay = new Date(year, month, 1).getDay();
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Build calendar grid
  let dayCounter = 1;
  for (let week = 0; week < 6; week++) {
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      if ((week === 0 && dayOfWeek < adjustedFirstDay) || dayCounter > daysInMonth) {
        buttons.push({ text: ' ', value: 'cal|noop', empty: true });
      } else {
        const cellDate = new Date(year, month, dayCounter);
        const isoDate = cellDate.toISOString().split('T')[0];
        const isToday = cellDate.getTime() === today.getTime();
        const isSelected = isoDate === selectedDate;
        const isFuture = cellDate > today;
        const isTooOld = cellDate < maxPastDate;
        const isDisabled = isFuture || isTooOld;
        
        let text = String(dayCounter);
        
        buttons.push({
          text: text,
          value: isDisabled ? 'cal|noop' : `cal|select|${isoDate}`,
          day: true,
          disabled: isDisabled
        });
        
        dayCounter++;
      }
    }
    
    if (dayCounter > daysInMonth) break;
  }
  
  return buttons;
}

/**
 * Handle calendar navigation
 */
async function handleCalendarCallback(socket, s, value) {
  const parts = value.split('|');
  const action = parts[1];
  const dateValue = parts[2];
  
  switch (action) {
    case 'prev_month':
      s._calendarMonth--;
      if (s._calendarMonth < 0) {
        s._calendarMonth = 11;
        s._calendarYear--;
      }
      sendCalendar(socket, s);
      break;
      
    case 'next_month':
      s._calendarMonth++;
      if (s._calendarMonth > 11) {
        s._calendarMonth = 0;
        s._calendarYear++;
      }
      sendCalendar(socket, s);
      break;
      
    case 'prev_year':
      s._calendarYear--;
      sendCalendar(socket, s);
      break;
      
    case 'next_year':
      s._calendarYear++;
      sendCalendar(socket, s);
      break;
      
    case 'select':
      const validation = DateValidator.validate(dateValue);
      if (validation.valid) {
        s.reportDate = dateValue;
        s.timestamp = TimestampGenerator.generate(dateValue);
        s.step = 'terminal_number';
        
        delete s._calendarMonth;
        delete s._calendarYear;
        
        sendBot(socket, s,
          `📅 Дата отчёта: ${DateFormatter.toDisplay(s.reportDate)}\n\n🔢 Шаг 1/11 — Введите номер терминала:`,
          { stepNum: 1 }
        );
      }
      break;
      
    case 'noop':
      // Do nothing
      break;
  }
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

  const ns = createInitialSession('web-user', 'web');
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