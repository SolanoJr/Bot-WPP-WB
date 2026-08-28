#!/bin/bash

# ============================================
# Script de Setup: Prometheus + Grafana
# ============================================
# Usage: ./setup-monitoring.sh [start|stop|status|logs]

set -e

COMMAND=${1:-start}
DOCKER_COMPOSE="docker-compose"

echo "🚀 Bot-WPP Monitoring Setup"
echo "================================"

case $COMMAND in
  start)
    echo "📊 Iniciando stack de monitoramento..."
    $DOCKER_COMPOSE up -d
    
    echo ""
    echo "✅ Stack iniciado!"
    echo ""
    echo "📈 Acesse:"
    echo "   • Prometheus: http://localhost:9090"
    echo "   • Grafana: http://localhost:3100 (admin/admin)"
    echo "   • AlertManager: http://localhost:9093"
    echo "   • Métricas: http://localhost:3001/metrics"
    echo ""
    echo "⏳ Aguardando services ficarem saudáveis..."
    sleep 5
    $DOCKER_COMPOSE ps
    ;;
    
  stop)
    echo "🛑 Parando stack de monitoramento..."
    $DOCKER_COMPOSE down
    echo "✅ Stack parado"
    ;;
    
  status)
    echo "📊 Status do stack:"
    $DOCKER_COMPOSE ps
    ;;
    
  logs)
    SERVICE=${2:-bot-prometheus}
    echo "📋 Logs de $SERVICE (últimas 50 linhas):"
    $DOCKER_COMPOSE logs -f --tail=50 $SERVICE
    ;;
    
  clean)
    echo "🗑️  Removendo volumes de monitoramento..."
    read -p "Tem certeza? (s/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Ss]$ ]]; then
      $DOCKER_COMPOSE down -v
      echo "✅ Volumes removidos"
    else
      echo "❌ Operação cancelada"
    fi
    ;;
    
  test)
    echo "🧪 Testando conectividade..."
    
    echo ""
    echo "1️⃣ Testando Bot (porta 3001)..."
    curl -s http://localhost:3001/health | jq . && echo "✅ Bot respondendo" || echo "❌ Bot não respondendo"
    
    echo ""
    echo "2️⃣ Testando Prometheus (porta 9090)..."
    curl -s http://localhost:9090/-/healthy && echo "✅ Prometheus OK" || echo "❌ Prometheus offline"
    
    echo ""
    echo "3️⃣ Testando Grafana (porta 3100)..."
    curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/api/health
    echo ""
    echo "✅ Grafana OK" || echo "❌ Grafana offline"
    
    echo ""
    echo "4️⃣ Testando AlertManager (porta 9093)..."
    curl -s http://localhost:9093/-/healthy && echo "✅ AlertManager OK" || echo "❌ AlertManager offline"
    
    echo ""
    echo "5️⃣ Coletando uma métrica do Prometheus..."
    METRIC=$(curl -s "http://localhost:9090/api/v1/query?query=bot_active_platforms" | jq '.data.result[0].value[1]' 2>/dev/null)
    if [ "$METRIC" != "null" ] && [ ! -z "$METRIC" ]; then
      echo "✅ Métrica coletada: bot_active_platforms = $METRIC"
    else
      echo "⚠️  Métrica ainda não disponível (pode levar alguns segundos)"
    fi
    ;;
    
  *)
    echo "❌ Comando desconhecido: $COMMAND"
    echo ""
    echo "Uso: $0 [comando]"
    echo ""
    echo "Comandos disponíveis:"
    echo "  start     - Iniciar stack de monitoramento"
    echo "  stop      - Parar stack"
    echo "  status    - Ver status dos serviços"
    echo "  logs      - Ver logs (ex: $0 logs bot-prometheus)"
    echo "  test      - Testar conectividade de todos serviços"
    echo "  clean     - Remover volumes (CUIDADO!)"
    echo ""
    exit 1
    ;;
esac
