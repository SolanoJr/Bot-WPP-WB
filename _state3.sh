#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
echo "=== ULTIMAS 50 linhas do out log ==="
tail -n 50 "$LOG"
echo ""
echo "=== Discord/Telegram: Pronto / Falha / erro (todo o log, recentes) ==="
grep -niE "Discord.*Pronto|Telegram.*Pronto|Discord.*✅|Telegram.*✅|❌ Falha ao iniciar telegram|❌ Falha ao iniciar discord|Falha na inicialização" "$LOG" | tail -8
