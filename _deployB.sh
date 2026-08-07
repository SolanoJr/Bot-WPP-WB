#!/bin/bash
cd /home/solanojr/bot-wpp
echo "=== git pull ==="
git pull origin main 2>&1 | tail -3
echo "=== BUILD ==="
npm run build 2>&1 | grep -iE 'error TS|Build success' | head -3
echo "=== conectividade Telegram API ==="
curl -s -o /dev/null -w "HTTP %{http_code} em %{time_total}s\n" --max-time 15 https://api.telegram.org 2>&1 || echo "FALHOU curl api.telegram.org"
echo "=== pm2 restart limpo ==="
pm2 stop bot-wpp 2>&1 | tail -1
pkill -f chrome 2>/dev/null || true
pkill -f chromium 2>/dev/null || true
sleep 2
pm2 restart bot-wpp 2>&1 | tail -1
sleep 15
echo "PID: $(cat /home/solanojr/.pm2/pids/bot-wpp-0.pid 2>/dev/null)"
pm2 status bot-wpp 2>&1 | grep -E 'online'
