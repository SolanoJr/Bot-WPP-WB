#!/bin/bash
# Teste de produção: $menu em todas as plataformas
# Uso: bash tests/production/menu-all-platforms.sh [endpoint]

ENDPOINT="${1:-localhost:3004}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %Z')
RESULTS_DIR="tests/production/results"
mkdir -p "$RESULTS_DIR"

echo "=============================================="
echo "  Teste de Produção — \$menu"
echo "  Data/hora: $TIMESTAMP"
echo "  Endpoint: $ENDPOINT"
echo "=============================================="
echo ""

PLATFORMS=("whatsapp" "telegram" "discord")
PASSED=0
FAILED=0

for platform in "${PLATFORMS[@]}"; do
  echo "--- Testando $platform ---"
  RESPONSE=$(curl -s -X POST "http://$ENDPOINT/test" \
    -H "Content-Type: application/json" \
    -d "{\"platform\":\"$platform\",\"command\":\"\$menu\"}")
  
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
echo "  FIM DO TESTE"
echo "=============================================="
echo "  Passou: $PASSED"
echo "  Falhou: $FAILED"
