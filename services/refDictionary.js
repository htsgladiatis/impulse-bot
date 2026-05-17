'use strict';

const fs = require('fs').promises;
const path = require('path');

const REF_FILE = path.join(__dirname, '..', 'ref.json');

let cache = null;
let writeLock = false;
let writeQueue = [];

async function acquireLock() {
  if (!writeLock) {
    writeLock = true;
    return;
  }
  await new Promise(resolve => writeQueue.push(resolve));
}

function releaseLock() {
  if (writeQueue.length > 0) {
    const next = writeQueue.shift();
    next();
  } else {
    writeLock = false;
  }
}

async function load() {
  try {
    const raw = await fs.readFile(REF_FILE, 'utf-8');
    cache = JSON.parse(raw);
  } catch {
    cache = { cities: [], terminals: [], channels: [], managers: [], products: [] };
    await save(cache);
  }
  return cache;
}

async function getRef() {
  if (!cache) await load();
  return cache;
}

async function save(data) {
  await acquireLock();
  try {
    cache = data;
    await fs.writeFile(REF_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } finally {
    releaseLock();
  }
}

function arrayAdd(arr, item) {
  if (!arr.includes(item)) {
    arr.push(item);
    return true;
  }
  return false;
}

function arrayRemove(arr, item) {
  const idx = arr.indexOf(item);
  if (idx !== -1) {
    arr.splice(idx, 1);
    return true;
  }
  return false;
}

function arrayMoveUp(arr, index) {
  if (index > 0 && index < arr.length) {
    const tmp = arr[index - 1];
    arr[index - 1] = arr[index];
    arr[index] = tmp;
    return true;
  }
  return false;
}

function arrayMoveDown(arr, index) {
  if (index >= 0 && index < arr.length - 1) {
    const tmp = arr[index + 1];
    arr[index + 1] = arr[index];
    arr[index] = tmp;
    return true;
  }
  return false;
}

const KEYS = ['cities', 'terminals', 'channels', 'managers', 'products'];
const LABELS = {
  cities: 'Города',
  terminals: 'Точки',
  channels: 'Каналы',
  managers: 'Менеджеры',
  products: 'Товары'
};

// Переместить элемент с позиции fromIdx на позицию toIdx (0-based)
function arrayMoveToIndex(arr, fromIdx, toIdx) {
  if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return false;
  const [item] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, item);
  return true;
}

module.exports = { load, getRef, save, arrayAdd, arrayRemove, arrayMoveUp, arrayMoveDown, arrayMoveToIndex, KEYS, LABELS };
