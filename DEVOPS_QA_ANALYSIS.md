mimo/mimo-v2.5-pro# Impulse-Bot — DevOps & QA Analysis Report

> **Date:** 2026-05-16  
> **Analyst:** DevOps & QA (L99)  
> **Project:** Impulse Device Sales Bot v2.0.0  
> **Repository:** impulse-bot (CommonJS, Node.js ≥ 18)

---

## 1. Executive Summary

Impulse-Bot — Telegram-бот для учёта продаж устройств с миграцией на multi-platform архитектуру (Adapter Pattern). Проект имеет **legacy монолит** (`bot.js`, 900 строк) и **новую архитектуру** (`index.v2.js`) с чётким разделением на adapters/controllers/services/core.

### Критические находки:

| # | Проблема | Severity | Категория |
|---|----------|----------|-----------|
| 1 | Отсутствует `config.js` — `index.v2.js` падает при запуске | 🔴 Critical | DevOps |
| 2 | Все зависимости `"latest"` — непредсказуемые деплои | 🔴 Critical | DevOps |
| 3 | Нет `package-lock.json` в репозитории | 🔴 Critical | DevOps |
| 4 | Auth-сервис — заглушка (все пользователи разрешены) | 🟠 High | Security |
| 5 | VKAdapter не тестирован с реальным токеном | 🟠 High | QA |
| 6 | Нет формального тестового фреймворка | 🟠 High | QA |
| 7 | `pm2.config.js` запускает legacy `index.js`, а не `index.v2.js` | 🟡 Medium | DevOps |
| 8 | Отсутствует healthcheck/monitoring эндпоинт | 🟡 Medium | DevOps |
| 9 | `SessionManager` — in-memory, потеря сессий при рестарте | 🟡 Medium | DevOps |
| 10 | Credentials в CLAUDE.md (VPS пароли) | 🔴 Critical | Security |

---

## 2. Architecture Review

### 2.1 Стек технологий

| Компонент | Технология | Статус |
|-----------|-----------|--------|
| Runtime | Node.js ≥ 18 | ✅ Production |
| Telegram SDK | node-telegram-bot-api | ✅ Production (bot.js) |
| VK SDK | vk-io + @vk-io/scenes, @vk-io/session | ⚠️ Не тестирован |
| Google Sheets | googleapis | ✅ Production |
| Excel Export | exceljs | ✅ Production |
| Логирование | winston | ✅ Подключён |
| HTTP Server | express | ⚠️ Нет healthcheck-эндпоинта |
| Process Manager | PM2 (fork mode) | ✅ Production |
| Хранилище файлов | Яндекс.Диск | ✅ Production |

### 2.2 Архитектурные слои

```
┌─────────────────────────────────────────────────────┐
│                    Entry Points                      │
│  index.js (legacy)  │  index.v2.js  │  index.vk.js  │
├─────────────────────┴───────────────┴───────────────┤
│                   Adapters Layer                      │
│  telegram.js (✅)   │   vk.js (⚠️)   │  IBotAdapter │
├─────────────────────┴───────────────────────────────┤
│                  Controllers Layer                    │
│  sales.js │ admin.js │ cart.js │ report.js           │
├─────────────────────────────────────────────────────┤
│                   Core Layer                          │
│  SessionManager │ StateMachine │ MessageReplacer     │
│  UnifiedContext                                      │
├─────────────────────────────────────────────────────┤
│                  Services Layer                       │
│  googleSheets │ yandexDisk │ dataService │ auth      │
│  refDictionary │ logger │ validators                 │
└─────────────────────────────────────────────────────┘
```

### 2.3 Статус миграции

| Файл | Роль | Production Ready? |
|------|------|-------------------|
| `bot.js` | Legacy монолит (900 строк) | ✅ Работает на проде |
| `index.js` | Legacy entry point | ✅ Работает на проде |
| `index.v2.js` | Новая архитектура | ❌ Отсутствует `config.js` |
| `index.vk.js` | VK-специфичный entry | ❌ Не тестирован |
| `pm2.config.js` | Запускает `index.js` + `index.vk.js` | ⚠️ Не `index.v2.js` |

---

## 3. DevOps Findings

