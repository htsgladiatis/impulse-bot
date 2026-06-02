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

    // ----- Add city: step 1 (name input) -----
    if (session._adminStep === 'admin_add_city_name' && text && !text.startsWith('/')) {
      session._adminCityName = text.trim();
      session._adminStep = 'admin_add_city_type';
      await ctx.reply(
        `➕ Город: «${session._adminCityName}»\n\nВыберите тип:`,
        {
          buttons: [
            [{ text: '🏛 Выставка', payload: 'adm_type|city|exhibition' }, { text: '🏥 Санаторий', payload: 'adm_type|city|sanatorium' }],
            [{ text: '↩️ Отмена', payload: 'adm|cities' }]
          ]
        }
      );
      return true;
    }

    // ----- Add terminal: step 1 (name input) -----
    if (session._adminStep === 'admin_add_terminal_name' && text && !text.startsWith('/')) {
      session._adminTerminalName = text.trim();
      session._adminStep = 'admin_add_terminal_city';
      const data = await ref.getRef();
      const cities = ref.getCitiesList();
      if (cities.length === 0) {
        await ctx.reply('❌ Сначала добавьте хотя бы один город.');
        session._adminStep = null;
        session._adminTerminalName = null;
        await this._showRefSection(ctx, 'terminals');
        return true;
      }
      const cityButtons = cities.map(c => [{ text: c, payload: `adm_city|terminal|${c}` }]);
      cityButtons.push([{ text: '↩️ Отмена', payload: 'adm|terminals' }]);
      await ctx.reply(
        `➕ Точка: «${session._adminTerminalName}»\n\nВыберите город:`,
        { buttons: cityButtons }
      );
      return true;
    }

    // ----- Legacy add for string-based refs (channels, managers, products) -----
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

    // ----- Add buttons -----
    if (payload.startsWith('adm_add|')) {
      const key = payload.split('|')[1];
      if (key === 'cities') {
        session._adminStep = 'admin_add_city_name';
        await ctx.reply(`➕ Введите название нового города:`);
        return true;
      }
      if (key === 'terminals') {
        session._adminStep = 'admin_add_terminal_name';
        await ctx.reply(`➕ Введите название новой точки:`);
        return true;
      }
      session._adminStep = 'admin_add';
      session._adminTarget = key;
      await ctx.reply(`➕ Введите новое значение для «${ref.LABELS[key]}»:`);
      return true;
    }

    // ----- City type selection -----
    if (payload.startsWith('adm_type|city|')) {
      const type = payload.split('|')[2];
      const name = session._adminCityName;
      if (!name) {
        await ctx.reply('❌ Ошибка: название города не найдено. Начните заново.');
        session._adminStep = null;
        session._adminCityName = null;
        await this._showRefSection(ctx, 'cities');
        return true;
      }
      const added = ref.addCity(name, type);
      if (added) {
        await ref.save(await ref.getRef());
        await ctx.reply(`✅ Добавлен город: ${name} (${ref.TYPE_LABELS[type]})`);
      } else {
        await ctx.reply(`⚠️ Город «${name}» уже есть в списке.`);
      }
      session._adminStep = null;
      session._adminCityName = null;
      await this._showRefSection(ctx, 'cities');
      return true;
    }

    // ----- Terminal city selection -----
    if (payload.startsWith('adm_city|terminal|')) {
      const city = payload.split('|')[2];
      session._adminTerminalCity = city;
      session._adminStep = 'admin_add_terminal_type';
      await ctx.reply(
        `➕ Точка: «${session._adminTerminalName}»\nГород: ${city}\n\nВыберите тип:`,
        {
          buttons: [
            [{ text: '🏛 Выставка', payload: 'adm_type|terminal|exhibition' }, { text: '🏥 Санаторий', payload: 'adm_type|terminal|sanatorium' }],
            [{ text: '↩️ Отмена', payload: 'adm|terminals' }]
          ]
        }
      );
      return true;
    }

    // ----- Terminal type selection -----
    if (payload.startsWith('adm_type|terminal|')) {
      const type = payload.split('|')[2];
      const name = session._adminTerminalName;
      const city = session._adminTerminalCity;
      if (!name || !city) {
        await ctx.reply('❌ Ошибка: данные точки не найдены. Начните заново.');
        session._adminStep = null;
        session._adminTerminalName = null;
        session._adminTerminalCity = null;
        await this._showRefSection(ctx, 'terminals');
        return true;
      }
      const added = ref.addTerminal(name, city, type);
      if (added) {
        await ref.save(await ref.getRef());
        await ctx.reply(`✅ Добавлена точка: ${name} — ${city} (${ref.TYPE_LABELS[type]})`);
      } else {
        await ctx.reply(`⚠️ Точка «${name}» уже есть в списке.`);
      }
      session._adminStep = null;
      session._adminTerminalName = null;
      session._adminTerminalCity = null;
      await this._showRefSection(ctx, 'terminals');
      return true;
    }

    // ----- Delete item -----
    if (payload.startsWith('adm_delitem|')) {
      const parts = payload.split('|');
      const key = parts[1];
      const idx = parseInt(parts[2]);
      const data = await ref.getRef();
      const items = data[key] || [];
      if (idx < 0 || idx >= items.length) {
        await ctx.reply('❌ Элемент не найден.');
        await this._showRefSection(ctx, key);
        return true;
      }

      if (key === 'cities') {
        const cityName = items[idx].name;
        ref.removeCity(cityName);
        await ref.save(await ref.getRef());
        await ctx.reply(`✅ Удалён город: ${cityName}`);
      } else if (key === 'terminals') {
        const terminalName = items[idx].name;
        ref.removeTerminal(terminalName);
        await ref.save(await ref.getRef());
        await ctx.reply(`✅ Удалена точка: ${terminalName}`);
      } else {
        const removed = items[idx];
        ref.arrayRemove(data[key], removed);
        await ref.save(data);
        await ctx.reply(`✅ Удалено из «${ref.LABELS[key]}»: ${removed}`);
      }
      await this._showRefSection(ctx, key);
      return true;
    }

    if (payload.startsWith('adm_del|')) {
      const key = payload.split('|')[1];
      const data = await ref.getRef();
      const items = data[key] || [];
      if (items.length === 0) { await ctx.reply('❌ Список пуст. Удалять нечего.'); return true; }
      const buttons = items.map((item, idx) => {
        const label = this._formatItemLabel(key, item);
        return [{ text: `🗑 ${label}`, payload: `adm_delitem|${key}|${idx}` }];
      });
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

  _formatItemLabel(key, item) {
    if (key === 'cities') {
      const typeLabel = ref.TYPE_LABELS[item.type] || item.type;
      return `${item.name} (${typeLabel})`;
    }
    if (key === 'terminals') {
      const typeLabel = ref.TYPE_LABELS[item.type] || item.type;
      return `${item.name} — ${item.city} (${typeLabel})`;
    }
    return item;
  }

  async _showRefSection(ctx, key) {
    const data = await ref.getRef();
    const items = data[key] || [];
    const label = ref.LABELS[key];
    const list = items.map((item, i) => `${i + 1}. ${this._formatItemLabel(key, item)}`).join('\n') || '(пусто)';
    await ctx.reply(`📋 ${label}\n━━━━━━━━━━━━━━━━━━━━\n${list}`, {
      buttons: [[{ text: '➕ Добавить', payload: `adm_add|${key}` }, { text: '🗑 Удалить', payload: `adm_del|${key}` }], [{ text: '↩️ Назад', payload: 'adm|menu' }]]
    });
  }
}

module.exports = new AdminController();
