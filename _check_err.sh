#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
echo "=== ERROS no error log (ultimas 30) ==="
tail -n 30 "$ERR"
echo ""
echo "=== alertas WPP / Telegram / No LID / serialize no out log ==="
grep -niE "No LID|serialize|getMessageModel|Telegram|telegram|504|Gateway|Falha de transporte|Erro no comando|Pronto como" "$LOG" | tail -25
echo ""
echo "=== PID atual ==="
cat /home/solanojr/.pm2/pids/bot-wpp-0.pid 2>/dev/null
