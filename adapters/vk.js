'use strict';

const IBotAdapter = require('./IBotAdapter');

function getVKIO() {
  return require('vk-io');
}

function getFetch() {
  return require('node-fetch');
}

// ── VK Request Queue (rate limit: max 3 req/sec per token) ──
class VKRequestQueue {
  constructor(delayMs = 334) {
    this.queue = [];
    this.isProcessing = false;
    this.delayMs = delayMs;
    this.retryDelays = { 911: 3000, 6: 5000, 9: 60000 };
  }

  add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.isProcessing) this._process();
    });
  }

  async _process() {
    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      await this._executeWithRetry(task);
      if (this.queue.length > 0) await this._sleep(this.delayMs);
    }
    this.isProcessing = false;
  }

  async _executeWithRetry(task, attempt = 0) {
    try {
      const result = await task.fn();
      task.resolve(result);
    } catch (err) {
      const code = err?.code || err?.error_code || 0;
      const retryable = [911, 901, 914, 6, 9, 10, 1].includes(code);
      if (retryable && attempt < 5) {
        const base = this.retryDelays[code] || 1000;
        const delay = Math.min(base * Math.pow(2, attempt), 30000);
        console.warn(`[VKQueue] Error ${code}, retry ${attempt + 1}/5 in ${delay}ms`);
        await this._sleep(delay);
        return this._executeWithRetry(task, attempt + 1);
      }
      task.reject(err);
    }
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

function normalizeVKPayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  return JSON.stringify(payload);
}

function buildVKKeyboard(options) {
  if (!options || !Array.isArray(options.buttons)) return undefined;

  const { Keyboard } = getVKIO();
  const kb = Keyboard.builder();

  // VK: always use inline keyboards (callback-based interaction)
  // Non-inline keyboards send text messages which break multi-step flows
  kb.inline();

  options.buttons.forEach((row, rowIdx) => {
    row.forEach((btn) => {
      if (btn.url) {
        kb.textButton({
          label: btn.text,
          payload: { action: 'open_link', link: btn.url },
          color: Keyboard.SECONDARY_COLOR,
        });
      } else {
        kb.textButton({
          label: btn.text,
          payload: btn.payload,
          color: btn.color || Keyboard.PRIMARY_COLOR,
        });
      }
    });
    if (rowIdx < options.buttons.length - 1) kb.row();
  });

  return kb;
}

function buildVKKeyboardJSON(options) {
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
          payload: typeof btn.payload === 'string' ? btn.payload : JSON.stringify(btn.payload),
        },
        color: btn.color || 'primary',
      };
    })
  );

  return {
    one_time: false,
    inline: true,
    buttons,
  };
}

