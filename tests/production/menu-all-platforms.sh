#!/bin/bash
# Teste de produção: $menu em todas as plataformas
# Uso: bash tests/production/menu-all-platforms.sh [endpoint]
# O bot vai ENVIAR a mensagem $menu para os chats configurados

ENDPOINT="${1:-localhost:3004}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %Z')
RESULTS_DIR="tests/production/results"
mkdir -p "$RESULTS_DIR"

# Chats de teste (configure conforme necessário)
WPP_CHAT_ID="${WPP_TEST_CHAT_ID:-120363410094452673@g.us}"
TELEGRAM_CHAT_ID="${TELEGRAM_TEST_CHAT_ID:-tg:146078742}"
DISCORD_CHAT_ID="${DISCORD_TEST_CHAT_ID:-dc:1521942390082900190}"

echo "=============================================="
echo "  Teste de Produção — \$menu"
echo "  Data/hora: $TIMESTAMP"
echo "  Endpoint: $ENDPOINT"
echo "=============================================="
echo ""

declare -A CHATS=(["whatsapp"]="$WPP_CHAT_ID" ["telegram"]="$TELEGRAM_CHAT_ID" ["discord"]="$DISCORD_CHAT_ID")
PASSED=0
FAILED=0

for platform in whatsapp telegram discord; do
  chatId="${CHATS[$platform]}"
  echo "--- Testando $platform (chat: $chatId) ---"
  RESPONSE=$(curl -s -X POST "http://$ENDPOINT/test" \
    -H "Content-Type: application/json" \
    -d "{\"platform\":\"$platform\",\"command\":\"\$menu\",\"chatId\":\"$chatId\"}")
  
  echo "Resposta: $RESPONSE"
  
  if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "✅ $platform: OK"
    PASSED=$((PASSED + 1))
  else
    echo "❌ $platform: FALHOU"
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo "=============================================="
echo "  FIM DO TESTE — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=============================================="
echo "  Passou: $PASSED"
echo "  Falhou: $FAILED"
