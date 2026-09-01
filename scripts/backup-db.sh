#!/bin/bash
# 💾 Backup Automático do Banco de Dados SQLite
# 
# Cria backup incremental do bot_database.db com timestamp
# Mantém apenas os últimos 7 backups (rotação automática)
# 
# Uso:
#   ./scripts/backup-db.sh
#   
# Cron (diário às 3h da manhã):
#   0 3 * * * cd /home/solanojr/bot-wpp && bash scripts/backup-db.sh >> logs/backup.log 2>&1

set -e

# Configuração
DB_FILE="data/bot_database.db"
BACKUP_DIR="data/backups"
MAX_BACKUPS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/bot_database_${TIMESTAMP}.db"

echo "💾 [Backup] Iniciando backup do banco de dados..."
echo "   Data: $(date)"

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

# Verificar se banco existe
if [ ! -f "$DB_FILE" ]; then
  echo "❌ [Backup] Erro: Banco de dados não encontrado: $DB_FILE"
  exit 1
fi

# Obter tamanho do banco
DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "   Tamanho: $DB_SIZE"

# Fazer backup usando SQLite3 (garante consistência)
if command -v sqlite3 &> /dev/null; then
  echo "   Método: sqlite3 .backup"
  sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
else
  # Fallback: cp simples (menos seguro, mas funciona)
  echo "   Método: cp (sqlite3 não disponível)"
  cp "$DB_FILE" "$BACKUP_FILE"
fi

# Verificar se backup foi criado
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ [Backup] Erro: Falha ao criar backup"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ [Backup] Backup criado com sucesso!"
echo "   Arquivo: $BACKUP_FILE"
echo "   Tamanho: $BACKUP_SIZE"

# Rotação: manter apenas os últimos N backups
echo ""
echo "🔄 [Backup] Rotação de backups (mantendo últimos $MAX_BACKUPS)..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/bot_database_*.db 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  EXCESS=$((BACKUP_COUNT - MAX_BACKUPS))
  echo "   Removendo $EXCESS backup(s) antigo(s)..."
  
  ls -1t "$BACKUP_DIR"/bot_database_*.db | tail -n "$EXCESS" | while read -r old_backup; do
    echo "   - Removendo: $(basename "$old_backup")"
    rm -f "$old_backup"
  done
fi

# Listar backups atuais
echo ""
echo "📋 [Backup] Backups disponíveis:"
ls -lht "$BACKUP_DIR"/bot_database_*.db 2>/dev/null | awk '{print "   - " $9 " (" $5 ", " $6 " " $7 " " $8 ")"}'

echo ""
echo "✅ [Backup] Concluído com sucesso!"
echo "   Total de backups: $(ls -1 "$BACKUP_DIR"/bot_database_*.db 2>/dev/null | wc -l)"
