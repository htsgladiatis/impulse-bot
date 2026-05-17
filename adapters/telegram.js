'use strict';

const IBotAdapter = require('./IBotAdapter');

function getTelegramBot() {
  return require('node-telegram-bot-api');
}

function getFetch() {
  return require('node-fetch');
}

function buildTelegramKeyboard(options) {
  if (!options || !Array.isArray(options.buttons)) return undefined;

  return {
    inline_keyboard: options.buttons.map(row =>
      row.map(btn => btn.url
        ? { text: btn.text, url: btn.url }
        : { text: btn.text, callback_data: btn.payload }
      )
    )
  };
}

class TelegramAdapter extends IBotAdapter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.token = options.token || process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;
    this.controller = options.controller || null;
    this.sessionManager = options.sessionManager || null;
    this.bot = options.bot || null;
  }

  async launch() {
    if (!this.bot) {
      if (!this.token) throw new Error('TelegramAdapter requires TELEGRAM_BOT_TOKEN or BOT_TOKEN');
      const TelegramBot = getTelegramBot();
      this.bot = new TelegramBot(this.token, { polling: true });
    }

    this.bot.on('message', this._safe('message', async (msg) => {
      if (msg.from && msg.from.is_bot) return;
      const ctx = this._normalizeMessage(msg);
      await this._dispatch(ctx);
    }));

    this.bot.on('callback_query', this._safe('callback_query', async (query) => {
      await this.bot.answerCallbackQuery(query.id).catch(() => {});
      const ctx = this._normalizeCallback(query);
      await this._dispatch(ctx);
    }));

    this.bot.on('polling_error', (error) => {
      console.error('[TelegramAdapter] polling_error:', error.code || '', error.message || error);
    });

    console.log('[TelegramAdapter] Telegram polling started.');
  }

  normalize(rawUpdate) {
    if (rawUpdate && rawUpdate.data && rawUpdate.message) return this._normalizeCallback(rawUpdate);
    return this._normalizeMessage(rawUpdate);
  }

  _safe(name, handler) {
    return async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`[TelegramAdapter] ${name} error:`, error && error.stack ? error.stack : error);
      }
    };
  }

  async _dispatch(ctx) {
    if (!this.controller || !this.sessionManager) return;
    const session = this.sessionManager.getOrCreate(ctx.userId, 'telegram');
    await this.controller.handle(ctx, session);
    this.sessionManager.save(ctx.userId, session);
  }

  _normalizeMessage(msg) {
    const rawUserId = String(msg.from.id);
    const chatId = msg.chat.id;
    const photo = this._extractPhoto(msg);

    return this._buildContext({
      chatId,
      rawUserId,
      userId: `tg_${rawUserId}`,
      text: msg.text ? msg.text.trim() : null,
      payload: null,
      photo,
      messageId: msg.message_id,
    });
  }

  _normalizeCallback(query) {
    const rawUserId = String(query.from.id);
    const chatId = query.message.chat.id;

    return this._buildContext({
      chatId,
      rawUserId,
      userId: `tg_${rawUserId}`,
      text: null,
      payload: query.data || null,
      photo: null,
      messageId: query.message.message_id,
    });
  }

  _extractPhoto(msg) {
    if (!msg.photo || msg.photo.length === 0) return null;
    const largest = msg.photo[msg.photo.length - 1];
    return {
      fileId: largest.file_id,
      mimeType: 'image/jpeg',
      size: largest.file_size,
    };
  }

  _buildContext({ chatId, rawUserId, userId, text, payload, photo, messageId }) {
    return {
      platform: 'telegram',
      userId,
      rawUserId,
      text,
      payload,
      photo,
      messageId,
      reply: async (messageText, keyboard) => this.sendMessage(chatId, messageText, keyboard),
      editMessage: async (msgId, messageText, keyboard) => this.editMessage(chatId, msgId, messageText, keyboard),
      deleteMessage: async (msgId) => this.deleteMessage(chatId, msgId),
      replaceMessage: async (messageText, keyboard) => this.sendMessage(chatId, messageText, keyboard),
      getPhotoStream: async () => this.getPhotoStream(photo),
    };
  }

  async sendMessage(rawUserId, text, keyboard) {
    const opts = {};
    const replyMarkup = buildTelegramKeyboard(keyboard);
    if (replyMarkup) opts.reply_markup = replyMarkup;
    const sent = await this.bot.sendMessage(rawUserId, text, opts);
    return sent.message_id;
  }

  async editMessage(rawUserId, messageId, text, keyboard) {
    const opts = { chat_id: rawUserId, message_id: messageId };
    const replyMarkup = buildTelegramKeyboard(keyboard);
    if (replyMarkup) opts.reply_markup = replyMarkup;
    await this.bot.editMessageText(text, opts);
  }

  async deleteMessage(rawUserId, messageId) {
    await this.bot.deleteMessage(rawUserId, messageId);
  }

  async getPhotoStream(photoData) {
    if (!photoData || !photoData.fileId) throw new Error('Telegram photoData.fileId is required');
    const fileUrl = await this.bot.getFileLink(photoData.fileId);
    const fetch = getFetch();
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Telegram photo fetch failed: HTTP ${response.status}`);
    return response.body;
  }
}

module.exports = TelegramAdapter;
module.exports.buildTelegramKeyboard = buildTelegramKeyboard;