#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
# Achar a linha do ultimo restart (procura pelo PID atual ou pela ultima vez que apareceu "Pronto como WarriorBlack")
L=$(grep -n "Pronto como WarriorBlack" "$LOG" | tail -1 | cut -d: -f1)
echo "=== contexto apos o ultimo 'Pronto como WarriorBlack' (linha $L) ==="
tail -n +"$L" "$LOG" | head -40
echo ""
echo "=== Discord/Telegram Pronto ou Falha (apos restart) ==="
tail -n +"$L" "$LOG" | grep -iE "Discord.*Pronto|Telegram.*Pronto|Falha ao iniciar|Plataformas ativas|✅ Pronto" | head
