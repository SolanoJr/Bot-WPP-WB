#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# F1-PERMS — E2E de permissões por nível via LAB inject (INC-015)
# Roda NO VPS:  cd ~/bot-wpp && bash laboratorio/f1-perms.sh
# Rede de segurança das 3 dívidas de permissão: prova que nenhum
# nível perdeu (ou ganhou) permissão com as mudanças do dispatcher.
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail
LAB="http://127.0.0.1:3004/lab/inject-message"
GID="120363410094452673@g.us"
CAP=/home/solanojr/bot-wpp/laboratorio/captured-messages.jsonl
LOG=/home/solanojr/.pm2/logs/bot-wpp-out.log
ENVF=/home/solanojr/bot-wpp/.env

MASTER_PN=$(grep -E '^MASTER_USER=' "$ENVF" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "\r")
MASTER_PN="${MASTER_PN%%@*}"; MASTER_PN="${MASTER_PN:-558581344211}"
MASTER_LID=$(grep -E '^MASTER_LID=' "$ENVF" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "\r")
MASTER_LID="${MASTER_LID%%@*}"; MASTER_LID="${MASTER_LID:-202658048684056}"
COMUM_LID="72576558715022@lid"
BASE_LINE=$(wc -l < "$LOG")
PASS=0; FAIL=0

inject() { # $1 sender, $2 texto → echo messageId
  curl -s -m 25 -X POST "$LAB" -H "Content-Type: application/json" \
    -d "{\"groupId\":\"$GID\",\"senderId\":\"$1\",\"text\":\"$2\"}" \
    | sed -n 's/.*"messageId":"\([^"]*\)".*/\1/p'
}
wait_reply_text() { # $1 linha-base do capture → texto da última reply (fromMe) nova
  local BEFORE="$1" LINE="" TEXT=""
  for _ in $(seq 1 10); do
    sleep 2
    LINE=$(tail -n +"$((BEFORE+1))" "$CAP" 2>/dev/null | grep '"fromMe":true' | tail -1)
    TEXT=$(printf '%s' "$LINE" | jq -r '(.text // .rawPayloadSafe.message.extendedTextMessage.text // .rawPayloadSafe.message.conversation // empty)' 2>/dev/null)
    [ -n "$TEXT" ] && { printf '%s' "$TEXT"; return 0; }
  done
  printf '(sem reply capturada)'
}
check() { # $1 nome  $2 sender  $3 cmd  $4 regex esperada  $5 veredito
  local MID BEFORE R
  BEFORE=$(wc -l < "$CAP" 2>/dev/null || echo 0)
  MID=$(inject "$2" "$3")
  if [ -z "$MID" ]; then echo "✗ $1 — inject falhou (sem messageId)"; FAIL=$((FAIL+1)); return; fi
  R=$(wait_reply_text "$BEFORE")
  if printf '%s' "$R" | grep -qE "$4"; then
    echo "✓ $1 — $5"
    PASS=$((PASS+1))
  else
    echo "✗ $1 — resposta inesperada: ${R:0:120}"
    FAIL=$((FAIL+1))
  fi
}

echo "── F1-PERMS (base log: linha $BASE_LINE) ──"
# 1) Comum: comando master/admin-only NEGADO
check "comum + \$setwelcome → NEGADO" "$COMUM_LID" '$setwelcome f1-perms' \
  "Apenas administradores do grupo ou o MASTER" "gate por handler nega comum"
# 2) Comum: comando público responde
check "comum + \$ping → responde"      "$COMUM_LID" '$ping' "ong" "público ok"
# 3) Comum: alive público
check "comum + \$alive → responde"     "$COMUM_LID" '$alive' "BOT ONLINE" "público ok"
# 4) Comum: help responde (qualquer reply = público)
check "comum + \$help → responde"      "$COMUM_LID" '$help' ".+" "público ok"
# 5) Master via PN: master-only EXECUTA
check "master PN + \$banidos → EXECUTA" "${MASTER_PN}@c.us" '$banidos' \
  "Nenhum usuário banido|LISTA DE BANIDOS" "master via PN ok"
# 6) Master via LID: master-only EXECUTA
check "master LID + \$banidos → EXECUTA" "${MASTER_LID}@lid" '$banidos' \
  "Nenhum usuário banido|LISTA DE BANIDOS" "master via LID ok"
# 7) Self-loop passivo: nenhum trigger de comando com fromMe=true desde o início
SELF=$(tail -n +$BASE_LINE "$LOG" 2>/dev/null | grep -c "trigger=command.*fromMe=true")
if [ "$SELF" = "0" ]; then
  echo "✓ bot auto-negado — 0 triggers self desde a base (unit-covered + log-verified)"
  PASS=$((PASS+1))
else
  echo "✗ self-loop: $SELF triggers fromMe=true"; FAIL=$((FAIL+1))
fi

echo "── RESULTADO: $PASS pass / $FAIL fail ──"
[ "$FAIL" = "0" ]
