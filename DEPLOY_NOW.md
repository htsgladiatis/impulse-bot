# 🚀 Deploy Date Selection to Production - Quick Guide

## Files Ready for Deployment

### New Files ✨
```
✅ utils/dateUtils.js (450 lines) - Date validation, formatting, timestamp generation
```

### Modified Files 📝
```
✅ bot.js (+450 lines) - Date selection flow, calendar picker, session handling
```

## One-Command Deployment

### Option 1: Git Push (Recommended) ⭐

```bash
# 1. Commit and push
git add utils/dateUtils.js bot.js .kiro/
git commit -m "feat: Add date selection for missed reports"
git push origin main

# 2. Deploy to VPS
node deploy-bot-direct.js

# OR manually on VPS:
ssh root@109.69.22.112
cd /opt/impulse-bot
git pull origin main
pm2 restart impulse-bot
pm2 logs impulse-bot --lines 30
```

### Option 2: Direct File Upload (Quick) ⚡

```bash
# Run existing deploy script
node deploy-bot-direct.js

# This will:
# - Copy bot.js to VPS
# - Copy utils/dateUtils.js to VPS
# - Restart PM2 process
# - Show logs
```

## Quick Test After Deploy

```
1. Open Telegram → @impulse_device_bot
2. Send: /start
3. See: "📅 Выберите дату отчёта:"
4. Test "Сегодня" button → Should work ✅
5. Test "Выбрать другую дату" → Calendar appears ✅
6. Select a date → Proceeds to terminal number ✅
7. Complete one report → Check Google Sheets ✅
```

## What This Feature Does

- ✅ **Adds date selection at start** - Users choose report date before entering data
- ✅ **Interactive calendar** - 7×6 grid with month/year navigation
- ✅ **Validation** - Prevents future dates and dates >90 days old
- ✅ **Russian UI** - All labels, months, days in Russian
- ✅ **Smart timestamp** - Uses selected date + current time
- ✅ **Backwards compatible** - Old sessions auto-repaired

## Rollback (if needed)

```bash
# On VPS
cd /opt/impulse-bot
git revert HEAD
pm2 restart impulse-bot
```

## Support Checklist

After deployment, verify:
- [ ] Bot starts without errors: `pm2 logs impulse-bot`
- [ ] Date prompt appears after /start
- [ ] Calendar navigation works
- [ ] Reports save to Google Sheets with correct timestamp
- [ ] Excel file updates correctly
- [ ] Existing features (admin panel) still work

---

**Status:** ✅ Ready for Production
**Risk:** Low (backwards compatible, tested)
**Files:** 2 (1 new, 1 modified)
**Deployment Time:** ~2 minutes

🎉 **Ready to go! Run `node deploy-bot-direct.js` to deploy.**
