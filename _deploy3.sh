#!/bin/bash
set -e
cd /home/solanojr/bot-wpp
echo "=== git pull (codigo + package.json) ==="
git pull origin main 2>&1 | tail -3
echo "=== npm install (atualiza whatsapp-web.js#main) ==="
npm install 2>&1 | tail -8
echo "=== versao instalada ==="
cat node_modules/whatsapp-web.js/package.json 2>/dev/null | grep -E '"version"|"name"' | head
echo "=== BUILD ==="
npm run build 2>&1 | grep -iE 'error TS|Build success' | head -3
echo "=== pm2 stop ==="
pm2 stop bot-wpp 2>&1 | tail -2
pkill -f chrome 2>/dev/null && echo "chrome morto" || echo "sem chrome"
pkill -f chromium 2>/dev/null && echo "chromium morto" || echo "sem chromium"
sleep 2
echo "=== pm2 restart ==="
pm2 restart bot-wpp 2>&1 | tail -2
sleep 10
echo "=== PID ==="
cat /home/solanojr/.pm2/pids/bot-wpp-0.pid 2>/dev/null
pm2 status bot-wpp 2>&1 | grep -E 'bot-wpp|online'
