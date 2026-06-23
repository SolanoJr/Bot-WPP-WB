#!/usr/bin/env bash

# ------------------------------------------------------------
#  Script de Manutenção e Diagnóstico para o Bot-WPP no Linux
#  - Atualiza o código do repositório
#  - Instala dependências e compila o projeto
#  - Verifica e (re)inicia o processo via PM2
#  - Realiza verificações de saúde do sistema
#  - Verifica variáveis de ambiente críticas
# ------------------------------------------------------------

set -euo pipefail

REPO_DIR="$HOME/bot-wpp"
LOG_FILE="$REPO_DIR/maintenance_log.log"

log() {
  echo "[$(date 
'+%Y-%m-%d %H:%M:%S
')] $*" | tee -a "$LOG_FILE"
}

error_exit() {
  log "ERRO: $*"
  exit 1
}

log "=== Iniciando rotina de manutenção e diagnóstico ==="

# 1. Navegar para o diretório do repositório
if [ ! -d "$REPO_DIR" ]; then
  error_exit "Diretório do repositório não encontrado: $REPO_DIR. Certifique-se de que o bot-wpp está clonado em $HOME/bot-wpp."
fi
cd "$REPO_DIR" || error_exit "Falha ao navegar para o diretório $REPO_DIR."

# 2. Atualizar código do repositório
log "Atualizando código do repositório (git pull)…"
if git pull origin main | tee -a "$LOG_FILE"; then
  log "Código atualizado com sucesso."
else
  error_exit "Falha ao atualizar o código do repositório."
fi

# 3. Instalar dependências
log "Instalando dependências (npm ci)…"
if npm ci | tee -a "$LOG_FILE"; then
  log "Dependências instaladas/atualizadas com sucesso."
else
  error_exit "Falha ao instalar dependências. Verifique o npm e o package-lock.json."
fi

# 4. Compilar o projeto
log "Compilando projeto (npm run build)…"
if npm run build | tee -a "$LOG_FILE"; then
  log "Projeto compilado com sucesso."
else
  error_exit "Falha ao compilar o projeto. Verifique erros de TypeScript."
fi

# 5. Verificar e (re)iniciar o bot via PM2
log "Verificando e reiniciando o bot via PM2…"
if pm2 list | grep -q "bot-wpp"; then
  log "Processo 'bot-wpp' encontrado. Reiniciando…"
  pm2 restart bot-wpp || error_exit "Falha ao reiniciar 'bot-wpp' via PM2."
else
  log "Processo 'bot-wpp' não encontrado. Iniciando…"
  pm2 start ecosystem.config.js || error_exit "Falha ao iniciar 'bot-wpp' via PM2."
fi
pm2 save || log "Aviso: Falha ao salvar configuração do PM2."
log "Bot-wpp gerenciado pelo PM2 com sucesso."

# 6. Verificações de saúde do sistema
log "Realizando verificações de saúde do sistema…"
log "- Uso de Disco:"
df -h . | tee -a "$LOG_FILE"
log "- Uso de Memória:"
free -h | tee -a "$LOG_FILE"
log "- Carga da CPU:"
uptime | tee -a "$LOG_FILE"

# 7. Verificar variáveis de ambiente críticas
log "Verificando variáveis de ambiente críticas…"
CRITICAL_VARS=("MASTER_USER" "GEMINI_API_KEY" "WARRIOR_AUTH_KEY" "RELAY_URL")
for var in "${CRITICAL_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    log "⚠️  AVISO: Variável de ambiente crítica não definida: $var"
  else
    log "✅ Variável de ambiente $var definida."
  fi
done

log "=== Rotina de manutenção e diagnóstico concluída com sucesso ==="
log "Para ver os logs do bot, use: pm2 logs bot-wpp --lines 100"
