const sheets = require('./services/googleSheets');
(async () => {
  await sheets.init();
  if (!sheets.enabled) { console.log('Sheets off'); process.exit(1); }
  const rows = await sheets.readSheet('Продажи_Товары!A:I');
  rows.forEach((r, i) => console.log(i, JSON.stringify(r)));
  process.exit(0);
})();