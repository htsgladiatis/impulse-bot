const sheets = require('./services/googleSheets');
(async () => {
  await sheets.init();
  if (!sheets.enabled) { console.log('Sheets off'); process.exit(1); }

  console.log('=== Продажи_Заголовки ===');
  const h = await sheets.readSheet('Продажи_Заголовки!A:N');
  h.forEach((r, i) => {
    // Проверяем колонку A (timestamp) на serial numbers
    const cell = r[0];
    if (cell && /^\d{5}[,.]\d+$/.test(cell)) {
      console.log('⚠️ SERIAL на строке', i + 1, 'колонка A:', cell);
    }
    console.log(i, JSON.stringify(r));
  });

  console.log('\n=== Продажи_Товары ===');
  const t = await sheets.readSheet('Продажи_Товары!A:I');
  t.forEach((r, i) => {
    const cell = r[2]; // колонка C — Дата и время
    if (cell && /^\d{5}[,.]\d+$/.test(cell)) {
      console.log('⚠️ SERIAL на строке', i + 1, 'колонка C:', cell);
    }
    console.log(i, JSON.stringify(r));
  });

  console.log('\nDone');
  process.exit(0);
})();