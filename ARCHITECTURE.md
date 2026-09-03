# Arquitetura do Bot-WPP

## Visão Geral

O Bot-WPP é um sistema distribuído multi-plataforma (WhatsApp, Telegram, Discord, Screen Share) com arquitetura unificada.

---

## Estado Atual (2026-09-03 — ATUAL)

✅ **Sistema multi-plataforma (`PlatformManager` + adapters) É o ativo e funciona.**

- **Entry Point**: `dist/core/multiPlatform.js` (PM2 via `ecosystem.config.js`)
- **Engine WhatsApp**: **Baileys** (`@whiskeysockets/baileys` v7) — WebSocket puro, **sem Chromium**. O fallback WWebJS/Chromium foi **removido** (BUG 39).
- **Plataformas ativas**: WhatsApp (Baileys), Telegram, Discord, **Discord Screen Share (Activity)**
- **Comandos**: ~70 registrados, assinatura unificada `execute(ctx: CommandContext)`, prefixo `$`

---

## Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Bot-WPP Multi-Platform                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    PlatformManager (Singleton)                 │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │   │
│  │  │  WhatsApp   │ │  Telegram   │ │  Discord    │ │ Screen  │ │   │
│  │  │  (Baileys)  │ │  (Telegraf) │ │ (discord.js)│ │ Share   │ │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └────┬────┘ │   │
│  │         │               │               │            │      │   │
│  │         └───────────────┼───────────────┼────────────┘      │   │
│  │                         ▼               ▼                   │   │
│  │              ┌─────────────────────────────────────────┐    │   │
│  │              │         Command Registry (~70 cmds)      │    │   │
│  │              │  $screen, $menu, $ping, $ban, $kick, ... │    │   │
│  │              └─────────────────────────────────────────┘    │   │
│  │                         │                                    │   │
│  │              ┌──────────▼──────────┐ ┌──────────────────┐   │   │
│  │              │    AutoMod Engine   │ │  Rate Limiter    │   │   │
│  │              │  (antiestrangeiro,  │ │  (20 cmd/min)    │   │   │
│  │              │   remover, autolink, │ └──────────────────┘   │   │
│  │              │   antispam, detectar)│                      │   │
│  │              └─────────────────────┘                        │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐        ┌─────┴─────┐       ┌─────┴─────┐
    │WhatsApp │        │ Telegram  │       │ Discord   │
    │(Baileys)│        │ (Telegraf)│       │+Screen    │
    └─────────┘        └───────────┘       │  (Activity)│
                                           └───────────┘
