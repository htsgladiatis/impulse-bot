const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const sheets = require('./services/googleSheets');
const yandexDisk = require('./services/yandexDisk');
const ref = require('./services/refDictionary');
const cart = require('./controllers/cart');
const report = require('./controllers/report');
const sales = require('./controllers/sales');

// Длинные названия товаров — будут в 1 колонку
const LONG_PRODUCTS = [
  'Электроды хлопковые', 'Электроды силиконовые',
  'Зонд вагинальный', 'Зонд ректальный', 'Клипсы электроды',
  'Насадки Dent', 'Гель контактный', 'Hot & Cold'
];

function gridButtons(list, cols, sessionId) {
  const rows = [];
  for (let i = 0; i < list.length; i += cols) {
    rows.push(list.slice(i, i + cols).map((item, j) => {
      const idx = i + j;
      return { text: item, callback_data: `btn|${idx}` };
    }));
  }
  return { inline_keyboard: rows };
}

function productButtons(list, cols, sessionId) {
  const rows = [];
  for (let idx = 0; idx < list.length; idx++) {
    const item = list[idx];
    if (LONG_PRODUCTS.includes(item)) {
      rows.push([{ text: item, callback_data: `btn|${idx}` }]);
    } else {
      if (rows.length === 0 || rows[rows.length - 1].length >= cols) {
        rows.push([]);
      }
      rows[rows.length - 1].push({ text: item, callback_data: `btn|${idx}` });
    }
  }
  return { inline_keyboard: rows };
}

function paginatedButtons(list, page, pageSize) {
  const totalPages = Math.ceil(list.length / pageSize);
  const start = page * pageSize;
  const end = Math.min(start + pageSize, list.length);

  const rows = [];
  for (let i = start; i < end; i++) {
    rows.push([{ text: list[i], callback_data: `btn|${i}` }]);
  }

  const navRow = [];
  if (page > 0) navRow.push({ text: '◀️ Назад', callback_data: 'pg|back' });
  navRow.push({ text: `📄 ${page + 1} / ${totalPages}`, callback_data: 'pg|info' });
  if (page < totalPages - 1) navRow.push({ text: 'Вперёд ▶️', callback_data: 'pg|forward' });
  rows.push(navRow);

  return { inline_keyboard: rows };
}

class ImpulseBot {
  constructor() {
    this.bot = new TelegramBot(config.telegram.token, { polling: true });
    this.sessions = new Map();
    this.adminSessions = new Set(); // userId в режиме админа
  }

  async init() {
    await ref.load();
    await sheets.init();
    this.setupSafetyHandlers();
    this.setupHandlers();
    console.log('🤖 Impulse Bot запущен!');
  }

  setupSafetyHandlers() {
    this.bot.on('polling_error', (error) => {
      console.error('⚠️ polling_error:', error.code || '', error.message || error);
    });

    this.bot.on('webhook_error', (error) => {
      console.error('⚠️ webhook_error:', error.code || '', error.message || error);
    });
  }