### 3.1 Dependency Management — 🔴 Critical

```json
// package.json — ВСЕ зависимости на "latest"
"dependencies": {
    "@vk-io/scenes": "latest",    // ❌ Нет pinning
    "exceljs": "latest",          // ❌ Нет pinning
    "express": "latest",          // ❌ Нет pinning
    "googleapis": "latest",       // ❌ Нет pinning
    "node-telegram-bot-api": "latest", // ❌ Нет pinning
    ...
}
```

**Проблема:** При каждом `npm install` могут устанавливаться разные версии. Breaking changes в minor/patch версиях могут сломать продакшен без предупреждения.

**Решение:**
1. Запустить `npm install` и зафиксировать `package-lock.json`
2. Определить текущие установленные версии: `npm ls --depth=0`
3. Запинить все зависимости: `"express": "^4.18.2"` вместо `"latest"`
4. Добавить `npm ci` в деплой-скрипт вместо `npm install`

### 3.2 Missing `config.js` — 🔴 Critical

`index.v2.js` строка 3: `const config = require('./config');`

Файл `config.js` **не существует** в репозитории. Новая архитектура не может запуститься.

**Решение:** Создать `config.js`:

```javascript
'use strict';
require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN,
  },
  vk: {
    token: process.env.VK_GROUP_TOKEN,
    groupId: process.env.VK_GROUP_ID,
    confirmationCode: process.env.VK_CONFIRMATION_CODE,
    secretKey: process.env.VK_SECRET_KEY,
  },
  google: {
    spreadsheetId: process.env.SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID,
    credentials: process.env.GOOGLE_CREDENTIALS_JSON 
      ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON) 
      : null,
  },
  yandex: {
    token: process.env.YANDEX_DISK_TOKEN,
  },
  session: {
    store: process.env.SESSION_STORE || 'memory',
  },
  port: parseInt(process.env.PORT, 10) || 3000,
  logLevel: process.env.LOG_LEVEL || 'info',
};
```

### 3.3 PM2 Configuration — 🟡 Medium

Текущий `pm2.config.js` запускает:
- `impulse-bot` → `index.js` (legacy)
- `impulse-vk-bot` → `index.vk.js` (VK, не тестирован)

**Не запускает `index.v2.js`** — новая архитектура не задеплоена.

**Рекомендация:** Добавить третий app entry для v2, подготовить cutover-стратегию:

```javascript
{
  name: 'impulse-bot-v2',
  script: 'index.v2.js',
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  kill_timeout: 5000,
  env: { NODE_ENV: 'production' },
}
```

### 3.4 Missing Health Check — 🟡 Medium

Express-сервер (`PORT=3000`) запущен, но нет `/health` эндпоинта для мониторинга.

**Решение:** Добавить в entry point:

```javascript
const express = require('express');
const app = express();
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: '2.0.0' });
});
app.listen(config.port);
```

### 3.5 Session Persistence — 🟡 Medium

`SessionManager` использует in-memory `Map<userId, SessionState>`. При рестарте PM2 все незавершённые сессии теряются.

**Рекомендация:** 
- **Short-term:** Добавить graceful shutdown с сохранением сессий в файл
- **Long-term:** Redis/SQLite backend для сессий

### 3.6 Deploy Pipeline — 🟡 Medium

Текущий деплой — ручной через `pscp`/`plink` с хардкодом credentials.

**Рекомендации:**
1. Вынести credentials в CI/CD secrets (GitHub Actions / GitLab CI)
2. Добавить `.github/workflows/deploy.yml` с автоматическим деплоем
3. Использовать `npm ci --production` вместо `npm install`
4. Добавить smoke-test после деплоя

### 3.7 Monitoring & Alerting — 🟠 High

**Текущее состояние:**
- Winston logger подключён, но нет настроенного транспорта для алертов
- `unhandledRejection` и `uncaughtException` только в консоль
- Нет метрик (response time, error rate, session count)

**Рекомендации:**
1. Winston → файл + console транспорты
2. PM2 logrotate: `pm2 install pm2-logrotate`
3. Простой uptime monitoring: UptimeRobot → `/health` эндпоинт
4. Ключевые метрики для логирования:
   - Sale submission success/failure
   - Google Sheets write latency
   - Yandex Disk upload success/failure
   - Session creation/destruction

