'use strict';

const cart = require('./cart');

function calculateTotalRevenue(payload = {}) {
  return Number(payload.cash || 0) +
    Number(payload.cashless || 0) +
    Number(payload.credit || 0) +
    Number(payload.encashment || 0) +
    Number(payload.businessTripAllowance || 0);
}

function validateTotals(itemsTotal, declaredTotal) {
  const calculatedTotal = Number(itemsTotal || 0);
  const declared = Number(declaredTotal || 0);
  const delta = declared - calculatedTotal;
  return { valid: delta === 0, calculatedTotal, declaredTotal: declared, delta };
}

function buildReportData(session = {}) {
  const items = session.items || [];
  const totalRevenue = calculateTotalRevenue(session);
  const itemsTotal = cart.calculateTotal(items);
  const itemsCount = items.length;
  const itemsList = cart.formatItemsList(items);
  const totals = validateTotals(itemsTotal, totalRevenue);

  let mismatch = '';
  if (itemsCount > 0 && totalRevenue > 0) {
    const diff = Math.abs(totals.delta);
    mismatch = totals.valid
      ? '\n\n✅ Суммы совпадают!'
      : `\n\n⚠️ Суммы не совпадают!\n  Выручка: ${totalRevenue} ₽\n  Товары: ${itemsTotal} ₽\n  Разница: ${diff} ₽`;
  }

  return { totalRevenue, itemsTotal, itemsCount, itemsList, mismatch, totals };
}

function formatPreviewReport(session = {}) {
  const data = buildReportData(session);

  return `📋 ПРЕДПРОСМОТР ОТЧЁТА\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📅 Дата: ${session.timestamp}\n` +
    `🔢 Номер: ${session.terminalNumber}\n` +
    `👤 Менеджер: ${session.manager}\n` +
    `📊 Канал: ${session.channel}\n` +
    `🏙️ Город: ${session.city}\n` +
    `📍 Точка: ${session.terminal}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Наличные: ${session.cash || 0} ₽\n` +
    `💳 Безналичные: ${session.cashless || 0} ₽\n` +
    `🏦 Кредит/Рассрочка: ${session.credit || 0} ₽\n` +
    `🚚 Инкассация: ${session.encashment || 0} ₽\n` +
    `🧳 Командировочная: ${session.businessTripAllowance || 0} ₽\n` +
    `📊 Итого: ${data.totalRevenue} ₽\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Товары (${data.itemsCount}):\n${data.itemsList}\n` +
    `💰 Сумма товаров: ${data.itemsTotal} ₽` +
    `${data.mismatch}\n` +
    `${session.receiptUrl ? `📸 Чек: ${session.receiptUrl}\n` : ''}` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Подтвердить отправку?`;
}

function formatFinalReport(session = {}) {
  const data = buildReportData(session);
  const itemsSummary = cart.formatItemsList(session.items || []);

  return `✅ ОТЧЁТ ОТПРАВЛЕН!\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 Транзакция: ${session.transactionId}\n` +
    `📅 ${session.timestamp}\n` +
    `🔢 ${session.terminalNumber} | 📍 ${session.terminal}\n` +
    `👤 ${session.manager} | 📊 ${session.channel}\n` +
    `🏙️ ${session.city}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Налич: ${session.cash || 0} | 💳 Безнал: ${session.cashless || 0}\n` +
    `🏦 Кредит: ${session.credit || 0} | 🚚 Инкассация: ${session.encashment || 0}\n` +
    `🧳 Командировочная: ${session.businessTripAllowance || 0} ₽\n` +
    `📊 Итого: ${data.totalRevenue} ₽\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Товары (${(session.items || []).length}):\n${itemsSummary}\n` +
    `💰 Сумма товаров: ${data.itemsTotal} ₽\n` +
    `${session.receiptUrl ? `📸 Чек: ${session.receiptUrl}\n` : ''}` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Для новой записи — /start`;
}

module.exports = {
  calculateTotalRevenue,
  validateTotals,
  buildReportData,
  formatPreviewReport,
  formatFinalReport,
  formatReport: formatPreviewReport,
};