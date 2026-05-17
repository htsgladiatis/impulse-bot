'use strict';

/**
 * Lightweight logger placeholder.
 * Phase 0 keeps zero new runtime dependencies. Later this can be replaced by winston.
 */
function format(level, args) {
  const ts = new Date().toISOString();
  return [`[${ts}] [${level}]`, ...args];
}

module.exports = {
  debug: (...args) => console.debug(...format('debug', args)),
  info: (...args) => console.log(...format('info', args)),
  warn: (...args) => console.warn(...format('warn', args)),
  error: (...args) => console.error(...format('error', args)),
};