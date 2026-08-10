#!/bin/bash
sleep 30
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
echo "=== Telegram pronto ou erro (apos espera)? ==="
grep -niE "telegram.*pronto|✅ telegram|telegram conectado|❌ Falha ao iniciar telegram|504|Gateway|Telegram.*Pronto" "$LOG" | tail -6
echo "=== Plataformas ativas (linha do Pronto WPP atual)? ==="
L=$(grep -n "Pronto como WarriorBlack" "$LOG" | tail -1 | cut -d: -f1)
tail -n +"$L" "$LOG" | grep -iE "Plataformas ativas" | tail -2
