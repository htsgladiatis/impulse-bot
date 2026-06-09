const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const sheets = require('./services/googleSheets');
const yandexDisk = require('./services/yandexDisk');
const ref = require('./services/refDictionary');
const cart = require('./controllers/cart');
const report = require('./controllers/report');
const { DateFormatter, DateValidator, TimestampGenerator, MONTHS_RU, DAYS_RU, CALENDAR_LABELS } = require('./utils/dateUtils');

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

function paginatedButtons(list, page, pageSize, extraRow) {
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

  if (extraRow) rows.push(extraRow);

  return { inline_keyboard: rows };
}

/**
 * Build calendar keyboard for Telegram
 * @param {number} year - Year to display
 * @param {number} month - Month to display (0-11)
 * @param {string} selectedDate - Currently selected date (ISO format YYYY-MM-DD)
 * @returns {Object} Telegram inline keyboard
 */
function buildCalendarKeyboard(year, month, selectedDate) {
  const rows = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const maxPastDate = new Date(today);
  maxPastDate.setDate(maxPastDate.getDate() - 90);
  
  // Header row: navigation
  rows.push([
    { text: '◄◄', callback_data: 'cal|prev_year' },
    { text: '◄', callback_data: 'cal|prev_month' },
    { text: `${MONTHS_RU[month]} ${year}`, callback_data: 'cal|noop' },
    { text: '►', callback_data: 'cal|next_month' },
    { text: '►►', callback_data: 'cal|next_year' }
  ]);
  
  // Day headers
  rows.push(DAYS_RU.map(day => ({ 
    text: day, 
    callback_data: 'cal|noop' 
  })));
  
  // Calculate first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDay = new Date(year, month, 1).getDay();
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Build calendar grid
  let dayCounter = 1;
  for (let week = 0; week < 6; week++) {
    const weekRow = [];
    
    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      if ((week === 0 && dayOfWeek < adjustedFirstDay) || dayCounter > daysInMonth) {
        weekRow.push({ text: ' ', callback_data: 'cal|noop' });
      } else {
        const cellDate = new Date(year, month, dayCounter);
        const isoDate = cellDate.toISOString().split('T')[0];
        const isToday = cellDate.getTime() === today.getTime();
        const isSelected = isoDate === selectedDate;
        const isFuture = cellDate > today;
        const isTooOld = cellDate < maxPastDate;
        const isDisabled = isFuture || isTooOld;
        
        let text = String(dayCounter);
        if (isToday) text = `[${text}]`;  // Highlight today
        if (isSelected) text = `✓${text}`;  // Mark selected
        
        weekRow.push({
          text: text,
          callback_data: isDisabled ? 'cal|noop' : `cal|select|${isoDate}`
        });
        
        dayCounter++;
      }
    }
    
    rows.push(weekRow);
    
    if (dayCounter > daysInMonth) break;
  }
  
  return { inline_keyboard: rows };
}

/**
 * Format step message with date header
 * @param {Object} session - User session
 * @param {string} stepMessage - The step-specific message
 * @returns {string} Message with date header
 */
