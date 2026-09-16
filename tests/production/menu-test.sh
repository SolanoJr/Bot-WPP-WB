#!/bin/bash
# tests/production/menu-test.sh
# Testa o comando $menu em produção via API do bot
# Uso: ./tests/production/menu-test.sh [plataforma] [endpoint]
# Exemplo: ./tests/production/menu-test.sh discord localhost:3004

set -e

PLATFORM="${1:-discord}"
ENDPOINT="${2:-localhost:3004}"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %Z')
LOG_FILE="tests/production/results/menu-test-$(date '+%Y%m%d-%H%M%S').log"

mkdir -p tests/production/results

echo "========================================" | tee "$LOG_FILE"
echo "  Teste de Produção: \$menu" | tee -a "$LOG_FILE"
echo "  Plataforma: $PLATFORM" | tee -a "$LOG_FILE"
echo "  Endpoint: $ENDPOINT" | tee -a "$LOG_FILE"
echo "  Data/hora: $TIMESTAMP" | tee -a "$LOG_FILE"
echo "========================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Envia o comando
echo "[INFO] Enviando \$menu para o bot..." | tee -a "$LOG_FILE"
RESPONSE=$(curl -s -X POST "http://$ENDPOINT/test" \
  -H "Content-Type: application/json" \
  -d "{\"platform\":\"$PLATFORM\",\"command\":\"\$menu\"}")

echo "[INFO] Resposta recebida:" | tee -a "$LOG_FILE"
echo "$RESPONSE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Verifica se a resposta é válida
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ TESTE PASSOU: Bot respondeu \$menu com sucesso" | tee -a "$LOG_FILE"
  echo "✅ Data/hora: $TIMESTAMP" | tee -a "$LOG_FILE"
  exit 0
elif echo "$RESPONSE" | grep -q "error"; then
  echo "❌ TESTE FALHOU: Erro na resposta" | tee -a "$LOG_FILE"
  echo "❌ Data/hora: $TIMESTAMP" | tee -a "$LOG_FILE"
  exit 1
else
  echo "⚠️ TESTE INDETERMINADO: Resposta inesperada" | tee -a "$LOG_FILE"
  echo "⚠️ Data/hora: $TIMESTAMP" | tee -a "$LOG_FILE"
  exit 2
fi