```

---

## Componentes Principais

### 1. Core (`src/core/`)

| Arquivo | Função |
|---------|--------|
| `multiPlatform.ts` | **Entry point PM2**. Inicializa PlatformManager, carrega comandos, registra adapters (WhatsApp/Telegram/Discord/Screen), inicia métricas Prometheus (porta 3001), testServer (3004), graceful shutdown. |
| `index.ts` | Compartilhado (legacy compat) — não é entry point. |

### 2. Platforms (`src/platforms/`)

| Adapter | Engine | Arquivo principal | Porta |
|---------|--------|-------------------|-------|
| **WhatsApp** | Baileys v7 (WebSocket) | `BaileysAdapter.ts` | — |
| **Telegram** | Telegraf v4 | `TelegramAdapter.ts` | — |
| **Discord** | discord.js v14 | `DiscordAdapter.ts` | — |
| **Screen Share** | Express + WebRTC | `discord-screen/server/index.js` | 3001 |

**Interface unificada**: `PlatformTypes.ts` define `PlatformMessage`, `PlatformClient`, `PlatformAdapter`, `CommandContext`, `SendOptions`, `MediaPayload`.

### 3. Bot Commands (`src/bot/commands/`)

- **~70 comandos** registrados via `loadCommands()` → `Map<string, ICommand>`
- Prefixo unificado: `$`
- Assinatura: `execute(ctx: CommandContext)` — **padronizada** (BUG 47)
- Categorias: Admin, Moderação, Utilidades, Jogos, IA, Screen Share, etc.
- Rate limiting: 20 comandos/min por usuário

### 4. AutoMod Engine (`src/services/autoModEngine.ts`)

**Ativo no Baileys** (fire-and-forget, não bloqueia comandos).

| Flag (`group_mod`) | Gatilho | Ação |
|---|---|---|
| `antiestrangeiro` | DDI ≠ 55 | Ban persistente + remove + delete + announce |
| `remover` (antibot) | ≥2 sinais (foreign + link suspeito + nome suspeito + interativo + repetido) | Ban + remove + delete + announce |
| `autolink` | Domínio suspeito | Delete + announce |
| `antispam` | Keyword spam + contexto | Delete + announce |
| `detectar` | Anuncia ações | Toggle |
| `remover` | Habilita antibot | Toggle |

**Proteções**: `isProtectedTarget()` bloqueia ações sobre BOT e DONO (comparação exata de IDs).

### 5. Discord Screen Share (Activity) — **NOVO**

| Componente | Local | Função |
|---|---|---|
| **Server** | `discord-screen/server/index.js` | Express + WebSocket (porta 3001), OAuth2 Discord, salas WebRTC, admin dashboard |
| **Client** | `discord-screen/client/` | Vite + React-like vanilla, `@discord/embedded-app-sdk`, captura tela via `getDisplayMedia` |
| **Shared** | `discord-screen/shared/` | WebRTC signaling, broadcaster, tokens JWT |
| **Comando** | `$screen` | Cria sessão guest → sala → retorna links Transmitir/Assistir |
| **PM2** | `discord-screen` | Porta 3001, logs dedicados, auto-restart |

**Fluxo no Discord**:
1. Usuário entra em call de voz → clica no foguete 🚀 → Activity "Sala de Tela"
2. Ou usa `$screen` no WhatsApp → recebe links **Transmitir** (broadcaster) e **Assistir** (viewer)
3. Chrome/Edge recomendado (captura aba com áudio)

---

## Serviços Compartilhados (`src/services/`)

| Serviço | Função |
|---|---|
| `autoModEngine.ts` | Motor de moderação (ativo no Baileys) |
| `memberJoinService.ts` | Entrada de participantes (ban persistente, anti-bot, welcome) |
| `permissions.ts` | MASTER/ADMIN/USER, `isProtectedTarget`, `getOwnerNotifyTarget` |
| `databaseService.ts` | SQLite (WAL) — banned_users, group_mod, mod_member_joins, mod_msg_fingerprints, infractions, command_logs |
| `loggerService.ts` | Winston (console + combined.log + error.log + commands.jsonl + platforms.jsonl) |
| `metricsService.ts` | Prometheus (porta 3001: `/metrics`, `/health`) |
| `discord-screen/DiscordScreenService.ts` | Wrapper para processo filho do screen server |
| `testServer.ts` | HTTP :3004 (POST /test para injeção de comandos) |
| `cleanupService.ts` | Limpeza periódica (6h) |
| `memoryMonitor.ts` | Monitoramento de memória (60s) |
| `cleanupService.ts` | Limpeza periódica (6h) |
| `keywordHandler.ts` | Sarcasmo/keywords ("bot", "removeu você do grupo") |
| `sessionManager.ts` | Multi-número WhatsApp (WPP_SESSIONS CSV) |

---

## Banco de Dados (SQLite + WAL)

| Tabela | Função |
|---|---|
| `command_logs` | Auditoria de comandos executados |
| `banned_users` | Ban persistente (user_id + group_id único) |
| `group_mod` | Config AutoMod por grupo (flags booleanas) |
| `mod_member_joins` | Audit trail entrada/saída (joined_at, left_at, reason) |
| `mod_msg_fingerprints` | Anti-spam (fingerprint + count + janela 60s) |
| `infractions` | Contador de infrações por usuário/grupo |

---

## Fluxo de Mensagem (WhatsApp/Baileys)

```
Baileys WebSocket
    │
    ├─ sock.ev.on('messages.upsert')  [notify|append]
    │       │
    │       └─ dispatchMessage(msg)  →  PlatformMessage
    │           ├─ normId/toJid (IDs preservam @lid/@c.us/@g.us)
    │           ├─ Extrai: text, mentions, quoted, media
    │           └─ msgHandler(platformMsg)  →  PlatformManager
    │
    ├─ PlatformManager.onMessage
    │       ├─ enrichMessage (prefixa wpp:/tg:/dc:)
    │       ├─ Detecta comando ($prefix)
    │       ├─ messageHandlers globais (telemetria)
    │       └─ Se comando: executeCommand → CommandContext → command.execute(ctx)
    │
    └─ AUTO-MOD (fire-and-forget, não bloqueia)
            └─ autoModEngine.evaluate(msg, ctx, groupId, senderJid, senderName)
                ├─ getGroupMod(config)
                ├─ Regras em ordem: antiestrangeiro → remover → autolink → antispam
                ├─ Ban persistente (banned_users) + removeParticipant + delete + announce
                └─ detectar flag → anuncia no grupo
