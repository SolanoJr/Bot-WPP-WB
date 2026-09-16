# Bot-WPP / WarriorBlack

> Bot multi-plataforma (WhatsApp, Telegram, Discord, Discord Screen Share).

**Última atualização**: 2026-09-16 17:15 BRT
**Commit**: a5d0419

---

## Visão Geral

Bot multi-plataforma com moderação automática, comandos unificados, e screen sharing via Discord Activity.

| Plataforma | Engine | Status |
|------------|--------|--------|
| WhatsApp | Baileys v7 RC14 | ✅ Produção |
| Telegram | Telegraf | ✅ Produção |
| Discord | discord.js | ✅ Produção |
| Screen Share | WebCodecs + WebSocket | ⚠️ Funcional (Web validado, Desktop não testado) |

---

## Estrutura do Projeto

```
src/
├── core/               # Entry point e orquestração (multiPlatform.ts)
├── platforms/          # Adapters por plataforma
│   ├── whatsapp/       # Baileys adapter
│   ├── telegram/       # Telegraf adapter
│   └── discord/        # discord.js adapter
├── services/           # Serviços compartilhados
│   ├── autoModEngine.ts    # Motor de moderação
│   ├── permissions.ts      # Proteções dono/bot/admin
│   ├── loggerService.ts    # Winston estruturado
│   ├── databaseService.ts  # SQLite (WAL)
│   └── testServer.ts       # HTTP endpoints de teste
└── bot/commands/       # ~70 comandos ($)

discord-screen/         # Screen sharing (projeto separado)
├── server/             # Express + WebSocket (porta 3002)
├── client/             # Vite + Discord Embedded App SDK
└── shared/             # WebRTC signaling

docs/                   # Documentação
├── AI_CONTEXT.md       # Manual de entrada para LLMs/IDEs
├── KNOWN_ISSUES.md     # Bugs conhecidos e resolvidos
├── ROADMAP.md          # Planejamento do projeto
├── CHANGELOG.md        # Linha do tempo temporal
├── ENDPOINTS.md        # Documentação dos endpoints HTTP
├── TELEMETRY.md        # Métricas do Screen Share
├── PENDING_TESTS.md    # Testes pendentes (Discord Web vs Desktop)
└── ARCHIVE/            # Documentação histórica

laboratorio/            # Scripts de teste/diagnóstico
└── ARCHIVE/            # Scripts antigos
```

---

## Configuração

### Pré-requisitos

- Node.js >= 20.x
- npm ou pnpm
- PM2 (para produção no Linux)

### Variáveis de Ambiente

Crie `.env` a partir de `.env.example`:

```bash
# WhatsApp
WPP_ENGINE=baileys
WPP_SESSIONS=558581344211  # opcional: multi-número CSV

# Discord
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=1307158493907652648
DISCORD_CLIENT_SECRET=***

# Telegram
TELEGRAM_BOT_TOKEN=...

# Screen Share
SESSION_SECRET=***  # 32+ chars hex
DISCORD_SCREEN_PORT=3002
DISCORD_SCREEN_PUBLIC_ORIGIN=https://ubuntu.tail8486e7.ts.net

# Banco
BOT_DATA_DIR=./data

# Identidades (usados por isProtectedTarget)
MASTER_USER=5588998314322@c.us
MASTER_LID=202658048684056
BOT_NUMBER=558581344211
BOT_LID=2592935567439
```

---

## Instalação

```bash
git clone https://github.com/SolanoJr/Bot-WPP-WB.git
cd bot-wpp
npm install
npm run build

# Screen Share (desenvolvimento)
cd discord-screen && npm install && cd ..
```

---

## Execução

### Produção (PM2 no Linux)

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 logs
```

Após atualizações:
```bash
pm2 restart bot-wpp
pm2 restart discord-screen
```

---

## Endpoints HTTP

| Servidor | Porta | Acesso |
|----------|-------|--------|
| TestServer | 3004 | Apenas localhost |
| Screen Share | 3002 | Público (Tailscale Funnel) |
| Prometheus | 3001 | Público |

Documentação completa em [docs/ENDPOINTS.md](docs/ENDPOINTS.md).

---

## Comandos

Prefixo: `$`

Exemplos: `$menu`, `$ban`, `$kick`, `$automod`, `$screen`, `$ping`, `$figurinhas`

---

## Proteções

O bot **NUNCA** executa ações contra:
- O próprio bot (`558581344211`)
- O dono (`5588998314322`)
- Administradores legítimos do grupo

---

## Monitoramento

- PM2: `pm2 status`, `pm2 logs`
- Logs: `~/.pm2/logs/bot-wpp-stable.out.log`
- Métricas Prometheus: `http://localhost:3001/metrics`
- Screen Share stats: `http://localhost:3002/lab/screen-stats`

---

## Documentação

| Arquivo | Descrição |
|---------|-----------|
| [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) | Manual de entrada para LLMs/IDEs |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Bugs conhecidos e resolvidos |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Diagnóstico de problemas |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisões arquiteturais |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planejamento do projeto |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Linha do tempo temporal |
| [docs/ENDPOINTS.md](docs/ENDPOINTS.md) | Documentação dos endpoints HTTP |
| [docs/TELEMETRY.md](docs/TELEMETRY.md) | Métricas do Screen Share |
| [docs/PENDING_TESTS.md](docs/PENDING_TESTS.md) | Testes pendentes (Discord Web vs Desktop) |

---

## Servidor de Produção

| Recurso | Valor |
|---------|-------|
| Host | `100.101.218.16` (Ubuntu LXC) |
| RAM | 2.0GB |
| Disco | 32GB |
| Tailscale | `ubuntu.tail8486e7.ts.net` |
| GitHub | `SolanoJr/Bot-WPP-WB` |

---

**Última atualização**: 2026-09-16 17:15 BRT
**Commit**: a5d0419
