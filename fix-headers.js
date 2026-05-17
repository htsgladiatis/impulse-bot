/**
 * Одноразовый скрипт: очищает вкладку "Продажи_Товары" 
 * и записывает правильные заголовки (11 колонок).
 * 
 * Запуск: node fix-headers.js
 */
const sheets = require('./services/googleSheets');

(async () => {
  await sheets.init();
  if (!sheets.enabled) {
    console.error('❌ Google Sheets не подключен. Проверьте config.');
    process.exit(1);
  }
  await sheets.resetItemsHeaders();
  console.log('✅ Готово. Таблица очищена и заголовки обновлены.');
  process.exit(0);
})();