#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
echo "=== PID atual ==="
cat /home/solanojr/.pm2/pids/bot-wpp-0.pid 2>/dev/null
echo "=== ERROS no error log (ultimas 40 linhas) ==="
tail -n 40 "$ERR"
echo ""
echo "=== Pronto / Falha / Plataformas no out log (ultimas 15) ==="
grep -iE "Pronto como|❌ Falha ao iniciar|Falha na inicialização|Plataformas ativas|No LID|serialize|Gateway|504|Enviando resposta" "$LOG" | tail -15
