'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const REF_FILE = path.join(__dirname, '..', 'ref.json');

let cache = null;
let writeLock = false;
let writeQueue = [];

// Auto-reload ref.json when file changes on disk
let reloadTimeout = null;
try {
  fs.watch(REF_FILE, () => {
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      console.log('[refDictionary] ref.json changed on disk, reloading cache...');
      load().catch(err => console.error('[refDictionary] reload failed:', err));
    }, 300);
  });
} catch (err) {
  console.error('[refDictionary] failed to watch ref.json:', err.message);
}

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

async function migrateCache() {
  let changed = false;

  // Migrate cities from strings to objects
  if (cache.cities && Array.isArray(cache.cities) && cache.cities.length > 0 && typeof cache.cities[0] === 'string') {
    cache.cities = cache.cities.map(name => ({ name, type: 'exhibition' }));
    changed = true;
    console.log('[refDictionary] migrated cities to object format');
  }

  // Migrate terminals from strings to objects
  if (cache.terminals && Array.isArray(cache.terminals) && cache.terminals.length > 0 && typeof cache.terminals[0] === 'string') {
    cache.terminals = cache.terminals.map(name => {
      const city = cache.terminalCityMap ? (cache.terminalCityMap[name] || '') : '';
      return { name, city, type: 'exhibition' };
    });
    changed = true;
    console.log('[refDictionary] migrated terminals to object format');
  }

  // Remove legacy terminalCityMap (data now lives inside terminal objects)
  if (cache.terminalCityMap !== undefined) {
    delete cache.terminalCityMap;
    changed = true;
    console.log('[refDictionary] removed legacy terminalCityMap');
  }

  if (changed) {
    await save(cache);
  }
}

async function load() {
  try {
    const raw = await fsp.readFile(REF_FILE, 'utf-8');
    cache = JSON.parse(raw);
    await migrateCache();
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
    await fsp.writeFile(REF_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } finally {
    releaseLock();
  }
}

// ---------- City helpers ----------

function getCitiesList() {
  if (!cache || !Array.isArray(cache.cities)) return [];
  return cache.cities.map(c => c.name || c);
}

function findCity(name) {
  if (!cache || !Array.isArray(cache.cities)) return null;
  return cache.cities.find(c => c.name === name) || null;
}

function getCityType(name) {
  const city = findCity(name);
  return city ? city.type : null;
}

function addCity(name, type) {
  if (!cache) return false;
  if (!cache.cities) cache.cities = [];
  if (cache.cities.find(c => c.name === name)) return false;
  cache.cities.push({ name, type });
  return true;
}

function removeCity(name) {
  if (!cache || !Array.isArray(cache.cities)) return false;
  const idx = cache.cities.findIndex(c => c.name === name);
  if (idx !== -1) {
    cache.cities.splice(idx, 1);
    return true;
  }
  return false;
}

// ---------- Terminal helpers ----------

function getTerminalsList() {
  if (!cache || !Array.isArray(cache.terminals)) return [];
  return cache.terminals.map(t => t.name || t);
}

function findTerminal(name) {
  if (!cache || !Array.isArray(cache.terminals)) return null;
  return cache.terminals.find(t => t.name === name) || null;
}

function getTerminalCity(name) {
  const terminal = findTerminal(name);
  return terminal ? terminal.city : null;
}

function getTerminalType(name) {
  const terminal = findTerminal(name);
  return terminal ? terminal.type : null;
}

function getTerminalsByCity(city) {
  if (!cache || !Array.isArray(cache.terminals)) return [];
  if (!city) return getTerminalsList();
  return cache.terminals
    .filter(t => !t.city || t.city === city)
    .map(t => t.name);
}

function getTerminalCityMap() {
  if (!cache || !Array.isArray(cache.terminals)) return {};
  const map = {};
  for (const t of cache.terminals) {
    if (t.city) map[t.name] = t.city;
  }
  return map;
}

function addTerminal(name, city, type) {
  if (!cache) return false;
  if (!cache.terminals) cache.terminals = [];
  if (cache.terminals.find(t => t.name === name)) return false;
  cache.terminals.push({ name, city: city || '', type });
  return true;
}

function removeTerminal(name) {
  if (!cache || !Array.isArray(cache.terminals)) return false;
  const idx = cache.terminals.findIndex(t => t.name === name);
  if (idx !== -1) {
    cache.terminals.splice(idx, 1);
    return true;
  }
  return false;
}

// ---------- Generic array helpers (for string-based refs: channels, managers, products) ----------

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

// Переместить элемент с позиции fromIdx на позицию toIdx (0-based)
function arrayMoveToIndex(arr, fromIdx, toIdx) {
  if (fromIdx < 0 || fromIdx >= arr.length || toIdx < 0 || toIdx >= arr.length) return false;
  const [item] = arr.splice(fromIdx, 1);
  arr.splice(toIdx, 0, item);
  return true;
}

const KEYS = ['cities', 'terminals', 'channels', 'managers', 'products'];
const LABELS = {
  cities: 'Города',
  terminals: 'Точки',
  channels: 'Каналы',
  managers: 'Менеджеры',
  products: 'Товары'
};

const TYPE_LABELS = {
  exhibition: 'Выставка',
  sanatorium: 'Санаторий'
};

module.exports = {
  load, getRef, save,
  arrayAdd, arrayRemove, arrayMoveUp, arrayMoveDown, arrayMoveToIndex,
  getCitiesList, getTerminalsList, getTerminalsByCity,
  getCityType, getTerminalCity, getTerminalType, getTerminalCityMap,
  findCity, findTerminal,
  addCity, addTerminal, removeCity, removeTerminal,
  KEYS, LABELS, TYPE_LABELS
};
