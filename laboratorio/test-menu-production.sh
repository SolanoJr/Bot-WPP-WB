#!/bin/bash
# Envia $menu para o grupo Teste via bot em produção
# Uso: bash laboratorio/test-menu-production.sh

set -e

# Configurações
CHAT_ID="120363410094452673@g.us"
COMMAND="$menu"

echo "========================================="
echo "  Teste de Produção: $menu"
echo "  Chat: $CHAT_ID"
echo "  Data/hora: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "========================================="
echo ""

# Método 1: Enviar via pm2 enviando mensagem diretamente
echo "[INFO] Enviando $menu para $CHAT_ID..."

# Usar o endpoint /test do testServer
RESPONSE=$(curl -s -X POST http://localhost:3004/test \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"whatsapp\",\"command\":\"$COMMAND\",\"chatId\":\"$CHAT_ID\"}")

echo "[INFO] Resposta: $RESPONSE"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo ""
  echo "✅ TESTE PASSOU: Bot respondeu $menu"
  echo ""
  echo "📋 Verifique no grupo Teste:"
  echo "   - Mensagem: $menu"
  echo "   - Resposta:  🤖 *BOT WARRIORBLACK* ... (menu completo)"
  echo ""
else
  echo ""
  echo "❌ TESTE FALHOU"
  echo ""
fi