#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
echo "=== fim do out log (ultimas 20) ==="
tail -n 20 "$LOG"
echo ""
echo "=== plataformas ativas / pronto ==="
grep -iE "Plataformas ativas|Pronto como|❌ Falha ao iniciar" "$LOG" | tail -6
echo ""
echo "=== No LID from user: ultimas ocorrencias com linha ==="
grep -n "No LID for user" "$LOG" | tail -3
echo "=== total No LID no error log ==="
grep -c "No LID for user" /home/solanojr/.pm2/logs/bot-wpp-error-0.log
