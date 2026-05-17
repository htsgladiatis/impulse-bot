'use strict';

const cart = require('./controllers/cart');
const report = require('./controllers/report');
const sales = require('./controllers/sales');
const ref = require('./services/refDictionary');
const sheets = require('./services/googleSheets');
const legacySheets = require('./sheets');
const TelegramAdapter = require('./adapters/telegram');
const VKAdapter = require('./adapters/vk');

async function main() {
  const session = {
    timestamp: 'test',
    terminalNumber: '1',
    manager: 'Test',
    channel: 'Test',
    city: 'Test',
    terminal: 'Test',
    cash: 100,
    cashless: 50,
    credit: 0,
    encashment: 0,
    items: [{ productName: 'Kegel', quantity: 1, unitPrice: 150, lineTotal: 150 }],
    transactionId: 'test-transaction',
  };

  const totalItems = cart.calculateTotal(session.items);
  const totalRevenue = report.calculateTotalRevenue(session);
  const reportData = report.buildReportData(session);

  if (totalItems !== 150) throw new Error(`cart total mismatch: ${totalItems}`);
  if (totalRevenue !== 150) throw new Error(`revenue mismatch: ${totalRevenue}`);
  if (!reportData.totals.valid) throw new Error('report totals should be valid');
  if (typeof report.formatPreviewReport(session) !== 'string') throw new Error('preview report is not string');
  if (typeof report.formatFinalReport(session) !== 'string') throw new Error('final report is not string');
  if (sales.buildSaleRecord(session, 'tg_test').totalRevenue !== 150) throw new Error('sale record total mismatch');
  if (typeof sales.formatSaleSavedMessage(session) !== 'string') throw new Error('sale saved message is not string');
  if (sheets !== legacySheets) throw new Error('legacy sheets wrapper mismatch');

  const adapter = new TelegramAdapter({ bot: { sendMessage: async () => ({ message_id: 1 }) } });
  const keyboard = TelegramAdapter.buildTelegramKeyboard({ buttons: [[{ text: 'OK', payload: 'ok' }]] });
  if (keyboard.inline_keyboard[0][0].callback_data !== 'ok') throw new Error('telegram keyboard invalid');
  const ctx = adapter.normalize({ from: { id: 1 }, chat: { id: 2 }, text: ' hi ', message_id: 3 });
  if (ctx.userId !== 'tg_1' || ctx.text !== 'hi') throw new Error('telegram normalize message invalid');

  const vk = new VKAdapter({ vk: { api: { messages: {} } } });
  const vkCtx = vk.normalize({ message: { fromId: 42, peerId: 42, id: 7, text: ' vk hi ', attachments: [] } });
  if (vkCtx.userId !== 'vk_42' || vkCtx.text !== 'vk hi') throw new Error('vk normalize message invalid');

  const dictionary = await ref.getRef();
  if (!dictionary || !Array.isArray(dictionary.products)) throw new Error('ref dictionary invalid');

  console.log('✅ smoke-check passed');
}

main().catch((error) => {
  console.error('❌ smoke-check failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});