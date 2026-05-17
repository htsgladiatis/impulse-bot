'use strict';

const fs = require('fs').promises;
const path = require('path');

function getExcelJS() {
  return require('exceljs');
}

const LOCAL_FILE = path.join(__dirname, '..', 'sales.json');
const EXCEL_FILE = path.join(__dirname, '..', 'sales.xlsx');

// Порядок колонок = порядок заполнения в боте (шаги 1-12)
const SALES_HEADERS = [
  { header: 'Дата и время', key: 'timestamp', width: 22 },
  { header: 'Номер терминала', key: 'terminalNumber', width: 16 },
  { header: 'Менеджер', key: 'manager', width: 18 },
  { header: 'Канал продаж', key: 'channel', width: 22 },
  { header: 'Город', key: 'city', width: 18 },
  { header: 'Точка (название)', key: 'terminal', width: 25 },
  { header: 'Наличные (за день)', key: 'cash', width: 18 },
  { header: 'Безналичные (за день)', key: 'cashless', width: 20 },
  { header: 'Кредит/Рассрочка', key: 'credit', width: 18 },
  { header: 'Инкассация', key: 'encashment', width: 16 },
  { header: 'Итого выручка', key: 'totalRevenue', width: 16 },
  { header: 'Фото чека', key: 'receiptPhoto', width: 15 },
  { header: 'Комментарий', key: 'comment', width: 25 },
  { header: 'ID транзакции', key: 'transactionId', width: 28 },
];

const ITEMS_HEADERS = [
  { header: 'ID записи', key: 'itemId', width: 28 },
  { header: 'ID транзакции', key: 'transactionId', width: 28 },
  { header: 'Дата и время', key: 'timestamp', width: 22 },
  { header: 'Менеджер', key: 'manager', width: 18 },
  { header: 'Название товара', key: 'productName', width: 25 },
  { header: 'Количество', key: 'quantity', width: 14 },
  { header: 'Цена за единицу', key: 'unitPrice', width: 16 },
  { header: 'Сумма позиции', key: 'lineTotal', width: 16 },
  { header: 'Комментарий', key: 'comment', width: 25 },
];

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  row.alignment = { horizontal: 'center', vertical: 'middle' };
  row.height = 22;
}

function autoFitColumns(worksheet) {
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const len = cell.value ? cell.value.toString().length : 0;
      if (len > maxLength) maxLength = len;
    });
    column.width = Math.max(maxLength + 2, 10);
  });
}

async function init() {
  try {
    await fs.access(LOCAL_FILE);
  } catch {
    await fs.writeFile(LOCAL_FILE, JSON.stringify({ sales: [] }, null, 2));
  }
}

async function readSales() {
  await init();
  const raw = await fs.readFile(LOCAL_FILE, 'utf-8');
  return JSON.parse(raw);
}

async function writeSaleJson(sale) {
  const json = await readSales();
  json.sales.push(sale);
  await fs.writeFile(LOCAL_FILE, JSON.stringify(json, null, 2));
}

async function writeSale(sale) {
  await writeSaleJson(sale);
  await appendSaleRow(sale);

  if (sale.items && Array.isArray(sale.items)) {
    await appendItems(sale.transactionId, sale.items);
  }
}

async function exportToExcel() {
  // Excel export is incremental: appendSaleRow()/appendItems() write directly to sales.xlsx.
  // This placeholder remains for the future full rebuild-from-JSON operation.
  return EXCEL_FILE;
}

async function appendSaleRow(data) {
  const ExcelJS = getExcelJS();
  const workbook = new ExcelJS.Workbook();
  let worksheet;
  let fileExists = false;

  try {
    await fs.access(EXCEL_FILE);
    await workbook.xlsx.readFile(EXCEL_FILE);
    worksheet = workbook.getWorksheet('Продажи_Заголовки');
    fileExists = true;
  } catch {
    // Файл не существует
  }

  if (!fileExists || !worksheet) {
    worksheet = workbook.addWorksheet('Продажи_Заголовки');
    worksheet.columns = SALES_HEADERS;
    styleHeaderRow(worksheet.getRow(1));
  }

  worksheet.addRow({
    transactionId: data.transactionId,
    timestamp: data.timestamp,
    terminalNumber: data.terminalNumber || '',
    manager: data.manager || data.username || '',
    channel: data.channel || '',
    city: data.city || '',
    terminal: data.terminal || '',
    cash: data.cash || '',
    cashless: data.cashless || '',
    credit: data.credit || '',
    encashment: data.encashment || '',
    totalRevenue: data.totalRevenue || '',
    receiptPhoto: data.receiptPhoto || '',
    comment: data.comment || ''
  });

  autoFitColumns(worksheet);
  await workbook.xlsx.writeFile(EXCEL_FILE);
}

async function appendItems(transactionId, items, meta = {}) {
  const ExcelJS = getExcelJS();
  const workbook = new ExcelJS.Workbook();
  let worksheet;
  let fileExists = false;

  try {
    await fs.access(EXCEL_FILE);
    await workbook.xlsx.readFile(EXCEL_FILE);
    worksheet = workbook.getWorksheet('Продажи_Товары');
    fileExists = true;
  } catch {
    // Файл не существует
  }

  if (!fileExists || !worksheet) {
    worksheet = workbook.addWorksheet('Продажи_Товары');
    worksheet.columns = ITEMS_HEADERS;
    styleHeaderRow(worksheet.getRow(1));
  }

  for (const item of items) {
    worksheet.addRow({
      itemId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      transactionId: transactionId,
      timestamp: meta.timestamp || '',
      manager: meta.manager || '',
      productName: item.productName || '',
      quantity: item.quantity || '',
      unitPrice: item.unitPrice || '',
      lineTotal: item.lineTotal || (item.quantity * item.unitPrice) || '',
      comment: item.comment || ''
    });
  }

  autoFitColumns(worksheet);
  await workbook.xlsx.writeFile(EXCEL_FILE);
}

module.exports = {
  init,
  readSales,
  writeSale,
  writeSaleJson,
  appendSaleRow,
  appendItems,
  exportToExcel,
};