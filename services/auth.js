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
  const config = getConfig();
  const adminIds = config.adminIds || [];

  if (adminIds.length === 0) {
    return { allowed: true, isAdmin: false, reason: 'no_admin_ids_configured' };
  }

  const normalized = normalizeUserId(userId);
  const rawId = String(userId || '').trim();

  const isAdmin = adminIds.some(id => {
    const nid = normalizeUserId(id);
    return nid === normalized || String(id).trim() === rawId;
  });

  return { allowed: true, isAdmin, reason: isAdmin ? 'admin' : 'user' };
}

module.exports = { normalizeUserId, checkAuth };