```

---

## Monitoramento e Observabilidade

| Componente | Endpoint/Porta | Detalhes |
|---|---|---|
| **Prometheus** | `:3001/metrics` | Counters, Gauges, Histograms (cmds, msgs, latência, memória, GC) |
| **Healthcheck** | `:3001/health` | Heap %, WPP status, plataformas conectadas |
| **TestServer** | `:3004` | `POST /test {platform, command}` injeta comandos |
| **Logs PM2** | `~/.pm2/logs/bot-wpp-stable.out.log` | Timestamp prefixado, merge_logs |
| **Logs App** | `logs/` | combined.log, error.log, commands.jsonl, platforms.jsonl |
| **Screen Logs** | `~/.pm2/logs/discord-screen-stable.out.log` | Logs dedicados do screen server |

---

## Scripts de Deploy

| Script | Função |
|---|---|
| `sync_and_deploy.sh` | `git pull` → `npm ci` (bot + screen) → `npm run build` → `pm2 delete/start ecosystem.config.js` → `pm2 save` |
| `ecosystem.config.js` | PM2: `bot-wpp` (porta —) + `discord-screen` (porta 3001) |
| `package.json` scripts | `screen:install`, `screen:build`, `screen:dev`, `screen:start`, `screen:tunel`, `screen:tunel:criar`, `screen:configurar` |

---

## Variáveis de Ambiente Críticas (`.env`)

```bash
# WhatsApp
WPP_ENGINE=baileys
WPP_SESSIONS=558581344211  # opcional: multi-número CSV

# Discord
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=1307158493907652648
DISCORD_CLIENT_SECRET=***
DISCORD_ADMIN_ID=1307158493907652648

# Screen Share (Activity)
SESSION_SECRET=***  # 32+ chars hex
DISCORD_SCREEN_PORT=3001
DISCORD_SCREEN_PUBLIC_ORIGIN=https://seu-dominio.pages.dev
DISCORD_ADMIN_ID=1307158493907652648

# Telegram
TELEGRAM_BOT_TOKEN=...

# Banco
BOT_DATA_DIR=/home/solanojr/bot-wpp/data

# Segurança
MASTER_USER=5588998314322@c.us
MASTER_LID=202658048684056
BOT_NUMBER=558581344211
BOT_LID=2592935567439
```

---

## Documentação Relacionada

| Arquivo | Conteúdo |
|---|---|
| `ARCHITECTURE_FIXES.md` | 10 regras anti-regressão (lid, startAll paralelo, AutoMod desacoplado, multi-sessão) |
| `BUG_TRACKER.md` | Histórico de bugs (BUG 1-47) |
| `CHANGELOG.md` | Versões v1.0.0 → v1.3.0+ |
| `TODO.md` | Pendências atuais |
| `SCREEN_SHARING.md` | Detalhes do Discord Screen Share |
| `MONITORING_GUIDE.md` | Prometheus + Grafana setup |
| `laboratorio/README.md` | Auto-teste (`WPP_AUTOSELFTEST=1`), testServer HTTP :3004 |

---

## Próximos Passos (Pendências `TODO.md`)

- [ ] Remover `src/services/autoModService.ts` (WWebJS legado — confirmar se não há imports)
- [ ] Consolidar `docs/ARCHITECTURE_FIXES.md` → `AGENTS.md` ou remover
- [ ] `dns.setServers` no `multiPlatform.ts` — documentar ou remover (inefetivo para axios)
- [ ] Documentar limitação `$sendmsg` (só Baileys tem `getNumberId`)
- [ ] Configurar tunnel fixo Cloudflare para Screen Share em produção

---

*Última atualização: 2026-09-03 — Commit `526a30a` (feat: integra discord-screen como Discord Activity)*