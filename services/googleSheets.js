'use strict';

const dataService = require('./dataService');

function getConfig() {
  return require('../config');
}

class GoogleSheetsService {
  constructor() {
    this.enabled = false;
    this.sheets = null;
  }

  async init() {
    try {
      const config = getConfig();
      const { google } = require('googleapis');

      let auth;
      if (config.google.credentials) {
        const credentials = config.google.credentials;
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
      } else {
        auth = new google.auth.GoogleAuth({
          keyFile: config.google.keyFile,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
      }

      const authClient = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: authClient });
      this.enabled = true;
      console.log('✅ Google Sheets: авторизован');
    } catch (error) {
      console.log('⚠️ Google Sheets недоступен, используется локальное хранение');
      this.enabled = false;
    }

    await dataService.init();
  }

  async getCities() {
    if (this.enabled) {
      try {
        const rows = await this.readSheet('Справочники!A:B');
        const cities = rows.filter(r => r[0] === 'Город').map(r => r[1]);
        return cities.length ? cities : this.defaultCities();
      } catch { return this.defaultCities(); }
    }
    return this.defaultCities();
  }

  async getChannels() {
    if (this.enabled) {
      try {
        const rows = await this.readSheet('Справочники!A:B');
        const channels = rows.filter(r => r[0] === 'Канал продаж').map(r => r[1]);
        return channels.length ? channels : this.defaultChannels();
      } catch { return this.defaultChannels(); }
    }
    return this.defaultChannels();
  }

  async isAuthorized(telegramId) {
    // Whitelist is intentionally disabled: all users are allowed.
    // Kept only for backward compatibility with older code paths.
    return true;
  }

  async appendSale(data) {
    // Сохраняем локально в JSON/Excel
    try {
      await dataService.writeSale(data);
      console.log('💾 Запись сохранена локально:', data.transactionId);
      console.log('📊 Запись добавлена в Excel (Продажи_Заголовки):', data.transactionId);
    } catch (error) {
      console.error('Ошибка локальной записи:', error.message);
      return false;
    }

    // Google Sheets
    if (this.enabled) {
      try {
        const config = getConfig();
        // Порядок колонок = A:N (14 колонок), совпадает с шагами бота
        // Префикс "'" принудительно заставляет Google Sheets хранить как текст
        const ts = data.timestamp ? "'" + data.timestamp : '';
        const row = [
          ts,                       // A: Дата (шаг 1) — текст
          data.terminalNumber || '', // B: Номер терминала (шаг 2)
          data.manager || '',        // C: Менеджер (шаг 3)
          data.channel || '',        // D: Канал (шаг 4)
          data.city || '',           // E: Город (шаг 5)
          data.terminal || '',       // F: Точка (шаг 6)
          data.cash || 0,            // G: Наличные (шаг 7)
          data.cashless || 0,        // H: Безналичные (шаг 8)
          data.credit || 0,          // I: Кредит (шаг 9)
          data.encashment || 0,      // J: Инкассация (шаг 10)
          data.totalRevenue || 0,    // K: Итого
          data.receiptUrl || '',     // L: Чек (шаг 11)
          '',                        // M: Комментарий
          data.transactionId || ''   // N: ID транзакции
        ];
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: config.google.spreadsheetId,
          range: 'Продажи_Заголовки!A:N',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: [row] }
        });
        console.log('✅ Запись добавлена в Google Sheets:', data.transactionId);
      } catch (error) {
        console.error('Ошибка записи в Google Sheets:', error.message);
        return false;
      }
    }

    return true;
  }

  // === Запись строки продажи во вкладку "Продажи_Заголовки" ===
  async appendSaleRow(data) {
    await dataService.appendSaleRow(data);
  }

  // === Запись товаров во вкладку "Продажи_Товары" ===
  async appendItems(transactionId, items, meta = {}) {
    try {
      await dataService.appendItems(transactionId, items, meta);
    } catch (error) {
      console.error('Ошибка записи товаров в Excel:', error.message);
    }

    // Google Sheets
    if (this.enabled) {
      try {
        const config = getConfig();
        // Префикс "'" принудительно заставляет Google Sheets хранить как текст (без конвертации в serial number)
        const ts = meta.timestamp ? `'${meta.timestamp}` : '';
        const rows = items.map(item => [
          `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,  // A: ID записи
          transactionId,                                               // B: ID транзакции
          ts,                                                          // C: Дата и время (текст)
          meta.manager || '',                                          // D: Менеджер
          item.productName || '',                                      // E: Название товара
          item.quantity || '',                                         // F: Количество
          item.unitPrice || '',                                        // G: Цена за единицу
          item.lineTotal || (item.quantity * item.unitPrice) || '',    // H: Сумма позиции
          item.comment || ''                                           // I: Комментарий
        ]);
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: config.google.spreadsheetId,
          range: 'Продажи_Товары!A:I',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          resource: { values: rows }
        });
        console.log('✅ Товары добавлены в Google Sheets:', rows.length, 'позиций');
      } catch (error) {
        console.error('Ошибка записи товаров в Google Sheets:', error.message);
      }
    }
  }

  async updateReceiptUrl(transactionId, receiptUrl) {
    if (!this.enabled || !transactionId || !receiptUrl) return false;

    try {
      const values = await this.readSheet('Продажи_Заголовки!N:N');
      const rowIdx = values.findIndex(r => r[0] === transactionId);

      if (rowIdx <= 0) return false;

      const config = getConfig();
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: config.google.spreadsheetId,
        range: `Продажи_Заголовки!L${rowIdx + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[receiptUrl]] }
      });

      return true;
    } catch (error) {
      console.error('Ошибка обновления ссылки чека:', error.message);
      return false;
    }
  }

  autoFitColumns(worksheet) {
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const len = cell.value ? cell.value.toString().length : 0;
        if (len > maxLength) maxLength = len;
      });
      column.width = Math.max(maxLength + 2, 10);
    });
  }

  // === Очистка и перезапись заголовков вкладки "Продажи_Товары" ===
  async resetItemsHeaders() {
    if (!this.enabled) {
      console.log('⚠️ Google Sheets не подключен, пропуск resetItemsHeaders');
      return;
    }
    try {
      const config = getConfig();
      // Очищаем вкладку
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: config.google.spreadsheetId,
        range: 'Продажи_Товары!A:Z'
      });
      // Записываем правильные заголовки (11 колонок)
      const headers = [
        'ID записи', 'ID транзакции', 'Дата и время', 'Менеджер',
        'Название товара', 'Количество', 'Цена за единицу',
        'Сумма позиции', 'Комментарий'
      ];
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: config.google.spreadsheetId,
        range: 'Продажи_Товары!A1:I1',
        valueInputOption: 'USER_ENTERED',
        resource: { values: [headers] }
      });
      console.log('✅ Заголовки "Продажи_Товары" обновлены (11 колонок)');
    } catch (error) {
      console.error('Ошибка resetItemsHeaders:', error.message);
    }
  }

  async readSheet(range) {
    const config = getConfig();
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: config.google.spreadsheetId,
      range
    });
    return response.data.values || [];
  }

  defaultCities() {
    return ['Москва', 'Санкт-Петербург', 'Казань', 'Новосибирск', 'Екатеринбург'];
  }

  defaultChannels() {
    return ['Выставки', 'Санатории'];
  }
}

module.exports = new GoogleSheetsService();