'use strict';

const ref = require('./services/refDictionary');
const sheets = require('./services/googleSheets');
const SessionManager = require('./core/SessionManager');
const VKAdapter = require('./adapters/vk');
const sales = require('./controllers/sales');
const admin = require('./controllers/admin');

process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ uncaughtException:', error && error.stack ? error.stack : error);
});

process.on('SIGINT', () => { console.log('\n👋 Остановка VK-бота...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Остановка VK-бота...'); process.exit(0); });

async function main() {
  const VK_GROUP_TOKEN = process.env.VK_GROUP_TOKEN;
  if (!VK_GROUP_TOKEN) {
    console.error('❌ VK_GROUP_TOKEN не задан в .env');
    process.exit(1);
  }

  console.log('🚀 Запуск Impulse VK Bot...');

  await ref.load();
  await sheets.init();

  // Unified controller dispatcher
  const controller = {
    async handle(ctx, session) {
      try {
        if (ctx.text === '/admin' || ctx.text === '/exit' || session._adminMode) {
          const handled = await admin.handle(ctx, session);
          if (handled) return;
        }
        await sales.handle(ctx, session);
      } catch (error) {
        console.error(`❌ Controller error [${ctx.userId}]:`, error && error.stack ? error.stack : error);
        await ctx.reply('⚠️ Произошла ошибка. Попробуйте /start').catch(() => {});
      }
    }
  };

  const vk = new VKAdapter({
    token: VK_GROUP_TOKEN,
    controller,
    sessionManager: SessionManager,
  });

  await vk.launch();

  console.log('');
  console.log('===========================================');
  console.log('  Impulse Device — VK Sales Bot');
  console.log('  Architecture: VK Adapter → Controller');
  console.log('===========================================');
  console.log('');
  console.log('📋 Команды:');
  console.log('  /start — Начать запись данных');
  console.log('  /admin — Панель администратора');
  console.log('  /exit  — Выйти из админ-режима');
  console.log('');
  console.log('🔄 VK-бот работает. Ожидание сообщений...');
  console.log('');
}

main().catch((error) => {
  console.error('❌ Ошибка запуска:', error.message);
  process.exit(1);
});
