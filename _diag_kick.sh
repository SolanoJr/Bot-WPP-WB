#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
echo "=== PID atual ==="
cat /home/solanojr/.pm2/pids/bot-wpp-0.pid 2>/dev/null
echo "=== Kick/ban recentes no ERROR log ==="
grep -niE "kick|ban|remover|removeParticipant|Erro.*r" "$ERR" | tail -10
echo "=== Kick/ban recentes no OUT log ==="
grep -niE "kick|ban|remover|removeParticipant|Executando (kick|ban)" "$LOG" | tail -10
