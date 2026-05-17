'use strict';

const ref = require('../services/refDictionary');

class AdminController {
  async handle(ctx, session) {
    const { text, payload } = ctx;

    if (text === '/admin') {
      session._adminMode = true;
      await ctx.reply(
        `⚙️ ПАНЕЛЬ АДМИНИСТРАТОРА\n━━━━━━━━━━━━━━━━━━━━\nВыберите раздел для редактирования:\n\nДля выхода: /exit`,
        {
          buttons: [
            [{ text: '🏙️ Города', payload: 'adm|cities' }, { text: '📍 Точки', payload: 'adm|terminals' }],
            [{ text: '👤 Менеджеры', payload: 'adm|managers' }, { text: '📊 Каналы', payload: 'adm|channels' }],
            [{ text: '📦 Товары', payload: 'adm|products' }]
          ]
        }
      );
      return true;
    }

    if (text === '/exit') {
      if (session._adminMode) {
        session._adminMode = false;
        session.step = 'IDLE';
        await ctx.reply('✅ Вы вышли из режима администратора.');
      }
      return true;
    }

    if (!session._adminMode) return false;

    if (session._adminStep === 'admin_add' && text && !text.startsWith('/')) {
      const key = session._adminTarget;
      const data = await ref.getRef();
      const added = ref.arrayAdd(data[key], text);
      if (added) {
        await ref.save(data);
        await ctx.reply(`✅ Добавлено в «${ref.LABELS[key]}»: ${text}`);
      } else {
        await ctx.reply(`⚠️ «${text}» уже есть в списке.`);
      }
      session._adminStep = null;
      session._adminTarget = null;
      await this._showRefSection(ctx, key);
      return true;
    }

    if (payload) return await this._handlePayload(ctx, session, payload);
    return true;
  }

  async _handlePayload(ctx, session, payload) {
    if (payload === 'adm|menu') {
      await ctx.reply(`⚙️ ПАНЕЛЬ АДМИНИСТРАТОРА\n━━━━━━━━━━━━━━━━━━━━\nВыберите раздел для редактирования:\n\nДля выхода: /exit`, {
        buttons: [[{ text: '🏙️ Города', payload: 'adm|cities' }, { text: '📍 Точки', payload: 'adm|terminals' }], [{ text: '👤 Менеджеры', payload: 'adm|managers' }, { text: '📊 Каналы', payload: 'adm|channels' }], [{ text: '📦 Товары', payload: 'adm|products' }]]
      });
      return true;
    }

    if (payload.startsWith('adm_add|')) {
      const key = payload.split('|')[1];
      session._adminStep = 'admin_add';
      session._adminTarget = key;
      await ctx.reply(`➕ Введите новое значение для «${ref.LABELS[key]}»:`);
      return true;
    }

    if (payload.startsWith('adm_delitem|')) {
      const parts = payload.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      const data = await ref.getRef();
      const removed = data[key][idx];
      ref.arrayRemove(data[key], removed);
      await ref.save(data);
      await ctx.reply(`✅ Удалено из «${ref.LABELS[key]}»: ${removed}`);
      await this._showRefSection(ctx, key);
      return true;
    }

    if (payload.startsWith('adm_del|')) {
      const key = payload.split('|')[1];
      const data = await ref.getRef();
      const items = data[key] || [];
      if (items.length === 0) { await ctx.reply('❌ Список пуст. Удалять нечего.'); return true; }
      const buttons = items.map((item, idx) => [{ text: `🗑 ${item}`, payload: `adm_delitem|${key}|${idx}` }]);
      buttons.push([{ text: '↩️ Назад', payload: `adm|${key}` }]);
      await ctx.reply(`🗑 Выберите что удалить из «${ref.LABELS[key]}»:`, { buttons });
      return true;
    }

    if (payload.startsWith('adm|')) {
      const key = payload.split('|')[1];
      await this._showRefSection(ctx, key);
      return true;
    }

    return false;
  }

  async _showRefSection(ctx, key) {
    const data = await ref.getRef();
    const items = data[key] || [];
    const label = ref.LABELS[key];
    const list = items.map((item, i) => `${i + 1}. ${item}`).join('\n') || '(пусто)';
    await ctx.reply(`📋 ${label}\n━━━━━━━━━━━━━━━━━━━━\n${list}`, {
      buttons: [[{ text: '➕ Добавить', payload: `adm_add|${key}` }, { text: '🗑 Удалить', payload: `adm_del|${key}` }], [{ text: '↩️ Назад', payload: 'adm|menu' }]]
    });
  }
}

module.exports = new AdminController();