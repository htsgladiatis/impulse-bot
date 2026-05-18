'use strict';

const ref = require('../services/refDictionary');
const sheets = require('../services/googleSheets');
const cart = require('./cart');
const report = require('./report');

const LONG_PRODUCTS = [
  'Электроды хлопковые', 'Электроды силиконовые',
  'Зонд вагинальный', 'Зонд ректальный', 'Клипсы электроды',
  'Насадки Dent', 'Гель контактный', 'Hot & Cold'
];

function gridButtons(list, cols) {
  const rows = [];
  for (let i = 0; i < list.length; i += cols) {
    rows.push(list.slice(i, i + cols).map((item, j) => ({ text: item, payload: `btn|${i + j}` })));
  }
  return { buttons: rows, inline: true };
}

function productButtons(list) {
  const rows = [];
  for (let idx = 0; idx < list.length; idx++) {
    const item = list[idx];
    if (LONG_PRODUCTS.includes(item)) {
      rows.push([{ text: item, payload: `btn|${idx}` }]);
    } else {
      if (rows.length === 0 || rows[rows.length - 1].length >= 3) rows.push([]);
      rows[rows.length - 1].push({ text: item, payload: `btn|${idx}` });
    }
  }
  return { buttons: rows };
}

function paginatedButtons(list, page, pageSize) {
  const totalPages = Math.ceil(list.length / pageSize);
  const start = page * pageSize;
  const end = Math.min(start + pageSize, list.length);
  const rows = [];
  for (let i = start; i < end; i++) rows.push([{ text: list[i], payload: `btn|${i}` }]);
  const navRow = [];
  if (page > 0) navRow.push({ text: '◀️ Назад', payload: 'pg|back' });
  navRow.push({ text: `📄 ${page + 1} / ${totalPages}`, payload: 'pg|info' });
  if (page < totalPages - 1) navRow.push({ text: 'Вперёд ▶️', payload: 'pg|forward' });
  rows.push(navRow);
  return { buttons: rows, inline: true };
}

function parseNum(text) {
  const n = parseFloat(String(text).replace(',', '.').replace(/\s/g, ''));
  return isNaN(n) ? null : n;
}

class SalesController {
  async handle(ctx, session) {
    const { text, payload, photo } = ctx;

    if (text === '/start') {
      Object.assign(session, this.createInitialSession(ctx.platform));
      await ctx.reply(`📅 Дата: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}\n\n🔢 Шаг 1/11 — Введите номер терминала:`);
      return;
    }

    if (photo && session.step === 'waiting_receipt') {
      await this._handlePhoto(ctx, session, photo);
      return;
    }

    if (payload) { await this._handlePayload(ctx, session, payload); return; }
    if (text && !text.startsWith('/')) await this._handleText(ctx, session, text);
  }

