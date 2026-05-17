const sheets = require('./services/googleSheets');
(async () => {
  await sheets.init();
  if (!sheets.enabled) { console.log('Sheets off'); process.exit(1); }
  const cfg = require('./config');
  const rows = await sheets.readSheet('Продажи_Товары!A:I');
  for (let i = 1; i < rows.length; i++) {
    const cell = rows[i][2];
    if (cell && /^\d{5},\d+$/.test(cell)) {
      const serial = parseFloat(cell.replace(',', '.'));
      const epoch = new Date(1899, 11, 30);
      const d = new Date(epoch.getTime() + serial * 86400000);
      const ts = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
      console.log('Row', i+1, ': fixing', cell, '->', ts);
      await sheets.sheets.spreadsheets.values.update({
        spreadsheetId: cfg.google.spreadsheetId,
        range: 'Продажи_Товары!C' + (i+1),
        valueInputOption: 'USER_ENTERED',
        resource: { values: [["'" + ts]] }
      });
    }
  }
  console.log('Done');
  process.exit(0);
})();