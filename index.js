const ImpulseBot = require('./bot');

process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection:', reason && reason.stack ? reason.stack : reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ uncaughtException:', error && error.stack ? error.stack : error);
});

async function main() {
  console.log('🚀 Запуск Impulse Bot...');
  
  try {
    const bot = new ImpulseBot();
    await bot.init();
    
    console.log('');
    console.log('===========================================');
    console.log('  Impulse Device — Sales Bot');
    console.log('  Telegram → Google Sheets');
    console.log('===========================================');
    console.log('');
    console.log('📋 Команды:');
    console.log('  /start — Начать запись данных');
    console.log('  /admin — Панель администратора');
    console.log('  /exit  — Выйти из админ-режима');
    console.log('');
    console.log('🔄 Бот работает. Ожидание сообщений...');
    console.log('');
    
  } catch (error) {
    console.error('❌ Ошибка запуска:', error.message);
    process.exit(1);
  }
}

// Обработка graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 Остановка бота...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('👋 Остановка бота...');
  process.exit(0);
});

main();