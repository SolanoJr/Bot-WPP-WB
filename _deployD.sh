#!/bin/bash
cd /home/solanojr/bot-wpp
git pull origin main 2>&1 | tail -2
npm run build 2>&1 | grep -iE 'error TS|Build success' | head -2
pm2 stop bot-wpp 2>&1 | tail -1
pkill -f chrome 2>/dev/null || true
pkill -f chromium 2>/dev/null || true
sleep 2
pm2 restart bot-wpp 2>&1 | tail -1
echo "=== aguardando 45s para Discord/Telegram subirem ==="
sleep 45
echo "PID: $(cat /home/solanojr/.pm2/pids/bot-wpp-0.pid 2>/dev/null)"
echo "=== Pronto / Falha (todo o log apos restart) ==="
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
L=$(grep -n "Pronto como WarriorBlack" "$LOG" | tail -1 | cut -d: -f1)
tail -n +"$L" "$LOG" | grep -iE "Pronto como|✅ discord pronto|✅ telegram pronto|❌ Falha ao iniciar|Plataformas ativas|Discord não configurado|Telegram não configurado" | head -10
echo "=== error log: Discord/Telegram recentes ==="
tail -n +"$L" /home/solanojr/.pm2/logs/bot-wpp-error-0.log 2>/dev/null | grep -iE "discord|telegram|504|Gateway" | head -5 || echo "sem erro recente"
