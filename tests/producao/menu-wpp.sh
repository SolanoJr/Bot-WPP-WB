#!/bin/bash
# Script de teste direto - envia $menu para o grupo Teste via adapter direto

CHAT_ID="120363410094452673@g.us"

echo "=========================================="
echo "  TESTE DIRETO - WhatsApp"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=========================================="
echo ""

echo "[INFO] Enviando \$menu para $CHAT_ID via TestServer..."

# Enviar via TestServer (porta 3004)
RESPONSE=$(curl -s -X POST http://localhost:3004/test \
  -H "Content-Type: application/json" \
  -d '{"platform":"whatsapp:558581344211","command":"\$menu","chatId":"120363410094452673@g.us"}')

echo "[INFO] Resposta: $RESPONSE"
echo ""

# Verificar resultado
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ SUCESSO! Bot enviou \$menu para $CHAT_ID"
  echo "Verifique no WhatsApp o grupo Teste."
else
  echo "❌ FALHOU - Resposta: $RESPONSE"
fi