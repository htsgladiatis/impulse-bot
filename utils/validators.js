'use strict';

function isNumberLike(value) {
  return value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
}

function toNumber(value, fallback = 0) {
  return isNumberLike(value) ? Number(value) : fallback;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = { isNumberLike, toNumber, isNonEmptyString };