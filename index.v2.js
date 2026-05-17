'use strict';

const config = require('./config');
const ref = require('./services/refDictionary');
const sheets = require('./services/googleSheets');
const SessionManager = require('./core/SessionManager');
const TelegramAdapter = require('./adapters/telegram');
const sales = require('./controllers/sales');
const admin = require('./controllers/admin');

process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ uncaughtException:', error && error.stack ? error.stack : error);
});

process.on('SIGINT', () => { console.log('\n👋 Остановка бота (v2)...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n👋 Остановка бота (v2)...'); process.exit(0); });

async function main() {
  console.log('🚀 Запуск Impulse Bot v2 (architectural rewrite)...');

  await ref.load();
  await sheets.init();

  // Unified controller dispatcher
  const controller = {
    async handle(ctx, session) {
      try {
        // Admin commands have priority
        if (ctx.text === '/admin' || ctx.text === '/exit' || session._adminMode) {
          const handled = await admin.handle(ctx, session);
          if (handled) return;
        }

        // Sales flow handles everything else
        await sales.handle(ctx, session);
      } catch (error) {
        console.error(`❌ Controller error [${ctx.userId}]:`, error && error.stack ? error.stack : error);
        await ctx.reply('⚠️ Произошла ошибка. Попробуйте /start').catch(() => {});
      }
    }
  };

  // Telegram adapter
  const telegram = new TelegramAdapter({
    token: config.telegram.token,
    controller,
    sessionManager: SessionManager,
  });

  await telegram.launch();

  console.log('');
  console.log('===========================================');
  console.log('  Impulse Device — Sales Bot v2');
  console.log('  Architecture: Adapter → Controller');
  console.log('===========================================');
  console.log('');
  console.log('📋 Команды:');
  console.log('  /start — Начать запись данных');
  console.log('  /admin — Панель администратора');
  console.log('  /exit  — Выйти из админ-режима');
  console.log('');
  console.log('🔄 Бот работает. Ожидание сообщений...');
  console.log('');
}

main().catch((error) => {
  console.error('❌ Ошибка запуска:', error.message);
  process.exit(1);
});