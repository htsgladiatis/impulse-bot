'use strict';

const DEFAULT_STEP = 'IDLE';
const TTL_MS = 60 * 60 * 1000; // 1 hour
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const MAX_SESSIONS = 10000;

function createSession(userId, platform) {
  return {
    userId,
    platform,
    step: DEFAULT_STEP,
    payload: {},
    botMessageIds: [],
    isEditMode: false,
    editingField: null,
    lastActivityAt: Date.now(),
  };
}

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this._sweepTimer = setInterval(() => this._sweep(), SWEEP_INTERVAL_MS);
    if (this._sweepTimer.unref) this._sweepTimer.unref();
  }

  _sweep() {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now - session.lastActivityAt > TTL_MS) {
        this.sessions.delete(key);
      }
    }
  }

  getOrCreate(userId, platform) {
    const key = String(userId);
    if (!this.sessions.has(key)) {
      if (this.sessions.size >= MAX_SESSIONS) this._sweep();
      this.sessions.set(key, createSession(key, platform));
    }
    const session = this.sessions.get(key);
    session.lastActivityAt = Date.now();
    return session;
  }

  save(userId, session) {
    const key = String(userId);
    session.lastActivityAt = Date.now();
    this.sessions.set(key, session);
    return session;
  }

  clear(userId) {
    return this.sessions.delete(String(userId));
  }

  clearAll() {
    this.sessions.clear();
  }

  get size() {
    return this.sessions.size;
  }
}

module.exports = new SessionManager();
module.exports.createSession = createSession;
module.exports.DEFAULT_STEP = DEFAULT_STEP;
