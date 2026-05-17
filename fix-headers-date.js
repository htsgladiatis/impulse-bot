const sheets = require('./services/googleSheets');
(async () => {
  await sheets.init();
  if (!sheets.enabled) { console.log('Sheets off'); process.exit(1); }

  const rows = await sheets.readSheet('Продажи_Заголовки!A2:A2');
  const oldVal = rows[0] && rows[0][0];
  console.log('Текущее значение A2:', oldVal);

  if (oldVal && /^\d{5}[,.]\d+$/.test(oldVal)) {
    // Конвертируем Excel serial number обратно в дату
    const serial = parseFloat(oldVal.replace(',', '.'));
    const utcDays = Math.floor(serial) - 25569;
    const utcMs = utcDays * 86400000;
    const fractional = serial - Math.floor(serial);
    const totalMs = utcMs + fractional * 86400000;
    const d = new Date(totalMs);
    
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    const fixed = "'" + `${dd}.${mm}.${yyyy}, ${hh}:${mi}:${ss}`;
    
    console.log('Исправляем на:', fixed);
    
    const config = sheets.sheets ? null : require('./config');
    // Используем уже авторизованный экземпляр из googleSheets service
    await sheets.sheets.spreadsheets.values.update({
      spreadsheetId: require('./config').google.spreadsheetId,
      range: 'Продажи_Заголовки!A2',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[fixed]] }
    });
    console.log('✅ Исправлено!');
  } else {
    console.log('Значение не похоже на serial number, пропускаем');
  }
  
  process.exit(0);
})();