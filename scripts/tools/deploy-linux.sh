#!/bin/bash

# 🚀 SCRIPT DE DEPLOY SEGURO NO LINUX
# Para servidor: solanojr@100.101.218.16

echo "🚀 Iniciando deploy seguro no servidor..."

# Variáveis
SERVER_USER="solanojr"
SERVER_IP="100.101.218.16"
PROJECT_DIR="/home/solanojr/bot-wpp"
BACKUP_DIR="/home/solanojr/backups"

# Criar backup antes de atualizar
echo "📦 Criando backup..."
ssh $SERVER_USER@$SERVER_IP "mkdir -p $BACKUP_DIR && cp -r $PROJECT_DIR $BACKUP_DIR/bot-wpp-$(date +%Y%m%d-%H%M%S)"

# Sincronizar arquivos (excluindo arquivos sensíveis)
echo "📤 Sincronizando arquivos..."
rsync -av --exclude='.env' \
          --exclude='data/' \
          --exclude='.wwebjs_auth/' \
          --exclude='node_modules/' \
          --exclude='.git/' \
          ./ $SERVER_USER@$SERVER_IP:$PROJECT_DIR/

# Instalar dependências se necessário
echo "📦 Verificando dependências..."
ssh $SERVER_USER@$SERVER_IP "cd $PROJECT_DIR && npm install --production"

# Parar bot se estiver rodando
echo "🛑 Parando bot atual..."
ssh $SERVER_USER@$SERVER_IP "pkill -f 'node.*whatsapp' || echo 'Bot não estava rodando'"

# Esperar 2 segundos
sleep 2

# Iniciar bot com QR Code limitado
echo "📱 Iniciando bot com QR Code limitado..."
ssh $SERVER_USER@$SERVER_IP "cd $PROJECT_DIR && node start-qr.js"

echo "✅ Deploy concluído!"
echo "📱 Verifique o QR Code no terminal do servidor"
echo "🔧 Se precisar reiniciar: ssh $SERVER_USER@$SERVER_IP 'cd $PROJECT_DIR && node start-qr.js'"