  createInitialSession(platform) {
    return { step: 'terminal_number', platform, timestamp: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }), items: [], lastMsgId: null };
  }

  ensureTransactionId(session) {
    if (!session.transactionId) session.transactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return session.transactionId;
  }

  buildSaleRecord(session, userId) {
    this.ensureTransactionId(session);
    return {
      transactionId: session.transactionId, timestamp: session.timestamp, telegramId: userId,
      username: session.username, terminalNumber: session.terminalNumber, manager: session.manager,
      channel: session.channel, city: session.city, terminal: session.terminal,
      cash: session.cash || 0, cashless: session.cashless || 0, credit: session.credit || 0,
      encashment: session.encashment || 0, businessTripAllowance: session.businessTripAllowance || 0,
      totalRevenue: report.calculateTotalRevenue(session),
      receiptUrl: session.receiptUrl || '',
    };
  }

  formatSaleSavedMessage(session) {
    const t = report.calculateTotalRevenue(session);
    return `✅ Продажа записана!\n\n📅 ${session.timestamp}\n🔢 Терминал #${session.terminalNumber} | 📍 ${session.terminal}\n👤 ${session.manager} | 📊 ${session.channel}\n🏙️ ${session.city}\n💰 Налич: ${session.cash} | 💳 Безнал: ${session.cashless}\n🏦 Кредит: ${session.credit} | 🚚 Инкассация: ${session.encashment}\n🧳 Командировка: ${session.businessTripAllowance || 0}\n📊 Итого: ${t} ₽\n\n📦 Теперь добавим товары...`;
  }

  async _handlePhoto(ctx, session, photo) {
    await ctx.reply('⏳ Загружаю фото...');
    try {
      this.ensureTransactionId(session);
      const yandexDisk = require('../services/yandexDisk');
      const stream = await ctx.getPhotoStream();
      const receiptUrl = await yandexDisk.uploadReceipt(stream, session.transactionId, 'receipt.jpg');
      if (receiptUrl) {
        session.receiptUrl = receiptUrl;
        await ctx.reply(`✅ Фото загружено!\n🔗 ${receiptUrl}`);
        await this._saveSaleAndStartItems(ctx, session);
      } else {
        session.receiptUrl = '';
        await ctx.reply('⚠️ Не удалось загрузить фото. Попробуйте ещё раз или пропустите.', {
          buttons: [[{ text: '📸 Попробовать снова', payload: 'btn|retry_photo' }], [{ text: '⏭️ Продолжить без фото', payload: 'btn|skip_photo' }]]
        });
      }
    } catch (e) {
      session.receiptUrl = '';
      await ctx.reply('⚠️ Ошибка загрузки фото.', {
        buttons: [[{ text: '📸 Попробовать снова', payload: 'btn|retry_photo' }], [{ text: '⏭️ Продолжить без фото', payload: 'btn|skip_photo' }]]
      });
    }
  }

  async _handlePayload(ctx, session, payload) {
    if (payload.startsWith('pg|')) {
      const action = payload.split('|')[1];
      if (action === 'forward') session._page = (session._page || 0) + 1;
      else if (action === 'back') session._page = Math.max(0, (session._page || 0) - 1);
      const r = await ref.getRef();
      await ctx.reply('📍 Шаг 5/11 — Выберите точку (название):', paginatedButtons(r.terminals, session._page || 0, 10));
      return;
    }
    if (payload.startsWith('btn|')) { await this._handleButtonChoice(ctx, session, payload.split('|')[1]); return; }
    if (payload === 'preview_confirm') { await this._finalSubmit(ctx, session); return; }
    if (payload === 'preview_edit') {
      session.step = 'edit_choose';
      await ctx.reply('✏️ Что хотите изменить?', {
        buttons: [[{ text: '💰 Суммы оплат', payload: 'edit|payments' }], [{ text: '📦 Товары', payload: 'edit|items' }], [{ text: '➕ Добавить товар', payload: 'edit|add_item' }], [{ text: '👤 Менеджер', payload: 'edit|manager' }], [{ text: '❌ Отмена — в начало', payload: 'edit|cancel' }]]
      });
      return;
    }
    if (payload.startsWith('edit|')) {
      const t = payload.split('|')[1];
      if (t === 'add_item') await this._startProductFlow(ctx, session);
      else await this._handleEdit(ctx, session, t);
      return;
    }
    if (payload.startsWith('edit_item|')) { await this._handleEditItem(ctx, session, payload); return; }
  }

  async _handleButtonChoice(ctx, session, value) {
    const r = await ref.getRef();
    const idx = parseInt(value);
    const isIndex = !isNaN(idx);

    switch (session.step) {
      case 'manager': { session.manager = isIndex && idx >= 0 && idx < r.managers.length ? r.managers[idx] : value; session.step = 'channel'; await ctx.reply(`✅ Менеджер: ${session.manager}\n\n📊 Шаг 3/11 — Выберите канал продаж:`, gridButtons(r.channels, 2)); break; }
      case 'channel': { session.channel = isIndex && idx >= 0 && idx < r.channels.length ? r.channels[idx] : value; session.step = 'city'; await ctx.reply(`✅ Канал: ${session.channel}\n\n🏙️ Шаг 4/11 — Выберите город:`, gridButtons(r.cities, 3)); break; }
      case 'city': { session.city = isIndex && idx >= 0 && idx < r.cities.length ? r.cities[idx] : value; session.step = 'terminal'; session._page = 0; await ctx.reply(`✅ Город: ${session.city}\n\n📍 Шаг 5/11 — Выберите точку (название):`, paginatedButtons(r.terminals, 0, 10)); break; }
      case 'terminal': { session.terminal = isIndex && idx >= 0 && idx < r.terminals.length ? r.terminals[idx] : value; session.step = 'cash'; await ctx.reply(`✅ Точка: ${session.terminal}\n\n💰 Шаг 6/11 — Введите сумму наличные (за день):`); break; }
      case 'receipt_confirm': if (value === 'Да_чек') { session.step = 'waiting_receipt'; await ctx.reply('📸 Отправьте фото чека:'); } else { session.receiptUrl = ''; await this._saveSaleAndStartItems(ctx, session); } break;
      case 'waiting_receipt': if (value === 'retry_photo') { session.step = 'waiting_receipt'; await ctx.reply('📸 Отправьте фото чека:'); } else if (value === 'skip_photo') { session.receiptUrl = ''; await this._saveSaleAndStartItems(ctx, session); } break;
      case 'more_confirm': if (value === 'Да') await this._startProductFlow(ctx, session); else await this._showPreview(ctx, session); break;
      case 'edit_manager': { session.manager = isIndex && idx >= 0 && idx < r.managers.length ? r.managers[idx] : value; await ctx.reply(`✅ Менеджер изменён на: ${session.manager}`); await this._showPreview(ctx, session); break; }
      case 'product': { const p = isIndex && idx >= 0 && idx < r.products.length ? r.products[idx] : value; session.currentItem = { productName: p }; session.step = 'quantity'; await ctx.reply(`✅ Товар: ${p}\n\n📦 Количество:`); break; }
    }
  }

  async _handleText(ctx, session, text) {
    switch (session.step) {
      case 'terminal_number': { session.terminalNumber = text; session.step = 'manager'; const r = await ref.getRef(); await ctx.reply(`✅ Номер: ${text}\n\n👤 Шаг 2/11 — Выберите менеджера:`, gridButtons([...new Set(r.managers)], 3)); break; }
      case 'cash': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.cash = v; session.step = 'cashless'; await ctx.reply(`✅ Наличные: ${v} ₽\n\n💳 Шаг 7/11 — Введите сумму безналичные (за день):`); break; }
      case 'cashless': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.cashless = v; session.step = 'credit'; await ctx.reply(`✅ Безналичные: ${v} ₽\n\n🏦 Шаг 8/11 — Введите сумму Кредит/Рассрочка (за день):`); break; }
      case 'credit': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.credit = v; session.step = 'encashment'; await ctx.reply(`✅ Кредит/Рассрочка: ${v} ₽\n\n🚚 Шаг 9/11 — Введите сумму инкассации (за день):`); break; }
      case 'encashment': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.encashment = v; session.step = 'business_trip'; await ctx.reply(`✅ Инкассация: ${v} ₽\n\n🧳 Шаг 10/11 — Введите командировочную надбавку (за день):`); break; }
      case 'business_trip': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.businessTripAllowance = v; session.step = 'receipt_confirm'; await ctx.reply(`✅ Командировочная: ${v} ₽\n\n📸 Шаг 11/11 — Загрузить фото чека?`, { buttons: [[{ text: '✅ Да, загрузить фото', payload: 'btn|Да_чек' }], [{ text: '❌ Нет, продолжить', payload: 'btn|Нет_чек' }]] }); break; }
      case 'quantity': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.currentItem.quantity = v; session.step = 'unit_price'; await ctx.reply(`✅ Количество: ${v}\n\n💲 Цена за единицу:`); break; }
      case 'unit_price': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.currentItem.unitPrice = v; session.currentItem.lineTotal = cart.calculateLineTotal(session.currentItem.quantity, v); session.step = 'item_comment'; await ctx.reply(`✅ Цена: ${v} ₽ | Сумма: ${session.currentItem.lineTotal} ₽\n\n💬 Комментарий к товару (или "-" чтобы пропустить):`); break; }
      case 'item_comment': { session.currentItem.comment = text === '-' ? '' : text; session.items.push(session.currentItem); session.currentItem = null; session.step = 'more_confirm'; await ctx.reply('✅ Товар добавлен!\n\n📦 Добавить ещё товар?', { buttons: [[{ text: '✅ Да, ещё товар', payload: 'btn|Да' }], [{ text: '❌ Нет. Проверить отчет', payload: 'btn|Нет' }]] }); break; }
      case 'edit_cash': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.cash = v; session.step = 'edit_cashless'; await ctx.reply(`✅ Наличные: ${v} ₽\nВведите новые безналичные (текущее: ${session.cashless || 0}):`); break; }
      case 'edit_cashless': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.cashless = v; session.step = 'edit_credit'; await ctx.reply(`✅ Безналичные: ${v} ₽\nВведите новый кредит/рассрочка (текущее: ${session.credit || 0}):`); break; }
      case 'edit_credit': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.credit = v; session.step = 'edit_encashment'; await ctx.reply(`✅ Кредит/Рассрочка: ${v} ₽\nВведите новую инкассацию (текущее: ${session.encashment || 0}):`); break; }
      case 'edit_encashment': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.encashment = v; session.step = 'edit_business_trip'; await ctx.reply(`✅ Инкассация: ${v} ₽\nВведите новую командировочную (текущее: ${session.businessTripAllowance || 0}):`); break; }
      case 'edit_business_trip': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session.businessTripAllowance = v; await ctx.reply(`✅ Командировочная: ${v} ₽\n\nСуммы обновлены!`); await this._showPreview(ctx, session); break; }
      case 'edit_item_qty': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } session._editItemNewQty = v; session.step = 'edit_item_price'; await ctx.reply(`✅ Количество: ${v}\nВведите новую цену за единицу (текущее: ${session.items[session._editItemIdx].unitPrice}):`); break; }
      case 'edit_item_price': { const v = parseNum(text); if (v === null) { await ctx.reply('⚠️ Введите число:'); return; } const e = cart.updateItemPrice(session.items[session._editItemIdx], session._editItemNewQty, v); session.items[session._editItemIdx] = e; await ctx.reply(`✅ Обновлено: ${e.productName} × ${e.quantity} = ${e.lineTotal} ₽`); await this._showPreview(ctx, session); break; }
    }
  }

  async _handleEdit(ctx, session, target) {
    const r = await ref.getRef();
    switch (target) {
      case 'payments': session.step = 'edit_cash'; session._editMode = true; await ctx.reply(`💰 Текущие суммы:\n  Наличные: ${session.cash || 0}\n  Безналичные: ${session.cashless || 0}\n  Кредит: ${session.credit || 0}\n  Инкассация: ${session.encashment || 0}\n  Командировочная: ${session.businessTripAllowance || 0}\n\nВведите новую сумму наличные:`); break;
      case 'items':
        if (session.items.length === 0) { await ctx.reply('📦 Товаров пока нет. Хотите добавить?', { buttons: [[{ text: '➕ Добавить товар', payload: 'edit|add_item' }], [{ text: '↩️ Назад к предпросмотру', payload: 'preview_edit' }]] }); return; }
        const ib = cart.buildEditItemButtons(session.items); ib.push([{ text: '🗑 Удалить все товары', payload: 'edit_item|delete_all' }]); ib.push([{ text: '↩️ Назад', payload: 'preview_edit' }]); session.step = 'edit_item_choose'; await ctx.reply('📦 Выберите товар для редактирования:', { buttons: ib }); break;
      case 'manager': session.step = 'edit_manager'; await ctx.reply('👤 Выберите нового менеджера:', gridButtons([...new Set(r.managers)], 3)); break;
      case 'cancel': session.step = 'IDLE'; await ctx.reply('❌ Запись отменена. /start для новой записи.'); break;
    }
  }

  async _handleEditItem(ctx, session, payload) {
    const idx = payload.split('|')[1];
    if (idx === 'delete_all') { session.items = []; await ctx.reply('🗑 Все товары удалены.'); await this._showPreview(ctx, session); return; }
    const editIdx = parseInt(idx);
    const item = Number.isInteger(editIdx) && editIdx >= 0 && editIdx < session.items.length ? session.items[editIdx] : undefined;
    if (!item) return;
    session._editItemIdx = editIdx;
    session.step = 'edit_item_qty';
    await ctx.reply(`✏️ ${item.productName}\nКоличество: ${item.quantity}\nЦена: ${item.unitPrice} ₽\n\nВведите новое количество (текущее: ${item.quantity}):`);
  }

  async _saveSaleAndStartItems(ctx, session) {
    this.ensureTransactionId(session);
    const success = await sheets.appendSale(this.buildSaleRecord(session, ctx.userId));
    if (success) { await ctx.reply(this.formatSaleSavedMessage(session)); await this._startProductFlow(ctx, session); }
    else { await ctx.reply('❌ Ошибка записи. /start'); }
  }

  async _startProductFlow(ctx, session) {
    session.step = 'product';
    const r = await ref.getRef();
    await ctx.reply('📦 Выберите товар:', productButtons(r.products));
  }

  async _showPreview(ctx, session) {
    session.step = 'preview';
    await ctx.reply(report.formatPreviewReport(session), { buttons: [[{ text: '✅ Подтвердить и отправить', payload: 'preview_confirm' }], [{ text: '✏️ Редактировать', payload: 'preview_edit' }]] });
  }

  async _finalSubmit(ctx, session) {
    this.ensureTransactionId(session);
    if (session.items.length > 0) await sheets.appendItems(session.transactionId, session.items);
    if (session.receiptUrl) await sheets.updateReceiptUrl(session.transactionId, session.receiptUrl);
    await ctx.reply(report.formatFinalReport(session));
  }
}

module.exports = new SalesController();