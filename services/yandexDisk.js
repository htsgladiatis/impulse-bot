'use strict';

/**
 * YandexDiskService facade.
 *
 * yandex-disk.js exists on the server. Locally it may be absent, therefore this
 * wrapper resolves it lazily only when a method is actually called.
 */
function legacy() {
  return require('../yandex-disk');
}

async function uploadReceipt(...args) {
  return legacy().uploadReceipt(...args);
}

async function uploadStream() {
  throw new Error('YandexDiskService.uploadStream() is not implemented yet');
}

module.exports = { uploadReceipt, uploadStream };