---

## 4. Security Findings

### 4.1 Credentials in CLAUDE.md — 🔴 Critical

```
pscp -pw "And716443@" file.js root@109.69.22.112:/opt/impulse-bot/
plink -pw "And716443@" -hostkey "..." root@109.69.22.112 "..."
```

**VPS root-пароль и SSH credentials зафиксированы в репозитории.**

**Немедленные действия:**
1. Удалить credentials из CLAUDE.md
2. Сменить VPS root пароль
3. Перейти на SSH key-based authentication
4. Добавить `CLAUDE.md` в `.gitignore` (или очистить от secrets)

### 4.2 Auth Service — заглушка 🟠 High

`services/auth.js` — все пользователи разрешены (whitelist отключён).

**Рекомендация:** Реализовать whitelist из `.env`:
```
ADMIN_IDS=tg_123456,vk_789
ALLOWED_USERS=tg_123456,tg_67890,vk_789
```

### 4.3 Input Validation — 🟡 Medium

`parseNum()` обрабатывает comma/spaces/NaN, но:
- Нет валидации на отрицательные суммы
- Нет валидации на максимальные значения (защита от опечаток)
- Нет rate-limiting на команды

---

## 5. QA Findings

### 5.1 Test Infrastructure — 🟠 High

| Тест | Тип | Покрытие | Статус |
|------|-----|----------|--------|
| `npm run check` | Syntax check (`node --check`) | Все файлы | ✅ Работает |
| `smoke-check.js` | Smoke test (ручные assertions) | ~30% модулей | ⚠️ Базовый |
| `qa-check.js` | Data quality check | Google Sheets | ⚠️ Узкий |
| Unit tests | — | 0% | ❌ Отсутствуют |
| Integration tests | — | 0% | ❌ Отсутствуют |
| E2E tests | — | 0% | ❌ Отсутствуют |

### 5.2 Smoke Test Analysis

**Покрытое:**
- ✅ Cart calculation (1 тест-кейс)
- ✅ Report generation
- ✅ Sale record building
- ✅ Telegram adapter normalize + keyboard
- ✅ VK adapter normalize
- ✅ Ref dictionary loading
- ✅ Legacy sheets wrapper

**Не покрытое:**
- ❌ Sales controller state machine (10-step wizard)
- ❌ Admin controller CRUD
- ❌ Error handling paths
- ❌ Edge cases (empty cart, negative values, NaN)
- ❌ Adapter `sendMessage`/`editMessage`/`deleteMessage`
- ❌ Photo upload flow
- ❌ Google Sheets write operations
- ❌ Yandex Disk integration
- ❌ SessionManager create/get/delete lifecycle
- ❌ VK keyboard builder

### 5.3 Recommended Test Plan

#### Priority 1 — Unit Tests (Jest)

```bash
npm install --save-dev jest
```

Добавить в `package.json`:
```json
"scripts": {
  "test": "jest --coverage",
  "test:watch": "jest --watch"
}
```

**Файлы для тестирования:**

| Модуль | Тест-сьют | Приоритет |
|--------|-----------|-----------|
| `controllers/cart.js` | calculateTotal, edge cases (0, NaN, negative) | 🔴 High |
| `controllers/report.js` | buildReportData, formatPreviewReport, formatFinalReport | 🔴 High |
| `controllers/sales.js` | buildSaleRecord, formatSaleSavedMessage | 🔴 High |
| `utils/validators.js` | parseNum, all validators | 🔴 High |
| `core/SessionManager.js` | create, get, has, delete, cleanup | 🟠 Medium |
| `services/auth.js` | isAllowed, isAdmin, normalizeUserId | 🟠 Medium |
| `adapters/telegram.js` | normalize, buildKeyboard, all methods | 🟠 Medium |
| `adapters/vk.js` | normalize, buildKeyboard, all methods | 🟠 Medium |
| `services/refDictionary.js` | load, getRef, getProducts | 🟡 Low |

#### Priority 2 — Integration Tests

- Sales wizard full flow (mock adapters + services)
- Admin CRUD flow
- Cart + Report integration
- Session lifecycle

