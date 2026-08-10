#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
L=$(grep -n "Pronto como WarriorBlack" "$LOG" | tail -1 | cut -d: -f1)
echo "=== 30 linhas ANTES do 'Pronto como WarriorBlack' (linha $L) ==="
head -n "$L" "$LOG" | tail -n 30
echo ""
echo "=== 25 linhas DEPOIS ==="
tail -n +"$L" "$LOG" | head -25
