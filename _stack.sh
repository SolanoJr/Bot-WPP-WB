#!/bin/bash
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
echo "=== Stack completo do erro r:r mais recente ==="
grep -n "Erro: r: r\|kick\] Erro\|ban\] Erro\|removeParticipant\|getChatById\|at async" "$ERR" | tail -20
