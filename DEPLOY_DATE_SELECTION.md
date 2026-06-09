# 🚀 Deployment Guide: Date Selection Feature

## Pre-Deployment Checklist

### ✅ Code Quality
- [x] Syntax check passed: `bot.js`, `index.js`, `utils/dateUtils.js`
- [x] No breaking changes to existing functionality
- [x] Backwards compatible with existing sessions
- [x] Russian localization complete

### ✅ Files to Deploy

**New Files:**
```
utils/dateUtils.js          # Date validation, formatting, timestamp generation
```

**Modified Files:**
```
bot.js                       # +450 lines: date selection flow, calendar, session handling
```

**Unchanged (verify they exist on server):**
```
services/googleSheets.js     # Already handles timestamp prefix
services/dataService.js      # Already handles Excel format
package.json                 # No new dependencies
```

## Deployment Steps

### Option 1: Git Push (Recommended)

```bash
# 1. Commit changes
git add utils/dateUtils.js bot.js
git commit -m "feat: Add date selection for missed reports

- Add interactive calendar picker (7x6 grid, month/year navigation)
- Validate dates (no future, max 90 days back)
- Generate timestamp from selected date + current time
- Russian localization (months, days, labels)
- Backwards compatible with existing sessions
- Issue: Fix #<issue-number>"

# 2. Push to remote
git push origin main

# 3. On VPS: Pull and restart
ssh root@109.69.22.112
cd /opt/impulse-bot
git pull origin main
pm2 restart impulse-bot
pm2 logs impulse-bot --lines 50
```

### Option 2: Direct File Copy

```bash
# 1. Copy files to VPS
scp utils/dateUtils.js root@109.69.22.112:/opt/impulse-bot/utils/
scp bot.js root@109.69.22.112:/opt/impulse-bot/

# 2. SSH to VPS and restart
ssh root@109.69.22.112
cd /opt/impulse-bot
pm2 restart impulse-bot
pm2 logs impulse-bot --lines 50
```

## Post-Deployment Verification

### 1. Check Bot Startup
```bash
# On VPS
pm2 logs impulse-bot --lines 50

# Expected output:
# 🚀 Запуск Impulse Bot...
# ✅ Google Sheets: авторизован
# 🤖 Impulse Bot запущен!
# 🔄 Бот работает. Ожидание сообщений...
```

### 2. Smoke Test in Telegram

**Test Case 1: "Today" Flow**
```
1. Send: /start
   ✅ Should show: "📅 Выберите дату отчёта:"
   ✅ Buttons: "📅 Сегодня (DD.MM.YYYY)" and "📆 Выбрать другую дату"

2. Click: "📅 Сегодня"
   ✅ Should proceed to: "🔢 Шаг 1/10 — Введите номер терминала:"
   ✅ Message should include: "📅 Дата отчёта: <today's date>"

3. Complete a full report
   ✅ Timestamp should use today's date + current time
```

**Test Case 2: "Custom Date" Flow**
```
1. Send: /start
2. Click: "📆 Выбрать другую дату"
   ✅ Should show calendar with current month
   ✅ Today's date highlighted with [brackets]
   ✅ Navigation buttons: ◄◄, ◄, <Month Year>, ►, ►►

3. Test navigation:
   ✅ Click ◄ (prev month) - calendar updates
   ✅ Click ► (next month) - calendar updates
   ✅ Click ◄◄ (prev year) - calendar updates
   ✅ Click ►► (next year) - calendar updates

4. Try invalid dates:
   ✅ Click future date - should show error: "❌ Нельзя выбрать будущую дату"
   ✅ Click date >90 days old - should show error: "❌ Можно выбрать дату не старше 90 дней"

5. Select valid past date (e.g., yesterday)
   ✅ Should proceed to terminal number
   ✅ Selected date should appear in all step messages

6. Complete report
   ✅ Timestamp should use selected date + current time
   ✅ Check Google Sheets - timestamp in column A with quote prefix
   ✅ Check Excel - timestamp in column A without prefix
```

