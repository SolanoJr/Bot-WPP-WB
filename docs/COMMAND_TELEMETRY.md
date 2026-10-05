# Telemetria de comandos

Cada tentativa de comando é persistida em `command_usage_events`. O evento não
armazena o texto da mensagem. Ele contém o comando canônico, alias digitado,
plataforma, bot, chat, usuário, tipo de chat, resultado, decisão de permissão,
duração, correlação e código de erro não sensível.

`command_logs` permanece apenas para compatibilidade com o relatório legado.
Consultas novas devem usar `command_usage_events`.

O comando administrativo `$stats` mantém o resumo histórico em `command_logs`
e contabiliza eventos da tabela `feedback_events`, que é a fonte oficial do
fluxo de feedback de saída.

## Consulta local

```bash
npm run report:commands
npm run report:commands -- --by=platform
npm run report:commands -- --by=chat --limit=50
npm run report:commands -- --by=user
```

O relatório lê o mesmo banco apontado por `BOT_DATA_DIR` (ou `data/` por
padrão). IDs de usuário e chat são dados operacionais; não publique sua saída
em canais públicos.

## Retenção

No boot, eventos com mais de `COMMAND_USAGE_RETENTION_DAYS` dias são excluídos.
O padrão é 180 dias. Isso limita o crescimento do SQLite sem apagar os dados
operacionais recentes. Backups consistentes devem usar `sqlite3 .backup`, como
em `scripts/backup-db.sh`.
