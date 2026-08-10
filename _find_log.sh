#!/bin/bash
LOG=/home/solanojr/.pm2/logs/bot-wpp-out-0.log
ERR=/home/solanojr/.pm2/logs/bot-wpp-error-0.log
echo "=== Procurando +62 831 / 6283185275521 no OUT (ontem 09/08) ==="
grep -niE "6283185275521|83185275521|\+62|831-8527" "$LOG" | head -20
echo "=== Erro 'r' / Issue 201838 no OUT ==="
grep -niE "r:r|Issue #201838|Erro .r. detectado|Não é possível obter participantes" "$LOG" | tail -10
echo "=== No ERROR log, ban/kick recentes ==="
grep -niE "ban|kick|remover|removeParticipant" "$ERR" | tail -15