### 3. Check Data Storage

**Google Sheets:**
```
1. Open spreadsheet
2. Go to "Продажи_Заголовки" sheet
3. Check latest entry in column A
   ✅ Format: 'DD.MM.YYYY HH:MM:SS (with quote prefix)
   ✅ Date should match selected date
   ✅ Time should match submission time
```

**Excel (sales.xlsx):**
```
1. Check sales.xlsx file on server
2. Open "Продажи_Заголовки" sheet
3. Check latest entry in column A
   ✅ Format: DD.MM.YYYY HH:MM:SS (no quote)
   ✅ Date should match selected date
   ✅ Time should match submission time
```

## Rollback Plan

If issues arise, rollback is simple:

### Quick Rollback (Emergency)
```bash
# On VPS
cd /opt/impulse-bot
git revert HEAD
pm2 restart impulse-bot
```

### Full Rollback
```bash
# On VPS
cd /opt/impulse-bot
git log --oneline  # Find commit before date selection
git reset --hard <commit-hash>
pm2 restart impulse-bot
```

### Manual Rollback (if Git unavailable)
```bash
# Restore old bot.js from backup
cp bot.js.backup bot.js
rm -rf utils/dateUtils.js
pm2 restart impulse-bot
```

## Monitoring

### Watch for Errors
```bash
# On VPS - watch logs in real-time
pm2 logs impulse-bot

# Check for errors
pm2 logs impulse-bot --err --lines 100

# Monitor specific patterns
pm2 logs impulse-bot | grep -E "(ERROR|Session Repair|Date)"
```

### Key Metrics to Monitor
- [ ] Bot startup time (should be < 5 seconds)
- [ ] No syntax errors in logs
- [ ] Users can complete /start flow
- [ ] Calendar navigation works
- [ ] Reports save correctly to Google Sheets
- [ ] Excel file updates correctly
- [ ] No session corruption errors

## Known Issues & Solutions

### Issue 1: "Missing reportDate" warnings in logs
**Symptom:** `[Session Repair] Missing reportDate, setting to today`
**Cause:** Old sessions from before deployment
**Solution:** This is expected behavior. Old sessions are auto-repaired with current date.
**Action:** Monitor - should decrease as old sessions expire

### Issue 2: Calendar doesn't show
**Symptom:** User clicks "Выбрать другую дату" but sees error
**Cause:** Missing utils/dateUtils.js
**Solution:** Ensure utils/ directory and dateUtils.js are deployed
```bash
ls -la /opt/impulse-bot/utils/dateUtils.js
```

### Issue 3: Timestamp format incorrect
**Symptom:** Timestamps in Google Sheets not formatted as text
**Cause:** Quote prefix missing
**Solution:** Check googleSheets.js has not been modified
```bash
grep "const ts = data.timestamp" services/googleSheets.js
# Should show: const ts = data.timestamp ? "'" + data.timestamp : '';
```

## Success Criteria

- ✅ Bot starts without errors
- ✅ All existing functionality works (admin panel, reports, etc.)
- ✅ Date selection prompt appears after /start
- ✅ Calendar picker works with navigation
- ✅ Date validation prevents invalid selections
- ✅ Timestamps use selected date + current time
- ✅ Google Sheets receives prefixed timestamps
- ✅ Excel receives correct format
- ✅ No user complaints about existing features breaking

## Support

### If Problems Occur:
1. Check PM2 logs: `pm2 logs impulse-bot --err`
2. Verify files deployed: `ls -la /opt/impulse-bot/utils/`
3. Test syntax: `node --check bot.js`
4. Rollback if needed (see Rollback Plan above)

### Contact:
- Technical issues: Check logs first
- User issues: Ask for screenshot + steps to reproduce

---

**Deployment Date:** 2025-01-08
**Feature:** Date Selection for Missed Reports
**Status:** ✅ Ready for Production
**Risk Level:** Low (backwards compatible, no breaking changes)