#### Priority 3 — E2E / Smoke on deploy

- Automated smoke-check после деплоя на VPS
- Health endpoint ping
- Telegram webhook/polling connectivity check

### 5.4 Code Quality Issues

1. **900-строчный `bot.js`** — монолит, сложен для тестирования и поддержки
2. **Дублирование**: `sheets.js` и `services/googleSheets.js` — два модуля для одной задачи
3. **Патч-файлы в репозитории**: `fix_keyboard_patch.js`, `fix-date.js`, `fix-headers.js`, `fix-headers-date.js`, `patch_kb.js`, `vk_fix.js` — мусор
4. **Неиспользуемые файлы**: `vk-bots-lp.html`, `vk-docs.html`, `read-items.js`, `ref.js`
5. **Нет `.gitignore`** (или он не в репозитории)

---

## 6. Action Plan

### Phase 1 — Immediate (this week)

| # | Задача | Ответственный | Est. |
|---|--------|--------------|------|
| 1 | Удалить credentials из CLAUDE.md, сменить VPS пароль | DevOps | 30min |
| 2 | Создать `config.js` для index.v2.js | Dev | 15min |
| 3 | Запинить зависимости в package.json, создать lock file | DevOps | 15min |
| 4 | Добавить `.gitignore` | DevOps | 5min |
| 5 | Запустить `npm run check` и `npm run smoke` | QA | 5min |

### Phase 2 — Short-term (2 weeks)

| # | Задача | Ответственный | Est. |
|---|--------|--------------|------|
| 6 | Настроить Jest, написать unit-тесты для cart/report/validators | QA | 1 day |
| 7 | Добавить `/health` эндпоинт | DevOps | 30min |
| 8 | Очистить мусорные файлы из репозитория | Dev | 30min |
| 9 | Реализовать auth whitelist | Dev | 2h |
| 10 | Обновить pm2.config.js для v2 | DevOps | 15min |

### Phase 3 — Medium-term (1 month)

| # | Задача | Ответственный | Est. |
|---|--------|--------------|------|
| 11 | CI/CD pipeline (GitHub Actions) | DevOps | 1 day |
| 12 | Automated deploy с smoke-test | DevOps | 2h |
| 13 | Winston → file + monitoring | DevOps | 2h |
| 14 | VK integration тестирование | QA | 1 day |
| 15 | Cutover bot.js → index.v2.js | Dev+DevOps | 1 day |

### Phase 4 — Long-term

| # | Задача | Ответственный | Est. |
|---|--------|--------------|------|
| 16 | Session persistence (Redis/SQLite) | Dev | 1 day |
| 17 | E2E тесты для sales wizard | QA | 2 days |
| 18 | Rate limiting и security hardening | Dev | 1 day |
| 19 | Performance monitoring (Prometheus/Grafana) | DevOps | 1 day |

---

## 7. Quick Start — Commands

```bash
# Check syntax
npm run check

# Run smoke tests
npm run smoke

# Start legacy (production)
npm start

# Start v2 (requires config.js creation first)
npm run start-v2

# PM2 management
pm2 start pm2.config.js
pm2 restart impulse-bot
pm2 logs impulse-bot --lines 50 --nostream
pm2 monit
```

---

## 8. Summary

| Аспект | Оценка | Комментарий |
|--------|--------|-------------|
| Architecture | ⭐⭐⭐⭐ | Adapter Pattern — чистый, масштабируемый |
| Code Quality | ⭐⭐⭐ | Хорошее разделение, но мусорные файлы |
| Test Coverage | ⭐ | Практически отсутствует |
| Security | ⭐⭐ | Credentials в репозитории, auth-заглушка |
| DevOps | ⭐⭐ | Ручной деплой, нет CI/CD, нет monitoring |
| Documentation | ⭐⭐⭐⭐ | CLAUDE.md — excellent |
| Production Readiness (v2) | ⭐⭐ | config.js отсутствует, не тестирован |

**Общая рекомендация:** Проект имеет сильную архитектурную базу, но нуждается в:
1. **Немедленно**: устранить security-дыры (credentials) и создать `config.js`
2. **Краткосрочно**: внедрить тестирование и CI/CD
