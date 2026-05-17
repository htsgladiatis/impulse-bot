const fs = require('fs');
const path = '/opt/impulse-bot/adapters/vk.js';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  /async sendMessage\(rawUserId, text, keyboard\) \{[\s\S]*?return await this\.vk\.api\.messages\.send\(params\);\s*\}/m,
  `async sendMessage(rawUserId, text, keyboard) {
    const { getRandomId } = getVKIO();
    const params = {
      user_id: rawUserId,
      message: text,
      random_id: getRandomId(),
    };
    const vkKeyboard = buildVKKeyboard(keyboard);
    if (vkKeyboard) params.keyboard = vkKeyboard;
    return await this.vk.api.messages.send(params);
  }`
);

fs.writeFileSync(path, c, 'utf8');
console.log('PATCHED OK');