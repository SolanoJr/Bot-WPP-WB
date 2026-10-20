#!/usr/bin/env bash
# Bug do Welcome — probe da Incerteza 4 (render de mention em grupo LID).
# Envia 3 mensagens ao grupo LAB, contornando o pipeline do welcome:
#   PROBE_A: handle PN  + mentions PN   (@s.whatsapp.net)
#   PROBE_B: handle PN  + mentions LID   (@lid)
#   PROBE_C: handle LID + mentions LID   (@lid)
# Uso (no VPS): bash laboratorio/probe-mentions.sh 5585XXXXXXX
PHONE="${1:?uso: probe-mentions.sh <phone>}"
curl -s -X POST http://127.0.0.1:3004/lab/probe-mentions \
  -H 'Content-Type: application/json' -d "{\"phone\":\"$PHONE\"}"
echo
echo "→ Inspecione o LAB: PROBE_A/B/C contêm o handle de @$PHONE."
echo "→ A(s) que renderizarem o highlight (azul) definem o formato vencedor:"
echo "   A vence → handle PN + mentions PN · B vence → handle PN + mentions LID"
echo "   C vence → handle LID + mentions LID"
