'use strict';

/**
 * Скрипт для исправления структуры колонок в Google Sheets
 * Перемещает колонку "Командировочная надбавка" ПОСЛЕ "Фото чека"
 */

const { google } = require('googleapis');
const config = require('../config');

async function fixColumns() {
  try {
    console.log('🔧 Исправление структуры таблицы Google Sheets...\n');

    // Авторизация
    let auth;
    if (config.google.credentials) {
      auth = new google.auth.GoogleAuth({
        credentials: config.google.credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else {
      auth = new google.auth.GoogleAuth({
        keyFile: config.google.keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    }

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const spreadsheetId = config.google.spreadsheetId;

    // Шаг 1: Читаем все данные из вкладки "Продажи_Заголовки"
    console.log('📖 Чтение текущих данных...');
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Продажи_Заголовки!A:O'
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      console.log('⚠️ Таблица пуста');
      return;
    }

    console.log(`✅ Прочитано строк: ${rows.length}\n`);

    // Шаг 2: Создаем новую структуру с правильными заголовками
    const newHeaders = [
      'Дата и время',              // A
      'Номер терминала',           // B
      'Менеджер',                  // C
      'Канал продаж',              // D
      'Город',                     // E
      'Точка (название)',          // F
      'Наличные (за день)',        // G
      'Безналичные (за день)',     // H
      'Кредит/Рассрочка',          // I
      'Инкассация',                // J
      'Итого выручка',             // K
      'Фото чека',                 // L
      'Командировочная надбавка',  // M ← ПОСЛЕ фото чека!
      'Комментарий',               // N
      'ID транзакции'              // O
    ];

    // Шаг 3: Перестраиваем данные
    const newRows = rows.map((row, index) => {
      if (index === 0) {
        // Заголовок - используем правильный
        return newHeaders;
      }

      const len = row.length;
      if (len <= 14) {
        // === СТАРЫЙ ФОРМАТ (14 колонок, до добавления Командировочной) ===
        // A-J совпадают, K=Итого, L=Фото, M=Коммент, N=ID
        return [
          row[0] || '',   // A: Дата и время
          row[1] || '',   // B: Номер терминала
          row[2] || '',   // C: Менеджер
          row[3] || '',   // D: Канал продаж
          row[4] || '',   // E: Город
          row[5] || '',   // F: Точка
          row[6] || '',   // G: Наличные
          row[7] || '',   // H: Безналичные
          row[8] || '',   // I: Кредит/Рассрочка
          row[9] || '',   // J: Инкассация
          row[10] || '0', // K: Итого выручка
          row[11] || '',  // L: Фото чека
          '0',            // M: Командировочная (по умолчанию 0 для старых записей)
          row[12] || '',  // N: Комментарий
          row[13] || ''   // O: ID транзакции
        ];
      } else {
        // === НОВЫЙ ФОРМАТ (15 колонок, Командировочная была в K, перед Итого) ===
        // A-J совпадают, K=Командировочная, L=Итого, M=Фото, N=Коммент, O=ID
        return [
          row[0] || '',   // A: Дата и время
          row[1] || '',   // B: Номер терминала
          row[2] || '',   // C: Менеджер
          row[3] || '',   // D: Канал продаж
          row[4] || '',   // E: Город
          row[5] || '',   // F: Точка
          row[6] || '',   // G: Наличные
          row[7] || '',   // H: Безналичные
          row[8] || '',   // I: Кредит/Рассрочка
          row[9] || '',   // J: Инкассация
          row[11] || '0', // K: Итого выручка (было L)
          row[12] || '',  // L: Фото чека (было M)
          row[10] || '0', // M: Командировочная (было K)
          row[13] || '',  // N: Комментарий
          row[14] || ''   // O: ID транзакции
        ];
      }
    });

    // Шаг 4: Очищаем таблицу
    console.log('🧹 Очистка таблицы...');
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Продажи_Заголовки!A:O'
    });

    // Шаг 5: Записываем исправленные данные
    console.log('✍️ Запись исправленных данных...');
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Продажи_Заголовки!A1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: newRows
      }
    });

    console.log('\n✅ Таблица успешно исправлена!');
    console.log(`📊 Обновлено строк: ${newRows.length}`);
    console.log('\nНовая структура колонок:');
    newHeaders.forEach((header, i) => {
      const col = String.fromCharCode(65 + i); // A, B, C, ...
      console.log(`  ${col}: ${header}`);
    });

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.response) {
      console.error('Детали:', error.response.data);
    }
    process.exit(1);
  }
}

// Запуск
fixColumns();