function formatMessageWithDate(session, stepMessage) {
  if (!session.reportDate) {
    return stepMessage;
  }
  const displayDate = DateFormatter.toDisplay(session.reportDate);
  return `📅 Дата отчёта: ${displayDate}\n\n${stepMessage}`;
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

  _formatItemLabel(key, item) {
    var TL = (ref && ref.TYPE_LABELS) || { exhibition: 'Выставка', sanatorium: 'Санаторий' };
    if (key === 'cities') {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return String(item);
      var tl = TL[item.type] || item.type || '';
      return item.name + ' (' + tl + ')';
    }
    if (key === 'terminals') {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return String(item);
      var tl2 = TL[item.type] || item.type || '';
      var cl = item.city || '';
      return item.name + ' \u2014 ' + cl + ' (' + tl2 + ')';
    }
    return item;
  }

  async showRefSection(chatId, key) {
    const data = await ref.getRef();
    const items = data[key] || [];
    const label = ref.LABELS[key];
    const list = items.map((item, i) => `${i + 1}. ${this._formatItemLabel(key, item)}`).join('\n') || '(пусто)';

    // Кнопки для каждого элемента — нажатие открывает меню перемещения
    const pickButtons = items.map((item, idx) => {
      const labelText = this._formatItemLabel(key, item);
      const short = labelText.length > 40 ? labelText.substring(0, 37) + '...' : labelText;
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
    const itemObj = items[idx] || {};
    const total = items.length;
    const rows = [];
    if (key === 'terminals' && itemObj && typeof itemObj === 'object') {
      var cityText = itemObj.city ? ('\ud83c\udfe2 \u0413\u043e\u0440\u043e\u0434: ' + itemObj.city) : '\ud83c\udfe2 \u041f\u0440\u0438\u0432\u044f\u0437\u0430\u0442\u044c \u043a \u0433\u043e\u0440\u043e\u0434\u0443';
      rows.push([{ text: cityText, callback_data: 'adm_chcity|' + key + '|' + idx }]);
      var tl = itemObj.type === 'sanatorium' ? '\u0421\u0430\u043d\u0430\u0442\u043e\u0440\u0438\u0439' : '\u0412\u044b\u0441\u0442\u0430\u0432\u043a\u0430';
      rows.push([{ text: '\ud83c\udfab \u0422\u0438\u043f: ' + tl, callback_data: 'adm_chtype|' + key + '|' + idx }]);
    }
    if (key === 'cities' && itemObj && typeof itemObj === 'object') {
      var tl2 = itemObj.type === 'sanatorium' ? '\u0421\u0430\u043d\u0430\u0442\u043e\u0440\u0438\u0439' : '\u0412\u044b\u0441\u0442\u0430\u0432\u043a\u0430';
      rows.push([{ text: '\ud83c\udfab \u0422\u0438\u043f: ' + tl2, callback_data: 'adm_chtype|' + key + '|' + idx }]);
    }
    rows.push([{ text: '\u2b06 \u0412 \u043d\u0430\u0447\u0430\u043b\u043e \u0441\u043f\u0438\u0441\u043a\u0430', callback_data: 'adm_totop|' + key + '|' + idx }]);
    rows.push([{ text: '\u2b06 \u041d\u0430 10 \u0432\u0432\u0435\u0440\u0445', callback_data: 'adm_up10|' + key + '|' + idx }, { text: '\u2b07 \u041d\u0430 10 \u0432\u043d\u0438\u0437', callback_data: 'adm_down10|' + key + '|' + idx }]);
    rows.push([{ text: '\ud83d\udcdd \u041d\u0430 \u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u0443\u044e \u043f\u043e\u0437\u0438\u0446\u0438\u044e...', callback_data: 'adm_askpos|' + key + '|' + idx }]);
    rows.push([{ text: '\u21a9\ufe0f \u041d\u0430\u0437\u0430\u0434 \u043a \u0441\u043f\u0438\u0441\u043a\u0443', callback_data: 'adm|' + key }]);
    await this.bot.sendMessage(chatId, '\ud83d\udccc "' + this._formatItemLabel(key, itemObj) + '"\n\ud83d\udccd \u041f\u043e\u0437\u0438\u0446\u0438\u044f: ' + (idx + 1) + ' \u0438\u0437 ' + total + '\n\n\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435:', { reply_markup: { inline_keyboard: rows } });
  }

  // ========== /start ==========
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || msg.from.first_name;

    console.log(`📥 /start от ${username} (${userId})`);

    this.sessions.set(userId, this.createInitialSession(username));
    const session = this.sessions.get(userId);

    // Show date selection prompt instead of terminal number
    await this.showDatePrompt(chatId, userId, session);
  }

  /**
   * Display date selection prompt
   * Shows "Today" and "Select Other Date" options
   */
  async showDatePrompt(chatId, userId, session) {
    const today = DateFormatter.toDisplay(session.reportDate);
    const keyboard = {
      inline_keyboard: [
        [{ text: `📅 ${CALENDAR_LABELS.today} (${today})`, callback_data: 'date|today' }],
        [{ text: `📆 ${CALENDAR_LABELS.selectOther}`, callback_data: 'date|custom' }]
      ]
    };
    
    await this.sendAndReplace(chatId, userId, session,
      `📅 ${CALENDAR_LABELS.chooseDate}:`,
      { reply_markup: keyboard }
    );
    
    this.sessions.set(userId, session);
  }

  /**
   * Handle date-related callbacks
   * Routes between "Today" and "Custom Date" flows
   */
  async handleDateCallback(chatId, userId, session, data) {
    if (data === 'date|today') {
      // User selected "Today" - use current date
      session.reportDate = new Date().toISOString().split('T')[0];
      session.step = 'terminal_number';
      this.sessions.set(userId, session);
      
      // Show terminal number prompt
      await this.sendAndReplace(chatId, userId, session,
        `📅 Дата отчёта: ${DateFormatter.toDisplay(session.reportDate)}\n\n` +
        `🔢 Шаг 1/10 — Введите номер терминала:`
      );
    } else if (data === 'date|custom') {
      // User selected "Select Other Date" - show calendar
      const now = new Date();
      session._calendarYear = now.getFullYear();
      session._calendarMonth = now.getMonth();
      this.sessions.set(userId, session);
      
      await this.showCalendar(chatId, userId, session);
    }
  }

  /**
   * Display calendar picker
   * Shows interactive month/year grid for date selection
   */
  async showCalendar(chatId, userId, session) {
    const year = session._calendarYear || new Date().getFullYear();
    const month = session._calendarMonth !== undefined ? session._calendarMonth : new Date().getMonth();
    
    const keyboard = buildCalendarKeyboard(year, month, session.reportDate);
    
    await this.sendAndReplace(chatId, userId, session,
      `📆 Выберите дату:\n\n${MONTHS_RU[month]} ${year}`,
      { reply_markup: keyboard }
    );
    
    this.sessions.set(userId, session);
  }

  /**
   * Handle calendar navigation
   * Process month/year navigation and date selection
   */
  async handleCalendarNavigation(chatId, userId, session, query, data) {
    const [_, action, value] = data.split('|');
    
    switch (action) {
      case 'prev_month':
        session._calendarMonth--;
        if (session._calendarMonth < 0) {
          session._calendarMonth = 11;
          session._calendarYear--;
        }
        await this.showCalendar(chatId, userId, session);
        break;
        
      case 'next_month':
        session._calendarMonth++;
        if (session._calendarMonth > 11) {
          session._calendarMonth = 0;
          session._calendarYear++;
        }
        await this.showCalendar(chatId, userId, session);
        break;
        
      case 'prev_year':
        session._calendarYear--;
        await this.showCalendar(chatId, userId, session);
        break;
        
      case 'next_year':
        session._calendarYear++;
        await this.showCalendar(chatId, userId, session);
        break;
        
      case 'select':
        // User selected a date
        const validation = DateValidator.validate(value);
        if (validation.valid) {
          session.reportDate = value;
          session.step = 'terminal_number';
          
          // Clear calendar state
          delete session._calendarMonth;
          delete session._calendarYear;
          
          this.sessions.set(userId, session);
          
          // Show terminal number prompt
          await this.sendAndReplace(chatId, userId, session,
            `📅 Дата отчёта: ${DateFormatter.toDisplay(session.reportDate)}\n\n` +
            `🔢 Шаг 1/10 — Введите номер терминала:`
          );
        } else {
          // Show error alert
          await this.bot.answerCallbackQuery(query.id, {
            text: validation.error,
            show_alert: true
          });
        }
        break;
        
      case 'noop':
        // Do nothing (disabled dates, headers, etc.)
        break;
    }
  }

  // ========== CALLBACKS ==========
  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    console.log(`📥 Callback: ${data} от ${userId}`);
    await this.bot.answerCallbackQuery(query.id);

    // === DATE callbacks ===
    if (data.startsWith('date|')) {
      const session = this.sessions.get(userId);
      if (!session) return;
      await this.handleDateCallback(chatId, userId, session, data);
      return;
    }

    // === CALENDAR callbacks ===
    if (data.startsWith('cal|')) {
      const session = this.sessions.get(userId);
      if (!session) return;
      await this.handleCalendarNavigation(chatId, userId, session, query, data);
      return;
    }

    // === АДМИН callbacks ===
    if (data.startsWith('adm|') || data.startsWith('adm_add|') || data.startsWith('adm_del|') || data.startsWith('adm_delitem|') || data.startsWith('adm_pick|') || data.startsWith('adm_totop|') || data.startsWith('adm_up10|') || data.startsWith('adm_down10|') || data.startsWith('adm_askpos|') || data.startsWith('adm_type|') || data.startsWith('adm_city|') || data.startsWith('adm_chcity|') || data.startsWith('adm_chtype|') || data.startsWith('adm_setcity|') || data.startsWith('adm_settype|')) {
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
      await this.sendAndReplace(chatId, userId, session,
        `📍 Шаг 5/10 — Выберите точку (название):`,
        { reply_markup: paginatedButtons(ref.getTerminalsByCity(session.city), session._page || 0, 10, [{ text: '↩️ Назад к городу', callback_data: 'back|city' }]) }
      );
      this.sessions.set(userId, session);
    } else if (data.startsWith('back|')) {
      const target = data.split('|')[1];
      if (target === 'city') {
        session.step = 'city';
        session._page = 0;
        const cityKeyboard = gridButtons(ref.getCitiesList(), 3);
        cityKeyboard.inline_keyboard.push([{ text: '↩️ Назад к каналу', callback_data: 'back|channel' }]);
        await this.sendAndReplace(chatId, userId, session,
          `🏙️ Шаг 4/10 — Выберите город:`,
          { reply_markup: cityKeyboard }
        );
      } else if (target === 'channel') {
        session.step = 'channel';
        const r = await ref.getRef();
        await this.sendAndReplace(chatId, userId, session,
          `📊 Шаг 3/10 — Выберите канал продаж:`,
          { reply_markup: gridButtons(r.channels, 2) }
        );
      }
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

    if (data.startsWith('adm_add|')) {
      const key = data.split('|')[1];
      const session = this.sessions.get(userId) || {};
      if (key === 'cities') {
        session.step = 'admin_add_city_name';
        this.sessions.set(userId, session);
        await this.bot.sendMessage(chatId, `➕ Введите название нового города:`);
        return;
      }
      if (key === 'terminals') {
        session.step = 'admin_add_terminal_name';
        this.sessions.set(userId, session);
        await this.bot.sendMessage(chatId, `➕ Введите название новой точки:`);
        return;
      }
      session.step = 'admin_add';
      session.adminTarget = key;
      this.sessions.set(userId, session);
      const label = ref.LABELS[key];
      await this.bot.sendMessage(chatId, `➕ Введите новое значение для «${label}»:`);
      return;
    }

    // ----- City type selection -----
    if (data.startsWith('adm_type|city|')) {
      const type = data.split('|')[2];
      const session = this.sessions.get(userId) || {};
      const name = session.adminCityName;
      if (!name) {
        await this.bot.sendMessage(chatId, '❌ Ошибка: название города не найдено. Начните заново.');
        session.step = null;
        session.adminCityName = null;
        this.sessions.set(userId, session);
        await this.showRefSection(chatId, 'cities');
        return;
      }
      const added = ref.addCity(name, type);
      if (added) {
        await ref.save(await ref.getRef());
        await this.bot.sendMessage(chatId, `✅ Добавлен город: ${name} (${ref.TYPE_LABELS[type]})`);
      } else {
        await this.bot.sendMessage(chatId, `⚠️ Город «${name}» уже есть в списке.`);
      }
      session.step = null;
      session.adminCityName = null;
      this.sessions.set(userId, session);
      await this.showRefSection(chatId, 'cities');
      return;
    }

    // ----- Terminal city selection -----
    if (data.startsWith('adm_city|terminal|')) {
      const city = data.split('|')[2];
      const session = this.sessions.get(userId) || {};
      session.adminTerminalCity = city;
      session.step = 'admin_add_terminal_type';
      this.sessions.set(userId, session);
      await this.bot.sendMessage(chatId,
        `➕ Точка: «${session.adminTerminalName}»\nГород: ${city}\n\nВыберите тип:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏛 Выставка', callback_data: 'adm_type|terminal|exhibition' }, { text: '🏥 Санаторий', callback_data: 'adm_type|terminal|sanatorium' }],
              [{ text: '↩️ Отмена', callback_data: 'adm|terminals' }]
            ]
          }
        }
      );
      return;
    }

    // ----- Terminal type selection -----
    if (data.startsWith('adm_type|terminal|')) {
      const type = data.split('|')[2];
      const session = this.sessions.get(userId) || {};
      const name = session.adminTerminalName;
      const city = session.adminTerminalCity;
      if (!name || !city) {
        await this.bot.sendMessage(chatId, '❌ Ошибка: данные точки не найдены. Начните заново.');
        session.step = null;
        session.adminTerminalName = null;
        session.adminTerminalCity = null;
        this.sessions.set(userId, session);
        await this.showRefSection(chatId, 'terminals');
        return;
      }
      const added = ref.addTerminal(name, city, type);
      if (added) {
        await ref.save(await ref.getRef());
        await this.bot.sendMessage(chatId, `✅ Добавлена точка: ${name} — ${city} (${ref.TYPE_LABELS[type]})`);
      } else {
        await this.bot.sendMessage(chatId, `⚠️ Точка «${name}» уже есть в списке.`);
      }
      session.step = null;
      session.adminTerminalName = null;
      session.adminTerminalCity = null;
      this.sessions.set(userId, session);
      await this.showRefSection(chatId, 'terminals');
      return;
    }

    // adm| — показ раздела (после всех остальных adm_*)
    if (data.startsWith('adm|')) {
      const key = data.split('|')[1];
      await this.showRefSection(chatId, key);
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
      const buttons = items.map((item, idx) => {
        const labelText = this._formatItemLabel(key, item);
        return [{ text: `🗑 ${labelText}`, callback_data: `adm_delitem|${key}|${idx}` }];
      });
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
      const items = data2[key] || [];
      if (idx < 0 || idx >= items.length) {
        await this.bot.sendMessage(chatId, '❌ Элемент не найден.');
        await this.showRefSection(chatId, key);
        return;
      }

      if (key === 'cities') {
        const cityName = items[idx].name;
        ref.removeCity(cityName);
        await ref.save(await ref.getRef());
        await this.bot.sendMessage(chatId, `✅ Удалён город: ${cityName}`);
      } else if (key === 'terminals') {
        const terminalName = items[idx].name;
        ref.removeTerminal(terminalName);
        await ref.save(await ref.getRef());
        await this.bot.sendMessage(chatId, `✅ Удалена точка: ${terminalName}`);
      } else {
        const removed = items[idx];
        ref.arrayRemove(data2[key], removed);
        await ref.save(data2);
        const label = ref.LABELS[key];
        await this.bot.sendMessage(chatId, `✅ Удалено из «${label}»: ${removed}`);
      }
      await this.showRefSection(chatId, key);
      return;
    }

    if (data.startsWith('adm_chcity|')) {
      var parts2 = data.split('|');
      var key2 = parts2[1];
      var idx2 = parseInt(parts2[2]);
      var d2 = await ref.getRef();
      var its2 = d2[key2] || [];
      var cur2 = its2[idx2];
      if (!cur2 || typeof cur2 !== 'object') { await this.bot.sendMessage(chatId, '\u274c Error'); return; }
      var cities2 = d2.cities || [];
      var btns2 = cities2.map(function(c) {
        var cn = typeof c === 'string' ? c : c.name;
        var ct = typeof c === 'object' && c.type ? c.type : null;
        var tl = ct ? (' (' + ((ref.TYPE_LABELS || {})[ct] || ct) + ')') : '';
        return [{ text: cn + tl, callback_data: 'adm_setcity|' + key2 + '|' + idx2 + '|' + cn }];
      });
      btns2.push([{ text: '\u21a9\ufe0f \u041e\u0442\u043c\u0435\u043d\u0430', callback_data: 'adm_pick|' + key2 + '|' + idx2 }]);
      await this.bot.sendMessage(chatId, '\ud83c\udfe2 \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0433\u043e\u0440\u043e\u0434 \u0434\u043b\u044f \u0442\u043e\u0447\u043a\u0438 \u00ab' + cur2.name + '\u00bb:', { reply_markup: { inline_keyboard: btns2 } });
      return;
    }
    if (data.startsWith('adm_setcity|')) {
      var p3 = data.split('|');
      var k3 = p3[1]; var i3 = parseInt(p3[2]); var cn3 = p3[3];
      var d3 = await ref.getRef();
      var its3 = d3[k3] || [];
      if (its3[i3] && typeof its3[i3] === 'object') {
        its3[i3].city = cn3;
        if (!its3[i3].type) its3[i3].type = 'exhibition';
        await ref.save(d3);
        await this.bot.sendMessage(chatId, '\u2705 \u0422\u043e\u0447\u043a\u0430 \u00ab' + its3[i3].name + '\u00bb \u2014 \u0433\u043e\u0440\u043e\u0434: ' + cn3);
      } else { await this.bot.sendMessage(chatId, '\u274c Error'); }
      await this.showRefSection(chatId, k3);
      return;
    }
    if (data.startsWith('adm_chtype|')) {
      var p4 = data.split('|');
      var k4 = p4[1]; var i4 = parseInt(p4[2]);
      var d4 = await ref.getRef();
      var its4 = d4[k4] || [];
      var cur4 = its4[i4];
      if (!cur4 || typeof cur4 !== 'object') { await this.bot.sendMessage(chatId, '\u274c Error'); return; }
      var other4 = cur4.type === 'sanatorium' ? 'exhibition' : 'sanatorium';
      var oLabel = (ref.TYPE_LABELS || {})[other4] || other4;
      var cLabel = (ref.TYPE_LABELS || {})[cur4.type] || cur4.type;
      await this.bot.sendMessage(chatId, '\ud83c\udfab \u0422\u0438\u043f \u00ab' + cur4.name + '\u00bb: ' + cLabel + '\n\n\u041f\u043e\u043c\u0435\u043d\u044f\u0442\u044c \u043d\u0430:', {
        reply_markup: { inline_keyboard: [[{ text: '\ud83c\udfab ' + oLabel, callback_data: 'adm_settype|' + k4 + '|' + i4 + '|' + other4 }], [{ text: '\u21a9\ufe0f \u041e\u0442\u043c\u0435\u043d\u0430', callback_data: 'adm_pick|' + k4 + '|' + i4 }]] }
      });
      return;
    }
    if (data.startsWith('adm_settype|')) {
      var p5 = data.split('|');
      var k5 = p5[1]; var i5 = parseInt(p5[2]); var nt5 = p5[3];
      var d5 = await ref.getRef();
      var its5 = d5[k5] || [];
      if (its5[i5] && typeof its5[i5] === 'object') {
        its5[i5].type = nt5;
        await ref.save(d5);
        var tl5 = (ref.TYPE_LABELS || {})[nt5] || nt5;
        await this.bot.sendMessage(chatId, '\u2705 \u0422\u0438\u043f \u00ab' + its5[i5].name + '\u00bb \u0438\u0437\u043c\u0435\u043d\u0451\u043d \u043d\u0430: ' + tl5);
      } else { await this.bot.sendMessage(chatId, '\u274c Error'); }
      await this.showRefSection(chatId, k5);
      return;
    }
    if (data.startsWith('adm_pick|')) {
      var parts = data.split('|');
      var key = parts[1];
      var idx = parseInt(parts[2]);
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

    this.ensureTransactionId(session);

    await this.sendAndReplace(chatId, userId, session, '⏳ Загружаю фото на Яндекс.Диск...');

    try {
      const photo = msg.photo[msg.photo.length - 1];
      const file = await this.bot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.token}/${file.file_path}`;
      const fileName = file.file_path.split('/').pop();

      const receiptUrl = await yandexDisk.uploadReceipt(fileUrl, session.transactionId, fileName);

      if (receiptUrl) {
        session.receiptUrl = receiptUrl;
        await this.sendAndReplace(chatId, userId, session, `✅ Фото загружено!\n🔗 ${receiptUrl}\n\n✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):`);
        session.step = 'business_trip';
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
        const cityKeyboard = gridButtons(ref.getCitiesList(), 3);
        cityKeyboard.inline_keyboard.push([{ text: '↩️ Назад к каналу', callback_data: 'back|channel' }]);
        await this.sendAndReplace(chatId, userId, session,
          `✅ Канал: ${channel}\n\n🏙️ Шаг 4/10 — Выберите город:`,
          { reply_markup: cityKeyboard }
        );
        break;
      }

      case 'city': {
        const city = isIndex ? ref.getCitiesList()[idx] : value;
        session.city = city;
        session.step = 'terminal';
        session._page = 0;
        await this.sendAndReplace(chatId, userId, session,
          `✅ Город: ${city}\n\n📍 Шаг 5/10 — Выберите точку (название):`,
          { reply_markup: paginatedButtons(ref.getTerminalsByCity(session.city), 0, 10, [{ text: '↩️ Назад к городу', callback_data: 'back|city' }]) }
        );
        break;
      }

      case 'terminal': {
        const terminals = ref.getTerminalsByCity(session.city);
        const terminal = isIndex ? terminals[idx] : value;
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
          session.step = 'business_trip';
          await this.sendAndReplace(chatId, userId, session, `✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):`);
        }
        break;

      case 'waiting_receipt':
        if (value === 'retry_photo') {
          session.step = 'waiting_receipt';
          await this.sendAndReplace(chatId, userId, session, '📸 Отправьте фото чека:');
        } else if (value === 'skip_photo') {
          session.receiptUrl = '';
          session.step = 'business_trip';
          await this.sendAndReplace(chatId, userId, session, `✈️ Шаг 11/11 — Командировочная надбавка (0 если нет):`);
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

    // === АДМИН: ввод названия города ===
    if (session.step === 'admin_add_city_name') {
      session.adminCityName = text;
      session.step = 'admin_add_city_type';
      await this.bot.sendMessage(chatId,
        `➕ Город: «${text}»\n\nВыберите тип:`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🏛 Выставка', callback_data: 'adm_type|city|exhibition' }, { text: '🏥 Санаторий', callback_data: 'adm_type|city|sanatorium' }],
              [{ text: '↩️ Отмена', callback_data: 'adm|cities' }]
            ]
          }
        }
      );
      return;
    }

    // === АДМИН: ввод названия точки ===
    if (session.step === 'admin_add_terminal_name') {
      session.adminTerminalName = text;
      session.step = 'admin_add_terminal_city';
      const data = await ref.getRef();
      const cities = data.cities || [];
      if (cities.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Сначала добавьте хотя бы один город.');
        session.step = null;
        session.adminTerminalName = null;
        await this.showRefSection(chatId, 'terminals');
        return;
      }
      // Показываем города с типами
      const cityButtons = cities.map(city => {
        const cityName = typeof city === 'string' ? city : city.name;
        const cityType = typeof city === 'object' && city.type ? city.type : null;
        const typeLabel = cityType ? ` (${ref.TYPE_LABELS[cityType]})` : '';
        return [{ text: `${cityName}${typeLabel}`, callback_data: `adm_city|terminal|${cityName}` }];
      });
      cityButtons.push([{ text: '↩️ Отмена', callback_data: 'adm|terminals' }]);
      await this.bot.sendMessage(chatId,
        `➕ Точка: «${text}»\n\nВыберите город:`,
        { reply_markup: { inline_keyboard: cityButtons } }
      );
      return;
    }

    // === АДМИН: ввод нового значения (для строковых справочников) ===
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
          `✅ Инкассация: ${encashment} ₽\n\n📸 Шаг 10/11 — Загрузить фото чека?`,
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

      case 'business_trip':
        const bt = this.parseNum(text);
        if (bt === null) { await this.sendAndReplace(chatId, userId, session, '⚠️ Введите число:'); return; }
        session.businessTripAllowance = bt;
        await this.saveSaleAndStartItems(chatId, userId, session);
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

  createInitialSession(platform) {
    const today = new Date();
    const reportDate = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    return { 
      step: 'date_select',  // Changed from 'terminal_number' to 'date_select'
      platform, 
      reportDate: reportDate,  // NEW: Selected report date (ISO 8601)
      timestamp: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }), 
      items: [], 
      lastMsgId: null,
      // Calendar state (temporary, cleared after selection)
      _calendarMonth: null,
      _calendarYear: null
    };
  }

  /**
   * Validate and repair session state
   * Ensures reportDate exists and is valid
   */
  validateAndRepairSession(session) {
    if (!session) return session;
    
    // Ensure reportDate exists
    if (!session.reportDate) {
      console.warn('[Session Repair] Missing reportDate, setting to today');
      session.reportDate = new Date().toISOString().split('T')[0];
    }
    
    // Validate reportDate format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(session.reportDate)) {
      console.warn('[Session Repair] Invalid reportDate format:', session.reportDate);
      session.reportDate = new Date().toISOString().split('T')[0];
    }
    
    // Validate date is not in future
    const reportDate = new Date(session.reportDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (reportDate > today) {
      console.warn('[Session Repair] Future reportDate detected:', session.reportDate);
      session.reportDate = today.toISOString().split('T')[0];
    }
    
    // Validate date is not too old (90 days)
    const maxPastDate = new Date(today);
    maxPastDate.setDate(maxPastDate.getDate() - 90);
    
    if (reportDate < maxPastDate) {
      console.warn('[Session Repair] Too old reportDate detected:', session.reportDate);
      session.reportDate = today.toISOString().split('T')[0];
    }
    
    return session;
  }

  /**
   * Get session with automatic validation and repair
   * @param {number} userId - Telegram user ID
   * @returns {Object|null} Validated session or null
   */
  getSession(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;
    return this.validateAndRepairSession(session);
  }

  ensureTransactionId(session) {
    if (!session.transactionId) session.transactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return session.transactionId;
  }

  buildSaleRecord(session, userId) {
    this.ensureTransactionId(session);
    
    // Generate timestamp using selected reportDate + current time
    const timestamp = TimestampGenerator.generate(session.reportDate);
    
    return {
      transactionId: session.transactionId, 
      timestamp: timestamp,  // CHANGED: now uses reportDate
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

  formatSaleSavedMessage(session) {
    const t = report.calculateTotalRevenue(session);
    return `✅ Продажа записана!\n\n📅 ${session.timestamp}\n🔢 Терминал #${session.terminalNumber} | 📍 ${session.terminal}\n👤 ${session.manager} | 📊 ${session.channel}\n🏙️ ${session.city}\n💰 Налич: ${session.cash} | 💳 Безнал: ${session.cashless}\n🏦 Кредит: ${session.credit} | 🚚 Инкассация: ${session.encashment}\n🧳 Командировка: ${session.businessTripAllowance || 0}\n📊 Итого: ${t} ₽\n\n📦 Теперь добавим товары...`;
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
    const success = await sheets.appendSale(this.buildSaleRecord(session, userId));

    if (success) {
      await this.sendAndReplace(chatId, userId, session, this.formatSaleSavedMessage(session));
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