# Setup Automático - Bot WPP (Windows)
Write-Host "🚀 Iniciando Setup do Bot WPP - Modo Elite" -ForegroundColor Cyan

# 1. Verificar Node.js
try {
    $nodeVersion = node -v
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js não encontrado! Baixe em: https://nodejs.org/" -ForegroundColor Red
}

# 2. Verificar Git
try {
    $gitVersion = git --version
    Write-Host "✅ Git: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Git não encontrado! Baixe em: https://git-scm.com/" -ForegroundColor Red
}

# 3. Instalar Dependências (Bot)
Write-Host "📦 Instalando dependências do Bot..." -ForegroundColor Yellow
npm install

# 4. Instalar Dependências (Relay)
if (Test-Path "relay") {
    Write-Host "📦 Instalando dependências do Relay..." -ForegroundColor Yellow
    cd relay
    npm install
    cd ..
}

# 5. Verificar .env
if (!(Test-Path ".env")) {
    Write-Host "⚠️ .env não encontrado! Criando a partir do .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "‼️ POR FAVOR, EDITE O ARQUIVO .env COM SUAS CHAVES AGORA!" -ForegroundColor Magenta
} else {
    Write-Host "✅ Arquivo .env detectado." -ForegroundColor Green
}

Write-Host "`n🎉 Setup concluído com sucesso!" -ForegroundColor Cyan
Write-Host "Para iniciar o bot use: node whatsapp.js" -ForegroundColor White
