from pathlib import Path

p = Path('/opt/impulse-bot/sheets.js')
s = p.read_text(encoding='utf-8')

start = s.index('  async isAuthorized(telegramId) {')
end = s.index('\n  async appendSale(data) {', start)

replacement = """  async isAuthorized(telegramId) {
    // Whitelist disabled: all users are allowed.
    return true;
  }
"""

p.write_text(s[:start] + replacement + s[end:], encoding='utf-8')
print('sheets.js patched: isAuthorized always returns true')