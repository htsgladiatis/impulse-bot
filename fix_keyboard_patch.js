const fs = require('fs');
const path = '/opt/impulse-bot/adapters/vk.js';
let code = fs.readFileSync(path, 'utf8');

const oldFn = 'function buildVKKeyboardJSON(options) {\n  const keyboard = buildVKKeyboard(options);\n  return keyboard ? JSON.parse(JSON.stringify(keyboard)) : undefined;\n}';

const newFn = 'function buildVKKeyboardJSON(options) {\n  const keyboard = buildVKKeyboard(options);\n  if (!keyboard) return undefined;\n\n  const raw = JSON.parse(JSON.stringify(keyboard));\n  const allRows = raw.rows || [];\n  if (raw.currentRow && raw.currentRow.length > 0) {\n    allRows.push(raw.currentRow);\n  }\n\n  return {\n    one_time: !!raw.isOneTime,\n    inline: !!raw.isInline,\n    buttons: allRows,\n  };\n}';

if (code.includes(oldFn)) {
  code = code.replace(oldFn, newFn);
  fs.writeFileSync(path, code);
  console.log('PATCHED OK');
} else {
  console.log('OLD FUNCTION NOT FOUND - trying partial match');
  const regex = /function buildVKKeyboardJSON\(options\) \{[\s\S]*?return keyboard \? JSON\.parse\(JSON\.stringify\(keyboard\)\) : undefined;\n\}/;
  if (regex.test(code)) {
    code = code.replace(regex, newFn);
    fs.writeFileSync(path, code);
    console.log('PATCHED OK (regex)');
  } else {
    console.log('FAILED - no match found');
  }
}