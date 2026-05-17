'use strict';

/**
 * IBotAdapter — базовый контракт платформенного адаптера.
 *
 * Важно: контроллеры и бизнес-логика не должны импортировать Telegram/VK SDK.
 * Любая платформа обязана нормализовать входящие события в UnifiedContext
 * и предоставить единый набор методов отправки/редактирования/удаления сообщений.
 */
class IBotAdapter {
  async launch() {
    throw new Error('IBotAdapter.launch() is not implemented');
  }

  normalize(_rawUpdate) {
    throw new Error('IBotAdapter.normalize() is not implemented');
  }

  async sendMessage(_rawUserId, _text, _keyboard) {
    throw new Error('IBotAdapter.sendMessage() is not implemented');
  }

  async editMessage(_rawUserId, _messageId, _text, _keyboard) {
    throw new Error('IBotAdapter.editMessage() is not implemented');
  }

  async deleteMessage(_rawUserId, _messageId) {
    throw new Error('IBotAdapter.deleteMessage() is not implemented');
  }

  async getPhotoStream(_photoData) {
    throw new Error('IBotAdapter.getPhotoStream() is not implemented');
  }
}

module.exports = IBotAdapter;