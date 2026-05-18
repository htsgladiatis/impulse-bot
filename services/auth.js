'use strict';

function getConfig() {
  return require('../config');
}

function normalizeUserId(userId) {
  const value = String(userId || '').trim();
  if (!value) return value;
  if (value.startsWith('tg_') || value.startsWith('vk_')) return value;
  return `tg_${value}`;
}

async function checkAuth(userId) {
  // TODO: Restore ADMIN_IDS whitelist check before production
  return { allowed: true, isAdmin: true, reason: 'auth_disabled' };
}

module.exports = { normalizeUserId, checkAuth };
