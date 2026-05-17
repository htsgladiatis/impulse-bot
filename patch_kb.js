const fs = require('fs');
const p = '/opt/impulse-bot/adapters/vk.js';
let c = fs.readFileSync(p, 'utf8');
const marker = 'function buildVKKeyboardJSON(options) {';
const startIdx = c.indexOf(marker);
if (startIdx === -1) { console.log('NOT FOUND'); process.exit(1); }
let depth = 0, endIdx = -1;
for (let i = startIdx; i < c.length; i++) {
  if (c[i] === '{') depth++;
  if (c[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
}
const nf = `function buildVKKeyboardJSON(options) {
  if (!options || !Array.isArray(options.buttons)) return undefined;

  const buttons = options.buttons.map(row =>
    row.map(btn => {
      if (btn.url) {
        return {
          action: { type: 'open_link', link: btn.url, label: btn.text },
          color: 'secondary',
        };
      }
      return {
        action: {
          type: 'text',
          label: btn.text,
          payload: JSON.stringify({ action: btn.payload }),
        },
        color: btn.color || 'primary',
      };
    })
  );

  return {
    one_time: !!options.oneTime,
    inline: !!options.inline,
    buttons,
  };
}`;
c = c.substring(0, startIdx) + nf + c.substring(endIdx);
fs.writeFileSync(p, c);
console.log('PATCHED OK');