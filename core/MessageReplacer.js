'use strict';

/**
 * MessageReplacer hides Telegram/VK message update differences.
 * Controllers should call this facade instead of platform SDK methods.
 */
class MessageReplacer {
  async replace(session, ctx, text, keyboard) {
    const ids = Array.isArray(session.botMessageIds) ? session.botMessageIds : [];
    const deletePromises = ids.map(id => ctx.deleteMessage(id).catch(() => {}));
    await Promise.allSettled(deletePromises);

    session.botMessageIds = [];
    const newMsgId = await ctx.reply(text, keyboard);
    session.botMessageIds.push(newMsgId);
    return newMsgId;
  }

  async smartEdit(session, ctx, text, keyboard) {
    const ids = Array.isArray(session.botMessageIds) ? session.botMessageIds : [];
    const lastId = ids[ids.length - 1];
    if (lastId) {
      try {
        await ctx.editMessage(lastId, text, keyboard);
        return lastId;
      } catch (_) {
        // fall back to delete + resend
      }
    }
    return this.replace(session, ctx, text, keyboard);
  }
}

module.exports = new MessageReplacer();