'use strict';

const express = require('express');
const path = require('path');
const config = require('../config');
const ref = require('../services/refDictionary');
const sheets = require('../services/googleSheets');
const auth = require('../services/auth');
const cart = require('../controllers/cart');
const report = require('../controllers/report');
const SessionManager = require('../core/SessionManager');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Health check ---
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// --- API: Справочники ---
app.get('/api/ref', async (_req, res) => {
  try {
    const r = await ref.getRef();
    // Transform to legacy format for backward compatibility with miniapp client
    const data = {
      ...r,
      cities: ref.getCitiesList(),
      terminals: ref.getTerminalsList(),
      terminalCityMap: ref.getTerminalCityMap()
    };
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- API: Сессии (in-memory) ---
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      step: 'terminal_number',
      items: [],
      timestamp: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
      transactionId: null,
    });
  }
  return sessions.get(userId);
}

function genTxId(session) {
  if (!session.transactionId) {
    session.transactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return session.transactionId;
}

// --- API: Сбросить сессию (начать заново) ---
app.post('/api/reset', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  sessions.delete(userId);
  res.json({ ok: true });
});

// --- API: Получить текущее состояние ---
app.post('/api/state', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const s = getSession(userId);
  res.json({ ok: true, step: s.step, session: sanitizeSession(s) });
});

function sanitizeSession(s) {
  return {
    step: s.step,
    terminalNumber: s.terminalNumber,
    manager: s.manager,
    channel: s.channel,
    city: s.city,
    terminal: s.terminal,
    cash: s.cash,
    cashless: s.cashless,
    credit: s.credit,
    encashment: s.encashment,
    receiptUrl: s.receiptUrl,
    businessTripAllowance: s.businessTripAllowance,
    items: s.items || [],
    timestamp: s.timestamp,
    transactionId: s.transactionId,
  };
}

// --- API: Заполнить поле ---
app.post('/api/step', async (req, res) => {
  const { userId, step, value } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });

  const s = getSession(userId);
  const r = await ref.getRef();

    try {
    switch (step) {
      case 'terminal_number':
        s.terminalNumber = value;
        s.step = 'manager';
        break;
      case 'manager':
        s.manager = value;
        s.step = 'channel';
        break;
      case 'channel':
        s.channel = value;
        s.step = 'city';
        break;
      case 'city':
        if (value === '__back_channel') {
          s.step = 'channel';
          break;
        }
        s.city = value;
        s.step = 'terminal';
        break;
      case 'terminal':
        if (value === '__back_city') {
          s.step = 'city';
          break;
        }
        s.terminal = value;
        s.step = 'cash';
        break;
      case 'cash':
        s.cash = parseNum(value);
        if (s.cash === null) return res.status(400).json({ ok: false, error: 'Введите число' });
        s.step = 'cashless';
        break;
      case 'cashless':
        s.cashless = parseNum(value);
        if (s.cashless === null) return res.status(400).json({ ok: false, error: 'Введите число' });
        s.step = 'credit';
        break;
      case 'credit':
        s.credit = parseNum(value);
        if (s.credit === null) return res.status(400).json({ ok: false, error: 'Введите число' });
        s.step = 'encashment';
        break;
      case 'encashment':
        s.encashment = parseNum(value);
        if (s.encashment === null) return res.status(400).json({ ok: false, error: 'Введите число' });
        s.step = 'receipt_confirm';
        break;
      case 'receipt_confirm':
        // value: 'photo' or 'skip'
        if (value === 'photo') {
          s.step = 'waiting_receipt';
        } else {
          s.receiptUrl = '';
          s.step = 'business_trip';
        }
        break;
      case 'business_trip':
        const bt = parseNum(value);
        if (bt === null) return res.status(400).json({ ok: false, error: 'Введите число' });
        s.businessTripAllowance = bt;
        s.step = 'sale_saved';
        await _saveSale(s, userId);
        break;
      case 'waiting_receipt':
        // receipt URL will be uploaded separately
        break;
      default:
        return res.status(400).json({ ok: false, error: `Unknown step: ${step}` });
    }
    res.json({ ok: true, step: s.step, session: sanitizeSession(s) });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- API: Добавить товар ---
app.post('/api/add-item', async (req, res) => {
  const { userId, productName, quantity, unitPrice, comment } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });

  const s = getSession(userId);
  const qty = parseNum(quantity);
  const price = parseNum(unitPrice);
  if (qty === null || price === null) return res.status(400).json({ ok: false, error: 'Количество и цена — числа' });

  const lineTotal = cart.calculateLineTotal(qty, price);
  s.items.push({ productName, quantity: qty, unitPrice: price, lineTotal, comment: comment || '' });
  res.json({ ok: true, items: s.items });
});

// --- API: Удалить товар ---
app.post('/api/remove-item', (req, res) => {
  const { userId, index } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const s = getSession(userId);
  if (index >= 0 && index < s.items.length) {
    s.items.splice(index, 1);
  }
  res.json({ ok: true, items: s.items });
});

// --- API: Предпросмотр ---
app.post('/api/preview', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const s = getSession(userId);
  const totalRevenue = report.calculateTotalRevenue(s);
  const itemsTotal = s.items.reduce((sum, it) => sum + (it.lineTotal || 0), 0);
  res.json({
    ok: true,
    preview: {
      terminalNumber: s.terminalNumber,
      manager: s.manager,
      channel: s.channel,
      city: s.city,
      terminal: s.terminal,
      cash: s.cash || 0,
      cashless: s.cashless || 0,
      credit: s.credit || 0,
      encashment: s.encashment || 0,
      totalRevenue,
      items: s.items,
      itemsTotal,
      receiptUrl: s.receiptUrl || '',
      timestamp: s.timestamp,
    },
  });
});

// --- API: Финальная отправка ---
app.post('/api/final', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const s = getSession(userId);
  try {
    genTxId(s);
    if (s.items.length > 0) await sheets.appendItems(s.transactionId, s.items);
    if (s.receiptUrl) await sheets.updateReceiptUrl(s.transactionId, s.receiptUrl);
    const totalRevenue = report.calculateTotalRevenue(s);
    sessions.delete(userId);
    res.json({ ok: true, message: 'Продажа записана!', totalRevenue });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

async function _saveSale(s, userId) {
  genTxId(s);
  const record = {
    transactionId: s.transactionId,
    timestamp: s.timestamp,
    telegramId: userId,
    username: s.username || '',
    terminalNumber: s.terminalNumber,
    manager: s.manager,
    channel: s.channel,
    city: s.city,
    terminal: s.terminal,
    cash: s.cash || 0,
    cashless: s.cashless || 0,
    credit: s.credit || 0,
    encashment: s.encashment || 0,
    businessTripAllowance: s.businessTripAllowance || 0,
    totalRevenue: report.calculateTotalRevenue(s),
    receiptUrl: s.receiptUrl || '',
  };
  await sheets.appendSale(record);
}

function parseNum(text) {
  const n = parseFloat(String(text).replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? null : n;
}

// --- Start ---
const PORT = process.env.MINIAPP_PORT || 3001;

async function start() {
  await ref.load();
  await sheets.init();
  app.listen(PORT, () => {
    console.log(`📱 Mini App server running on port ${PORT}`);
    console.log(`   Static: http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
  });
}

start().catch(e => {
  console.error('❌ Mini App start error:', e.message);
  process.exit(1);
});