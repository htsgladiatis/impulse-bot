'use strict';

/**
 * UnifiedContext is a documentation/runtime helper for the normalized adapter output.
 *
 * Shape:
 * {
 *   platform: 'telegram' | 'vk',
 *   userId: 'tg_123' | 'vk_456',
 *   rawUserId: '123',
 *   text: string | null,
 *   payload: string | null,
 *   photo: PhotoData | null,
 *   messageId: number,
 *   reply(text, keyboard?) => Promise<number>,
 *   editMessage(messageId, text, keyboard?) => Promise<void>,
 *   deleteMessage(messageId) => Promise<void>,
 *   replaceMessage(text, keyboard?) => Promise<number>,
 *   getPhotoStream() => Promise<Readable>
 * }
 */
function assertUnifiedContext(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('UnifiedContext must be an object');
  if (!['telegram', 'vk'].includes(ctx.platform)) throw new Error('UnifiedContext.platform is invalid');
  if (!ctx.userId || typeof ctx.userId !== 'string') throw new Error('UnifiedContext.userId is required');
  if (typeof ctx.reply !== 'function') throw new Error('UnifiedContext.reply is required');
  return true;
}

module.exports = { assertUnifiedContext };