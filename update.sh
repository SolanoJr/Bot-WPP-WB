#!/bin/bash
# update.sh — Script de deploy para o servidor Linux
# Uso: ./update.sh [--no-build] [--no-restart] [--force]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Parse args
NO_BUILD=false
NO_RESTART=false
FORCE=false
for arg in "$@"; do
  case $arg in
    --no-build) NO_BUILD=true ;;
    --no-restart) NO_RESTART=true ;;
    --force) FORCE=true ;;
    *)
      warn "Argumento desconhecido: $arg"
      ;;
  esac
done

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
  error "Execute este script na raiz do projeto (onde está o package.json)"
fi

# Verificar se PM2 está instalado
if ! command -v pm2 &> /dev/null; then
  error "PM2 não está instalado. Execute: npm install -g pm2"
fi

echo "========================================"
echo "  Bot-WPP Deploy Script"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# 1. Git pull
log "Atualizando código..."
if [ "$FORCE" = true ]; then
  git fetch origin main
  git reset --hard origin/main
else
  git pull origin main
fi
log "Código atualizado"

# 2. Instalar dependências
log "Instalando dependências..."
npm ci 2>/dev/null || npm install
log "Dependências instaladas"

# 3. Build
if [ "$NO_BUILD" = false ]; then
  log "Compilando..."
  npm run build
  log "Build concluído"
else
  warn "Build ignorado (--no-build)"
fi

# 4. Testes rápidos
if [ "$NO_BUILD" = false ]; then
  log "Executando testes..."
  npm test 2>/dev/null && log "Testes passaram" || warn "Alguns testes falharam (veja acima)"
fi

# 5. Restart PM2
if [ "$NO_RESTART" = false ]; then
  log "Reiniciando processos PM2..."
  pm2 restart bot-wpp --update-env
  pm2 restart discord-screen --update-env
  pm2 save
  log "Processos reiniciados"
else
  warn "Restart ignorado (--no-restart)"
fi

# 6. Status
echo ""
echo "========================================"
echo "  Status:"
echo "========================================"
pm2 status
echo ""

# 7. Health check (5 segundos)
log "Health check..."
sleep 2
if curl -s http://localhost:3002/api/health > /dev/null 2>&1; then
  log "Screen Share: OK"
else
  warn "Screen Share: não respondeu"
fi

if curl -s http://localhost:3004/lab/stats > /dev/null 2>&1; then
  log "TestServer: OK"
else
  warn "TestServer: não respondeu"
fi

echo ""
log "Deploy concluído!"