class VKAdapter extends IBotAdapter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.token = options.token || process.env.VK_GROUP_TOKEN;
    this.controller = options.controller || null;
    this.sessionManager = options.sessionManager || null;
    this.vk = options.vk || null;
    this._queue = new VKRequestQueue(334);
  }

  async launch() {
    if (!this.vk) {
      if (!this.token) throw new Error('VKAdapter requires VK_GROUP_TOKEN');
      const { VK } = getVKIO();
      this.vk = new VK({ token: this.token, apiMode: 'parallel' });
    }

    const { updates } = this.vk;

    updates.on('message_new', this._safe('message_new', async (ctx) => {
      const unified = this._normalizeMessage(ctx);
      await this._dispatch(unified);
    }));

    updates.on('message_event', this._safe('message_event', async (ctx) => {
      if (typeof ctx.answer === 'function') {
        await ctx.answer({ type: 'show_snackbar', text: '...' }).catch(() => {});
      }
      const unified = this._normalizeCallback(ctx);
      await this._dispatch(unified);
    }));

    await updates.startPolling();
    console.log('[VKAdapter] VK Long Poll started.');
  }

  normalize(rawUpdate) {
    if (rawUpdate && (rawUpdate.eventPayload || rawUpdate.eventType || rawUpdate.userId)) {
      return this._normalizeCallback(rawUpdate);
    }
    return this._normalizeMessage(rawUpdate);
  }

  _safe(name, handler) {
    return async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`[VKAdapter] ${name} error:`, error && error.stack ? error.stack : error);
      }
    };
  }

  async _dispatch(ctx) {
    if (!this.controller || !this.sessionManager) return;
    const session = this.sessionManager.getOrCreate(ctx.userId, 'vk');
    await this.controller.handle(ctx, session);
    this.sessionManager.save(ctx.userId, session);
  }

  _normalizeMessage(ctx) {
    const message = ctx.message || ctx;
    const rawUserId = String(Math.abs(Number(message.fromId ?? message.from_id ?? message.peerId ?? message.peer_id)));
    const messageId = message.id ?? message.conversationMessageId ?? message.message_id ?? 0;
    const photo = this._extractPhoto(message);

    return this._buildContext({
      rawUserId,
      userId: `vk_${rawUserId}`,
      text: message.text ? String(message.text).trim() : null,
      payload: null,
      photo,
      messageId,
    });
  }

  _normalizeCallback(ctx) {
    const rawUserId = String(Math.abs(Number(ctx.userId ?? ctx.user_id ?? ctx.peerId ?? ctx.peer_id)));
    const messageId = ctx.messageId ?? ctx.message_id ?? ctx.conversationMessageId ?? 0;

    return this._buildContext({
      rawUserId,
      userId: `vk_${rawUserId}`,
      text: null,
      payload: normalizeVKPayload(ctx.eventPayload ?? ctx.payload),
      photo: null,
      messageId,
    });
  }

  _extractPhoto(message) {
    const attachments = message.attachments || [];
    const photo = attachments.find(a => a.type === 'photo' || a.constructor?.name === 'PhotoAttachment');
    if (!photo) return null;

    return {
      url: photo.largeSizeUrl || photo.mediumSizeUrl || photo.url,
      fileId: `vk_${photo.ownerId || photo.owner_id}_${photo.id}`,
      mimeType: 'image/jpeg',
    };
  }

  _buildContext({ rawUserId, userId, text, payload, photo, messageId }) {
    return {
      platform: 'vk',
      userId,
      rawUserId,
      text,
      payload,
      photo,
      messageId,
      reply: async (messageText, keyboard) => this.sendMessage(rawUserId, messageText, keyboard),
      editMessage: async (msgId, messageText, keyboard) => this.editMessage(rawUserId, msgId, messageText, keyboard),
      deleteMessage: async (msgId) => this.deleteMessage(rawUserId, msgId),
      replaceMessage: async (messageText, keyboard) => this.sendMessage(rawUserId, messageText, keyboard),
      getPhotoStream: async () => this.getPhotoStream(photo),
    };
  }

  async sendMessage(rawUserId, text, keyboard) {
    const params = {
      user_id: Number(rawUserId),
      message: text,
      random_id: Math.floor(Math.random() * 2147483647),
    };
    if (keyboard && keyboard.buttons) {
      const vkKeyboard = buildVKKeyboardJSON(keyboard);
      if (vkKeyboard) {
        params.keyboard = JSON.stringify(vkKeyboard);
      }
    }
    try {
      return await this._queue.add(() => this.vk.api.messages.send(params));
    } catch (err) {
      const code = err.code || err.error_code || 0;
      // 901 = invalid keyboard JSON, 902 = can't send to user
      if (code === 901 && params.keyboard) {
        console.warn('[VKAdapter] Keyboard rejected (code 901), sending without keyboard');
        delete params.keyboard;
        params.random_id = Math.floor(Math.random() * 2147483647);
        return this._queue.add(() => this.vk.api.messages.send(params));
      }
      throw err;
    }
  }

  async editMessage(rawUserId, messageId, text, keyboard) {
    const params = {
      peer_id: Number(rawUserId),
      message_id: Number(messageId),
      message: text,
    };
    if (keyboard && keyboard.buttons) {
      const vkKeyboard = buildVKKeyboardJSON(keyboard);
      if (vkKeyboard) {
        params.keyboard = JSON.stringify(vkKeyboard);
      }
    }
    try {
      await this._queue.add(() => this.vk.api.messages.edit(params));
    } catch (err) {
      const code = err.code || err.error_code || 0;
      if (code === 901 && params.keyboard) {
        console.warn('[VKAdapter] Keyboard rejected in edit (code 901), retrying without keyboard');
        delete params.keyboard;
        await this._queue.add(() => this.vk.api.messages.edit(params));
      } else {
        throw err;
      }
    }
  }

  async deleteMessage(_rawUserId, messageId) {
    await this._queue.add(() => this.vk.api.messages.delete({
      message_ids: Number(messageId),
      delete_for_all: 1,
    }));
  }

  async getPhotoStream(photoData) {
    if (!photoData || !photoData.url) throw new Error('VK photoData.url is required');
    const fetch = getFetch();
    const response = await fetch(photoData.url);
    if (!response.ok) throw new Error(`VK photo fetch failed: HTTP ${response.status}`);
    return response.body;
  }
}

module.exports = VKAdapter;
module.exports.buildVKKeyboard = buildVKKeyboard;
module.exports.buildVKKeyboardJSON = buildVKKeyboardJSON;