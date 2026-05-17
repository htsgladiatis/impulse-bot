'use strict';

function calculateLineTotal(quantity, unitPrice) {
  return Number(quantity || 0) * Number(unitPrice || 0);
}

function calculateTotal(items = []) {
  return items.reduce((sum, item) => sum + Number(item.lineTotal ?? item.total ?? 0), 0);
}

function formatItemLine(item) {
  return `  • ${item.productName} × ${item.quantity} = ${item.lineTotal} ₽`;
}

function formatItemsList(items = [], emptyText = '  нет товаров') {
  return items.map(formatItemLine).join('\n') || emptyText;
}

function buildEditItemButtons(items = []) {
  return items.map((item, idx) => [{
    text: `${item.productName} × ${item.quantity} = ${item.lineTotal} ₽`,
    payload: `edit_item|${idx}`
  }]);
}

function updateItemPrice(item, quantity, unitPrice) {
  const normalized = {
    ...item,
    quantity: Number(quantity || 0),
    unitPrice: Number(unitPrice || 0),
  };
  normalized.lineTotal = calculateLineTotal(normalized.quantity, normalized.unitPrice);
  return normalized;
}

function addItem(cart = [], item) {
  const normalized = {
    ...item,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
  };
  normalized.lineTotal = calculateLineTotal(normalized.quantity, normalized.unitPrice);
  return [...cart, normalized];
}

function removeItem(cart = [], index) {
  return cart.filter((_, i) => i !== index);
}

module.exports = {
  addItem,
  removeItem,
  calculateLineTotal,
  calculateTotal,
  formatItemLine,
  formatItemsList,
  buildEditItemButtons,
  updateItemPrice,
};