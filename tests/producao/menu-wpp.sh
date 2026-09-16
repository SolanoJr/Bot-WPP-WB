#!/bin/bash
# Script de teste direto - envia $menu para o grupo Teste via adapter direto

CHAT_ID="120363410094452673@g.us"
COMMAND="$menu"

echo "=========================================="
echo "  TESTE DIRETO - WhatsApp"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=========================================="
echo ""

echo "[INFO] Enviando $COMMAND para $CHAT_ID via TestServer..."

# Enviar via TestServer (porta 3004)
RESPONSE=$(curl -s -X POST http://localhost:3004/test \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"whatsapp:558581344211\",\"command\":\"$COMMAND\",\"chatId\":\"$CHAT_ID\"}")

echo "[INFO] Resposta: $RESPONSE"
echo ""

# Verificar resultado
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ SUCESSO! Bot enviou $COMMAND para $CHAT_ID"
  echo "Verifique no WhatsApp o grupo Teste."
else
  echo "❌ FALHOU - Resposta: $RESPONSE"
fi