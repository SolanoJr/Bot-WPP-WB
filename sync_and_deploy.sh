#!/usr/bin/env bash

# ------------------------------------------------------------
#  Script de sincronização automática do bot no servidor Linux
#  - Faz pull do repositório remoto
#  - Instala dependências (npm ci) garantindo o lockfile
#  - Compila o projeto (npm run build)
#  - (Re)inicia o processo via PM2 (cria se ainda não existir)
# ------------------------------------------------------------

set -euo pipefail

REPO_DIR="$HOME/bot-wpp"
LOG_FILE="$REPO_DIR/sync_deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "=== Iniciando sincronização ==="

cd "$REPO_DIR"

log "Descartando alterações locais no package.json/package-lock.json/linux_maintenance.sh para evitar conflitos de git pull…"
git checkout -- package.json package-lock.json linux_maintenance.sh || true

log "Atualizando código…"
git pull origin main | tee -a "$LOG_FILE"

log "Instalando dependências (npm ci)…"
npm ci | tee -a "$LOG_FILE"

log "Compilando projeto (npm run build)…"
npm run build | tee -a "$LOG_FILE"

log "Reiniciando bot via PM2…"
# Para garantir que as alterações no ecosystem.config.js sejam aplicadas (como a mudança de script path),
# deletamos o processo antigo e iniciamos novamente a partir do arquivo de configuração do PM2.
if pm2 list | grep -q "bot-wpp"; then
  log "Deletando processo antigo do bot-wpp no PM2…"
  pm2 delete bot-wpp || true
fi

log "Iniciando bot-wpp a partir do ecosystem.config.js…"
pm2 start ecosystem.config.js

log "Salvando lista de processos do PM2…"
pm2 save || true

log "=== Sincronização concluída ==="
