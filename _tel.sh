#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
echo "=== Telegram no out log (fim) ==="
grep -niE "telegram" "$LOG" | tail -15
echo ""
echo "=== Telegram no error log ==="
grep -niE "telegram|504|Gateway|launch|polling|ECONN|ETIMEDOUT" "$ERR" | tail -15
echo ""
echo "=== existe 'Pronto' ou 'Falha ao iniciar telegram' recente? ==="
grep -niE "Pronto como WarriorBlack|Telegram.*Pronto|Falha ao iniciar telegram|✅ Pronto" "$LOG" | tail -6