  safeHandler(name, handler) {
    return async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`❌ Ошибка обработчика ${name}:`, error && error.stack ? error.stack : error);
      }
    };
  }

  setupHandlers() {
    this.bot.onText(/\/start/, this.safeHandler('/start', (msg) => this.handleStart(msg)));
    this.bot.onText(/\/admin/, this.safeHandler('/admin', (msg) => this.handleAdmin(msg)));
    this.bot.onText(/\/exit/, this.safeHandler('/exit', (msg) => this.handleExit(msg)));
    this.bot.on('callback_query', this.safeHandler('callback_query', (query) => this.handleCallback(query)));
    this.bot.on('photo', this.safeHandler('photo', (msg) => this.handlePhoto(msg)));
    this.bot.on('message', this.safeHandler('message', async (msg) => {
      if (msg.text && !msg.text.startsWith('/')) await this.handleTextMessage(msg);
    }));
  }

  // Отправить сообщение и удалить предыдущее (затирание)
  async sendAndReplace(chatId, userId, session, text, options = {}) {
    if (session.lastMsgId) {
      try {
        await this.bot.deleteMessage(chatId, session.lastMsgId);
      } catch (e) {}
    }
    const sent = await this.bot.sendMessage(chatId, text, options);
    session.lastMsgId = sent.message_id;
    return sent;
  }

  // ========== /admin ==========
  async handleAdmin(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log(`📥 /admin от ${userId}`);
    this.adminSessions.add(userId);
    await this.showAdminMenu(chatId);
  }

  async handleExit(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    if (this.adminSessions.has(userId)) {
      this.adminSessions.delete(userId);
      this.sessions.delete(userId);
      await this.bot.sendMessage(chatId, '✅ Вы вышли из режима администратора.');
    }
  }

  async showAdminMenu(chatId) {
    await this.bot.sendMessage(chatId,
      `⚙️ ПАНЕЛЬ АДМИНИСТРАТОРА\n━━━━━━━━━━━━━━━━━━━━\nВыберите раздел для редактирования:\n\nДля выхода: /exit`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏙️ Города', callback_data: 'adm|cities' }, { text: '📍 Точки', callback_data: 'adm|terminals' }],
            [{ text: '👤 Менеджеры', callback_data: 'adm|managers' }, { text: '📊 Каналы', callback_data: 'adm|channels' }],
            [{ text: '📦 Товары', callback_data: 'adm|products' }]
          ]
        }
      }
    );
  }

  async showRefSection(chatId, key) {
    const data = await ref.getRef();
    const items = data[key] || [];
    const label = ref.LABELS[key];
    const list = items.map((item, i) => `${i + 1}. ${item}`).join('\n') || '(пусто)';

    // Кнопки для каждого элемента — нажатие открывает меню перемещения
    const pickButtons = items.map((item, idx) => {
      const short = item.length > 40 ? item.substring(0, 37) + '...' : item;
      return [{ text: `${idx + 1}. ${short}`, callback_data: `adm_pick|${key}|${idx}` }];
    });

    await this.bot.sendMessage(chatId,
      `📋 ${label}\n━━━━━━━━━━━━━━━━━━━━\n${list}\n\nНажмите на элемент для перемещения:`,
      {
        reply_markup: {
          inline_keyboard: [
            ...pickButtons,
            [{ text: '➕ Добавить', callback_data: `adm_add|${key}` }, { text: '🗑 Удалить', callback_data: `adm_del|${key}` }],
            [{ text: '↩️ Назад', callback_data: 'adm|menu' }]
          ]
        }
      }
    );
  }

  async showPickMenu(chatId, userId, key, idx) {
    const data = await ref.getRef();
    const items = data[key] || [];
    const item = items[idx] || '(?)';
    const total = items.length;

    await this.bot.sendMessage(chatId,
      `📌 "${item}"\n📍 Позиция: ${idx + 1} из ${total}\n\nВыберите действие:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏫ В начало списка', callback_data: `adm_totop|${key}|${idx}` }],
            [{ text: '⬆️ На 10 вверх', callback_data: `adm_up10|${key}|${idx}` }, { text: '⬇️ На 10 вниз', callback_data: `adm_down10|${key}|${idx}` }],
            [{ text: '📝 На конкретную позицию...', callback_data: `adm_askpos|${key}|${idx}` }],
            [{ text: '↩️ Назад к списку', callback_data: `adm|${key}` }]
          ]
        }
      }
    );
  }

  // ========== /start ==========
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    console.log(`📥 /start от ${username} (${userId})`);

    this.sessions.set(userId, sales.createInitialSession(username));

    await this.sendAndReplace(chatId, userId, this.sessions.get(userId),
      `📅 Дата: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n\n` +
      `🔢 Шаг 1/10 — Введите номер терминала:`
    );
  }

  // ========== CALLBACKS ==========
  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    console.log(`📥 Callback: ${data} от ${userId}`);
    await this.bot.answerCallbackQuery(query.id);

    // === АДМИН callbacks ===
    if (data.startsWith('adm|') || data.startsWith('adm_add|') || data.startsWith('adm_del|') || data.startsWith('adm_delitem|') || data.startsWith('adm_pick|') || data.startsWith('adm_totop|') || data.startsWith('adm_up10|') || data.startsWith('adm_down10|') || data.startsWith('adm_askpos|')) {
      if (!this.adminSessions.has(userId)) return;
      await this.handleAdminCallback(chatId, userId, data);
      return;
    }

    const session = this.sessions.get(userId);
    if (!session) return;

    if (data.startsWith('pg|')) {
      const action = data.split('|')[1];
      if (action === 'forward') {
        session._page = (session._page || 0) + 1;
      } else if (action === 'back') {
        session._page = Math.max(0, (session._page || 0) - 1);
      }
      const r = await ref.getRef();
      await this.sendAndReplace(chatId, userId, session,
        `📍 Шаг 5/10 — Выберите точку (название):`,
        { reply_markup: paginatedButtons(r.terminals, session._page || 0, 10) }
      );
      this.sessions.set(userId, session);
    } else if (data.startsWith('btn|')) {
      const value = data.split('|')[1];
      await this.handleButtonChoice(chatId, userId, session, value);
    } else if (data === 'preview_confirm') {
      await this.finalSubmit(chatId, userId, session);
    } else if (data === 'preview_edit') {
      session.step = 'edit_choose';
      await this.sendAndReplace(chatId, userId, session, '✏️ Что хотите изменить?', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Суммы оплат', callback_data: 'edit|payments' }],
            [{ text: '📦 Товары', callback_data: 'edit|items' }],
            [{ text: '➕ Добавить товар', callback_data: 'edit|add_item' }],
            [{ text: '👤 Менеджер', callback_data: 'edit|manager' }],
            [{ text: '❌ Отмена — в начало', callback_data: 'edit|cancel' }]
          ]
        }
      });
    } else if (data.startsWith('edit|')) {
      const editTarget = data.split('|')[1];
      if (editTarget === 'add_item') {
        await this.startProductFlow(chatId, userId, session);
      } else {
        await this.handleEdit(chatId, userId, session, editTarget);
      }
    } else if (data.startsWith('edit_item|')) {
      await this.handleEditItem(chatId, userId, session, data);
    }
  }

  async handleAdminCallback(chatId, userId, data) {
    if (data === 'adm|menu') {
      await this.showAdminMenu(chatId);
      return;
    }

    if (data.startsWith('adm|')) {
      const key = data.split('|')[1];
      await this.showRefSection(chatId, key);
      return;
    }

    if (data.startsWith('adm_add|')) {
      const key = data.split('|')[1];
      const session = this.sessions.get(userId) || {};
      session.step = 'admin_add';
      session.adminTarget = key;
      this.sessions.set(userId, session);
      const label = ref.LABELS[key];
      await this.bot.sendMessage(chatId, `➕ Введите новое значение для «${label}»:`);
      return;
    }

    if (data.startsWith('adm_del|')) {
      const key = data.split('|')[1];
      const data2 = await ref.getRef();
      const items = data2[key] || [];
      if (items.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Список пуст. Удалять нечего.');
        return;
      }
      const label = ref.LABELS[key];
      const buttons = items.map((item, idx) => [{
        text: `🗑 ${item}`,
        callback_data: `adm_delitem|${key}|${idx}`
      }]);
      buttons.push([{ text: '↩️ Назад', callback_data: `adm|${key}` }]);
      await this.bot.sendMessage(chatId, `🗑 Выберите что удалить из «${label}»:`, {
        reply_markup: { inline_keyboard: buttons }
      });
      return;
    }

    if (data.startsWith('adm_delitem|')) {
      const parts = data.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      const data2 = await ref.getRef();
      const removed = data2[key][idx];
      ref.arrayRemove(data2[key], removed);
      await ref.save(data2);
      const label = ref.LABELS[key];
      await this.bot.sendMessage(chatId, `✅ Удалено из «${label}»: ${removed}`);
      await this.showRefSection(chatId, key);
      return;
    }

    if (data.startsWith('adm_pick|')) {
      const parts = data.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      await this.showPickMenu(chatId, userId, key, idx);
      return;
    }

    if (data.startsWith('adm_totop|')) {
      const parts = data.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      const data2 = await ref.getRef();
      ref.arrayMoveToIndex(data2[key], idx, 0);
      await ref.save(data2);
      await this.bot.sendMessage(chatId, `✅ Перемещено на позицию 1`);
      await this.showRefSection(chatId, key);
      return;
    }

    if (data.startsWith('adm_up10|')) {
      const parts = data.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      const newIdx = Math.max(0, idx - 10);
      const data2 = await ref.getRef();
      ref.arrayMoveToIndex(data2[key], idx, newIdx);
      await ref.save(data2);
      await this.bot.sendMessage(chatId, `✅ Перемещено на позицию ${newIdx + 1}`);
      await this.showRefSection(chatId, key);
      return;
    }

    if (data.startsWith('adm_down10|')) {
      const parts = data.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      const data2 = await ref.getRef();
      const newIdx = Math.min(data2[key].length - 1, idx + 10);
      ref.arrayMoveToIndex(data2[key], idx, newIdx);
      await ref.save(data2);
      await this.bot.sendMessage(chatId, `✅ Перемещено на позицию ${newIdx + 1}`);
      await this.showRefSection(chatId, key);
      return;
    }

    if (data.startsWith('adm_askpos|')) {
      const parts = data.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      const session = this.sessions.get(userId) || {};
      session.step = 'admin_move_to';
      session.adminMoveKey = key;
      session.adminMoveIdx = idx;
      this.sessions.set(userId, session);
      const data2 = await ref.getRef();
      const total = data2[key].length;
      await this.bot.sendMessage(chatId, `📝 Введите номер позиции (1–${total}), куда переместить:`);
      return;
    }
  }

  async handlePhoto(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const session = this.sessions.get(userId);
    if (!session || session.step !== 'waiting_receipt') {
      await this.bot.sendMessage(chatId, '⚠️ Сейчас не нужно фото. Используйте /start');
      return;
    }

    sales.ensureTransactionId(session);

    await this.sendAndReplace(chatId, userId, session, '⏳ Загружаю фото на Яндекс.Диск...');

    try {
      const photo = msg.photo[msg.photo.length - 1];
      const file = await this.bot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;
      const fileName = file.file_path.split('/').pop();

      const receiptUrl = await yandexDisk.uploadReceipt(fileUrl, session.transactionId, fileName);

      if (receiptUrl) {
        session.receiptUrl = receiptUrl;
        await this.sendAndReplace(chatId, userId, session, `✅ Фото загружено!\n🔗 ${receiptUrl}`);
        await this.saveSaleAndStartItems(chatId, userId, session);
      } else {
        session.receiptUrl = '';
        await this.sendAndReplace(chatId, userId, session, '⚠️ Не удалось загрузить фото. Попробуйте ещё раз или пропустите.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📸 Попробовать снова', callback_data: 'btn|retry_photo' }],
              [{ text: '⏭️ Продолжить без фото', callback_data: 'btn|skip_photo' }]
            ]
          }
        });
      }
    } catch (error) {
      console.error('Ошибка обработки фото:', error.message);
      session.receiptUrl = '';
      await this.sendAndReplace(chatId, userId, session, '⚠️ Ошибка загрузки фото. Попробуйте ещё раз или пропустите.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📸 Попробовать снова', callback_data: 'btn|retry_photo' }],
            [{ text: '⏭️ Продолжить без фото', callback_data: 'btn|skip_photo' }]
          ]
        }
      });
    }
  }

  async handleButtonChoice(chatId, userId, session, value) {
    const r = await ref.getRef();
    // value может быть индексом (число) для кнопок из справочников, или строкой для action-кнопок
    const idx = parseInt(value);
    const isIndex = !isNaN(idx);

    switch (session.step) {
      case 'manager': {
        const manager = isIndex ? r.managers[idx] : value;
        session.manager = manager;
        session.step = 'channel';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Менеджер: ${manager}\n\n📊 Шаг 3/10 — Выберите канал продаж:`,
          { reply_markup: gridButtons(r.channels, 2) }
        );
        break;
      }

      case 'channel': {
        const channel = isIndex ? r.channels[idx] : value;
        session.channel = channel;
        session.step = 'city';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Канал: ${channel}\n\n🏙️ Шаг 4/10 — Выберите город:`,
          { reply_markup: gridButtons(r.cities, 3) }
        );
        break;
      }

      case 'city': {
        const city = isIndex ? r.cities[idx] : value;
        session.city = city;
        session.step = 'terminal';
        session._page = 0;
        await this.sendAndReplace(chatId, userId, session,
          `✅ Город: ${city}\n\n📍 Шаг 5/10 — Выберите точку (название):`,
          { reply_markup: paginatedButtons(r.terminals, 0, 10) }
        );
        break;
      }

      case 'terminal': {
        const terminal = isIndex ? r.terminals[idx] : value;
        session.terminal = terminal;
        session.step = 'cash';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Точка: ${terminal}\n\n💰 Шаг 6/10 — Введите сумму наличные (за день):`
        );
        break;
      }

      case 'receipt_confirm':
        if (value === 'Да_чек') {
          session.step = 'waiting_receipt';
          await this.sendAndReplace(chatId, userId, session, '📸 Отправьте фото чека:');
        } else {
          session.receiptUrl = '';
          await this.saveSaleAndStartItems(chatId, userId, session);
        }
        break;

      case 'waiting_receipt':
        if (value === 'retry_photo') {
          session.step = 'waiting_receipt';
          await this.sendAndReplace(chatId, userId, session, '📸 Отправьте фото чека:');
        } else if (value === 'skip_photo') {
          session.receiptUrl = '';
          await this.saveSaleAndStartItems(chatId, userId, session);
        }
        break;

      case 'more_confirm':
        if (value === 'Да') {
          await this.startProductFlow(chatId, userId, session);
        } else {
          await this.showPreview(chatId, userId, session);
        }
        break;

      case 'edit_manager': {
        const newManager = isIndex ? r.managers[idx] : value;
        session.manager = newManager;
        await this.sendAndReplace(chatId, userId, session, `✅ Менеджер изменён на: ${newManager}`);
        await this.showPreview(chatId, userId, session);
        break;
      }

      case 'product': {
        const product = isIndex ? r.products[idx] : value;
        session.currentItem = { productName: product };
        session.step = 'quantity';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Товар: ${product}\n\n📦 Количество:`
        );
        break;
      }
    }

    this.sessions.set(userId, session);
  }

  async handleTextMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.from.is_bot) return;

    const session = this.sessions.get(userId);
    if (!session) {
      await this.bot.sendMessage(chatId, '⚠️ Отправьте /start для начала.');
      return;
    }

    const text = msg.text.trim();

    // === АДМИН: перемещение на конкретную позицию ===
    if (session.step === 'admin_move_to') {
      const pos = parseInt(text);
      const key = session.adminMoveKey;
      const fromIdx = session.adminMoveIdx;
      const data = await ref.getRef();
      const total = data[key].length;
      if (isNaN(pos) || pos < 1 || pos > total) {
        await this.bot.sendMessage(chatId, `⚠️ Введите число от 1 до ${total}:`);
        return;
      }
      ref.arrayMoveToIndex(data[key], fromIdx, pos - 1);
      await ref.save(data);
      await this.bot.sendMessage(chatId, `✅ Перемещено на позицию ${pos}`);
      session.step = null;
      session.adminMoveKey = null;
      session.adminMoveIdx = null;
      await this.showRefSection(chatId, key);
      return;
    }

    // === АДМИН: ввод нового значения ===
    if (session.step === 'admin_add') {
      const key = session.adminTarget;
      const data = await ref.getRef();
      const added = ref.arrayAdd(data[key], text);
      if (added) {
        await ref.save(data);
        const label = ref.LABELS[key];
        await this.bot.sendMessage(chatId, `✅ Добавлено в «${label}»: ${text}`);
      } else {
        await this.bot.sendMessage(chatId, `⚠️ «${text}» уже есть в списке.`);
      }
      session.step = null;
      session.adminTarget = null;
      await this.showRefSection(chatId, key);
      return;
    }

    const r = await ref.getRef();

    switch (session.step) {
      case 'terminal_number':
        session.terminalNumber = text;
        session.step = 'manager';
        const uniqueManagers = [...new Set(r.managers)];
        await this.sendAndReplace(chatId, userId, session,
          `✅ Номер: ${text}\n\n👤 Шаг 2/10 — Выберите менеджера:`,
          { reply_markup: gridButtons(uniqueManagers, 3) }
        );
        break;

      case 'cash':
        const cash = this.parseNum(text);
        if (cash === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.cash = cash;
        session.step = 'cashless';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Наличные: ${cash} ₽\n\n💳 Шаг 7/10 — Введите сумму безналичные (за день):`
        );
        break;

      case 'cashless':
        const cashless = this.parseNum(text);
        if (cashless === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.cashless = cashless;
        session.step = 'credit';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Безналичные: ${cashless} ₽\n\n🏦 Шаг 8/10 — Введите сумму Кредит/Рассрочка (за день):`
        );
        break;

      case 'credit':
        const credit = this.parseNum(text);
        if (credit === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.credit = credit;
        session.step = 'encashment';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Кредит/Рассрочка: ${credit} ₽\n\n🚚 Шаг 9/10 — Введите сумму инкассации (за день):`
        );
        break;

      case 'encashment':
        const encashment = this.parseNum(text);
        if (encashment === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.encashment = encashment;
        session.step = 'receipt_confirm';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Инкассация: ${encashment} ₽\n\n📸 Шаг 10/10 — Загрузить фото чека?`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Да, загрузить фото', callback_data: 'btn|Да_чек' }],
                [{ text: '❌ Нет, продолжить', callback_data: 'btn|Нет_чек' }]
              ]
            }
          }
        );
        break;

      case 'quantity':
        const qty = this.parseNum(text);
        if (qty === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.currentItem.quantity = qty;
        session.step = 'unit_price';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Количество: ${qty}\n\n💲 Цена за единицу:`
        );
        break;

      case 'unit_price':
        const price = this.parseNum(text);
        if (price === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.currentItem.unitPrice = price;
        session.currentItem.lineTotal = cart.calculateLineTotal(session.currentItem.quantity, price);
        session.step = 'item_comment';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Цена: ${price} ₽ | Сумма: ${session.currentItem.lineTotal} ₽\n\n💬 Комментарий к товару (или "-" чтобы пропустить):`
        );
        break;

      case 'item_comment':
        session.currentItem.comment = text === '-' ? '' : text;
        session.items.push(session.currentItem);
        session.currentItem = null;
        session.step = 'more_confirm';
        await this.sendAndReplace(chatId, userId, session,
          `✅ Товар добавлен!\n\n📦 Добавить ещё товар?`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Да, ещё товар', callback_data: 'btn|Да' }],
                [{ text: '❌ Нет. Проверить отчет', callback_data: 'btn|Нет' }]
              ]
            }
          }
        );
        break;

      case 'edit_cash':
        const newCash = this.parseNum(text);
        if (newCash === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.cash = newCash;
        session.step = 'edit_cashless';
        await this.sendAndReplace(chatId, userId, session, `✅ Наличные: ${newCash} ₽\nВведите новые безналичные (текущее: ${session.cashless || 0}):`);
        break;

      case 'edit_cashless':
        const newCashless = this.parseNum(text);
        if (newCashless === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.cashless = newCashless;
        session.step = 'edit_credit';
        await this.sendAndReplace(chatId, userId, session, `✅ Безналичные: ${newCashless} ₽\nВведите новый кредит/рассрочка (текущее: ${session.credit || 0}):`);
        break;

      case 'edit_credit':
        const newCredit = this.parseNum(text);
        if (newCredit === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.credit = newCredit;
        session.step = 'edit_encashment';
        await this.sendAndReplace(chatId, userId, session, `✅ Кредит/Рассрочка: ${newCredit} ₽\nВведите новую инкассацию (текущее: ${session.encashment || 0}):`);
        break;

      case 'edit_encashment':
        const newEncashment = this.parseNum(text);
        if (newEncashment === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.encashment = newEncashment;
        await this.sendAndReplace(chatId, userId, session, `✅ Инкассация: ${newEncashment} ₽\n\nСуммы обновлены!`);
        await this.showPreview(chatId, userId, session);
        break;

      case 'edit_item_qty':
        const newQty = this.parseNum(text);
        if (newQty === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session._editItemNewQty = newQty;
        session.step = 'edit_item_price';
        const editItem = session.items[session._editItemIdx];
        await this.sendAndReplace(chatId, userId, session, `✅ Количество: ${newQty}\nВведите новую цену за единицу (текущее: ${editItem.unitPrice}):`);
        break;

      case 'edit_item_price':
        const newPrice = this.parseNum(text);
        if (newPrice === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        const editedItem = cart.updateItemPrice(session.items[session._editItemIdx], session._editItemNewQty, newPrice);
        session.items[session._editItemIdx] = editedItem;
        await this.sendAndReplace(chatId, userId, session, `✅ Обновлено: ${editedItem.productName} × ${editedItem.quantity} = ${editedItem.lineTotal} ₽`);
        await this.showPreview(chatId, userId, session);
        break;
    }

    this.sessions.set(userId, session);
  }

  parseNum(text) {
    const n = parseFloat(text.replace(',', '.').replace(/\s/g, ''));
    return isNaN(n) ? null : n;
  }

  async handleEdit(chatId, userId, session, target) {
    const r = await ref.getRef();
    switch (target) {
      case 'payments':
        session.step = 'edit_cash';
        session._editMode = true;
        await this.sendAndReplace(chatId, userId, session,
          `💰 Текущие суммы:\n  Наличные: ${session.cash || 0}\n  Безналичные: ${session.cashless || 0}\n  Кредит: ${session.credit || 0}\n  Инкассация: ${session.encashment || 0}\n\nВведите новую сумму наличные:`
        );
        break;
      case 'items':
        if (session.items.length === 0) {
          await this.sendAndReplace(chatId, userId, session, '📦 Товаров пока нет. Хотите добавить?', {
            reply_markup: {
              inline_keyboard: [
                [{ text: '➕ Добавить товар', callback_data: 'edit|add_item' }],
                [{ text: '↩️ Назад к предпросмотру', callback_data: 'preview_edit' }]
              ]
            }
          });
          return;
        }
        const itemButtons = cart.buildEditItemButtons(session.items);
        itemButtons.push([{ text: '🗑 Удалить все товары', callback_data: 'edit_item|delete_all' }]);
        itemButtons.push([{ text: '↩️ Назад', callback_data: 'preview_edit' }]);
        session.step = 'edit_item_choose';
        await this.sendAndReplace(chatId, userId, session, '📦 Выберите товар для редактирования:', {
          reply_markup: { inline_keyboard: itemButtons }
        });
        break;
      case 'manager':
        session.step = 'edit_manager';
        const uniqueManagers = [...new Set(r.managers)];
        await this.sendAndReplace(chatId, userId, session, '👤 Выберите нового менеджера:', {
          reply_markup: gridButtons(uniqueManagers, 3)
        });
        break;
      case 'cancel':
        this.sessions.delete(userId);
        await this.bot.sendMessage(chatId, '❌ Запись отменена. /start для новой записи.');
        break;
    }
    this.sessions.set(userId, session);
  }

  async handleEditItem(chatId, userId, session, data) {
    const idx = data.split('|')[1];
    if (idx === 'delete_all') {
      session.items = [];
      await this.sendAndReplace(chatId, userId, session, '🗑 Все товары удалены.');
      await this.showPreview(chatId, userId, session);
      return;
    }
    const item = session.items[parseInt(idx)];
    if (!item) return;

    session._editItemIdx = parseInt(idx);
    session.step = 'edit_item_qty';
    await this.sendAndReplace(chatId, userId, session,
      `✏️ ${item.productName}\nКоличество: ${item.quantity}\nЦена: ${item.unitPrice} ₽\n\nВведите новое количество (текущее: ${item.quantity}):`
    );
    this.sessions.set(userId, session);
  }

  async saveSaleAndStartItems(chatId, userId, session) {
    const success = await sheets.appendSale(sales.buildSaleRecord(session, userId));

    if (success) {
      await this.sendAndReplace(chatId, userId, session, sales.formatSaleSavedMessage(session));
      await this.startProductFlow(chatId, userId, session);
    } else {
      await this.bot.sendMessage(chatId, '❌ Ошибка записи. /start');
      this.sessions.delete(userId);
    }
  }

  async startProductFlow(chatId, userId, session) {
    session.step = 'product';
    this.sessions.set(userId, session);

    const r = await ref.getRef();
    await this.sendAndReplace(chatId, userId, session, '📦 Выберите товар:', {
      reply_markup: productButtons(r.products, 3)
    });
  }

  async showPreview(chatId, userId, session) {
    session.step = 'preview';

    if (session.lastMsgId) {
      try { await this.bot.deleteMessage(chatId, session.lastMsgId); } catch (e) {}
      session.lastMsgId = null;
    }

    await this.bot.sendMessage(chatId,
      report.formatPreviewReport(session),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Подтвердить и отправить', callback_data: 'preview_confirm' }],
            [{ text: '✏️ Редактировать', callback_data: 'preview_edit' }]
          ]
        }
      }
    );

    this.sessions.set(userId, session);
  }

  async finalSubmit(chatId, userId, session) {
    if (session.items.length > 0) {
      await sheets.appendItems(session.transactionId, session.items, {
        manager: session.manager || session.username || '',
        timestamp: session.timestamp || '',
        city: session.city || '',
        terminal: session.terminal || '',
        channel: session.channel || '',
        terminalNumber: session.terminalNumber || ''
      });
    }

    if (session.receiptUrl) {
      await sheets.updateReceiptUrl(session.transactionId, session.receiptUrl);
    }

    await this.bot.sendMessage(chatId,
      report.formatFinalReport(session)
    );

    this.sessions.delete(userId);
  }

  async finishRecord(chatId, userId, session) {
    await this.showPreview(chatId, userId, session);
  }
}

module.exports = ImpulseBot;