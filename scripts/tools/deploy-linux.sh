#!/bin/bash

# 🚀 SCRIPT DE DEPLOY SEGURO NO LINUX (atualizado para Baileys, sem Chromium)
# Para servidor: solanojr@100.101.218.16
# Fluxo: rsync do código -> npm ci -> build -> PM2 restart via ecosystem.config.js

set -euo pipefail

echo "🚀 Iniciando deploy seguro no servidor..."

# Variáveis
SERVER_USER="solanojr"
SERVER_IP="100.101.218.16"
PROJECT_DIR="/home/solanojr/bot-wpp"
BACKUP_DIR="/home/solanojr/backups"

# Criar backup antes de atualizar
echo "📦 Criando backup..."
ssh "$SERVER_USER@$SERVER_IP" "mkdir -p $BACKUP_DIR && cp -r $PROJECT_DIR $BACKUP_DIR/bot-wpp-$(date +%Y%m%d-%H%M%S)"

# Sincronizar arquivos (excluindo arquivos sensíveis e runtime)
echo "📤 Sincronizando arquivos..."
rsync -av --exclude='.env' \
          --exclude='data/' \
          --exclude='sessions/' \
          --exclude='logs/' \
          --exclude='node_modules/' \
          --exclude='.git/' \
          --exclude='dist/' \
          ./ "$SERVER_USER@$SERVER_IP:$PROJECT_DIR/"

# Instalar dependências e compilar no servidor
echo "📦 Instalando dependências e compilando..."
ssh "$SERVER_USER@$SERVER_IP" "cd $PROJECT_DIR && npm ci && npm run build"

# Reiniciar bot via PM2 (ecosystem.config.js — entry point dist/core/multiPlatform.js, engine Baileys)
echo "🛑 Reiniciando bot (PM2)..."
ssh "$SERVER_USER@$SERVER_IP" "cd $PROJECT_DIR && pm2 delete bot-wpp 2>/dev/null; pm2 start ecosystem.config.js && pm2 save"

echo "✅ Deploy concluído!"
echo "🔧 Verificar logs: ssh $SERVER_USER@$SERVER_IP 'pm2 logs bot-wpp'"
