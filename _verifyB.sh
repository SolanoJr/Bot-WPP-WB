#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
echo "=== Pronto / plataformas (apos restart) ==="
L=$(grep -n "Inicializando Bot-WPP" "$LOG" | tail -1 | cut -d: -f1)
tail -n +"$L" "$LOG" | grep -iE "Pronto como|Plataformas ativas|No LID|Falha ao iniciar" | head -10
echo ""
echo "=== ainda ha No LID no error log? (ultimas 5) ==="
grep -c "No LID for user" "$ERR"
echo "=== Telegram erro recente? ==="
tail -n +"$L" "$ERR" | grep -iE "telegram|504|Gateway" | head -5 || echo "sem erro telegram recente"
echo ""
echo "=== se voce mandar $menu, o log de envio aparece assim: ==="
tail -n +"$L" "$LOG" | grep -iE "Enviando resposta para" | head -5
