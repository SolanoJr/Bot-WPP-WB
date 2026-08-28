#!/bin/bash

# Setup Automático - Bot WPP (Linux)
echo "🚀 Iniciando Setup do Bot WPP - Modo Elite"

# 1. Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instalando..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js: $(node -v)"
fi

# 2. Verificar Git
if ! command -v git &> /dev/null; then
    echo "❌ Git não encontrado. Instalando..."
    sudo apt-get update && sudo apt-get install -y git
else
    echo "✅ Git: $(git --version)"
fi

# 3. Instalar PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 Instalando PM2..."
    sudo npm install -g pm2
else
    echo "✅ PM2 detectado."
fi

# 4. Instalar Dependências (Bot)
echo "📦 Instalando dependências do Bot..."
npm install

# 5. Instalar Dependências (Relay)
if [ -d "relay" ]; then
    echo "📦 Instalando dependências do Relay..."
    cd relay && npm install && cd ..
fi

# 6. Verificar .env
if [ ! -f ".env" ]; then
    echo "⚠️ .env não encontrado! Criando a partir do .env.example..."
    cp .env.example .env
    echo "‼️ POR FAVOR, EDITE O ARQUIVO .env COM SUAS CHAVES AGORA!"
else
    echo "✅ Arquivo .env detectado."
fi

# 7. Permissões
chmod +x scripts/tools/*.sh 2>/dev/null || true

echo "🎉 Setup concluído com sucesso!"
echo "Para iniciar o bot use: pm2 start whatsapp.js --name bot-wpp"
