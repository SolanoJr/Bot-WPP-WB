#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
echo "=== Telegram/Discord prontos (todo log recente)? ==="
grep -niE "telegram.*pronto|✅ telegram|telegram conectado|Telegram.*Pronto|❌ Falha ao iniciar telegram|504|Gateway" "$LOG" | tail -6
echo "=== Discord pronto confirmado? ==="
grep -c "✅ discord pronto" "$LOG"
echo "=== Executando menu (despacho) recente? ==="
grep -niE "Executando menu em" "$LOG" | tail -5
echo "=== PID ==="
cat /home/solanojr/.pm2/pids/bot-wpp-0.pid 2>/dev/null
