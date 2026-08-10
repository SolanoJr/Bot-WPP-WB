#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
L=$(grep -n "Pronto como WarriorBlack" "$LOG" | tail -1 | cut -d: -f1)
echo "=== Telegram no out log APOS restart $L ==="
tail -n +"$L" "$LOG" | grep -iE "telegram" | head -10
echo "=== Telegram no error log APOS restart $L ==="
tail -n +"$L" "$ERR" | grep -iE "telegram|504|gateway|launch|fetch|ENOTFOUND|ETIMEDOUT|ECONN" | head -10 || echo "sem erro telegram no restart atual"
echo "=== Telegram long-polling / webhook config no adapter? ==="
grep -niE "launch|webhook|polling|allowedUpdates" /home/solanojr/bot-wpp/src/platforms/telegram/TelegramAdapter.ts | head -8
