const fs = require('fs');
const path = require('path');

process.env.SPREADSHEET_ID = '17Sw8CIV1CUlmbSkdyKH4Kc7s8Bk7uJGhTIXOxd9AzUk';
process.env.GOOGLE_CREDENTIALS_JSON = fs.readFileSync(
  path.join(__dirname, '..', 'credentials.json'),
  'utf-8'
);

require('./fix_google_sheets_columns.js');
