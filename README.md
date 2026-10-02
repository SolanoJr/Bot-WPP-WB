# Bot-WPP / WarriorBlack

> Bot multi-plataforma (WhatsApp, Telegram, Discord, Discord Screen Share).

**Última atualização**: 2026-10-02
**Commit**: ce97635

---

## Visão Geral

Bot multi-plataforma com moderação automática, comandos unificados, automações
de grupo configuráveis por grupo (desligadas por padrão), sistema de welcome e
apresentações com espelho no Telegram, e screen sharing via Discord Activity.

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

Prefixo: `$` — 60 comandos primários (64 chaves, incluindo 4 aliases legados).

### AutoMod — detectores (admin/Master)

```
$automod status            # status geral de TODAS as automações
$automod on|off            # liga/desliga a moderação
$antispam on|off           $antilink on|off        (alias: $autolink)
$antibot on|off            $anticassino on|off     (alias: $casino)
$antiestrangeiro on|off
```

### AutoMod — ações / modo (admin/Master)

```
$punicao on|off            # bane/expulsa ao detectar   (alias: $remover)
$anuncio on|off            # anuncia a ação no grupo    (alias: $detectar)
$auditonly on|off          # modo auditoria (não executa ação)
```

### Automações (admin/Master)

```
$bemvindo on|off           # boas-vindas
$setwelcome [texto|reset]  # consulta / define / restaura
$apresentacao on|off|status
$apresentar                # qualquer membro: inicia sua apresentação
```

### Administração e utilitários

`$kick`, `$ban`, `$banidos`, `$mute`, `$desmute`, `$promover`, `$grupos`,
`$admin`, `$menu`, `$help`, `$ping`, `$alive`, `$stats`, `$info`, `$delete`,
`$cmdtoggle`, `$screen` e utilitários.

**Regra de arquitetura:** todo recurso automático configurável começa
**DESLIGADO** em grupo novo. Use `$automod status` para ver o estado do grupo.

---

## Nomenclatura oficial

| Conceito | Nome exibido | Comando | Alias legado | Campo interno |
|---|---|---|---|---|
| Anti-Spam | Anti-Spam | `$antispam` | — | `antispam` |
| Anti-Link | Anti-Link | `$antilink` | `$autolink` | `autolink` |
| Anti-Bot | Anti-Bot | `$antibot` | — | `antibot` |
| Anti-Cassino | Anti-Cassino | `$anticassino` | `$casino` | `casino` |
| Anti-Estrangeiro | Anti-Estrangeiro | `$antiestrangeiro` | — | `antiestrangeiro` |
| Punição | Punição (banir/expulsar) | `$punicao` | `$remover` | `remover` |
| Anúncio no grupo | Anúncio no grupo | `$anuncio` | `$detectar` | `detectar` |
| Modo Auditoria | Modo Auditoria | `$auditonly` | — | `audit_only` |
| Boas-Vindas | Boas-Vindas | `$bemvindo` | — | `bemvindo` |
| Apresentações | Apresentações | `$apresentacao` | — | `presentation_enabled` |

Os campos internos históricos **não** foram migrados por estética — só a
interface e a documentação usam os nomes oficiais.

**Significado das flags ambíguas:**

- `remover` → **Punição**: ban persistente + expulsão (só o antiestrangeiro a consulta).
- `detectar` → **Anúncio**: envia o aviso público no grupo. A detecção **sempre** ocorre.

---

## Automações de grupo

| Automação | Flag (`group_mod`) | Default | Comando |
|---|---|---|---|
| Anti-Spam | `antispam` | 0 | `$antispam on/off` |
| Anti-Link | `autolink` | 0 | `$antilink on/off` |
| Anti-Bot | `antibot` | 0 | `$antibot on/off` |
| Anti-Cassino | `casino` | 0 | `$anticassino on/off` |
| Anti-Estrangeiro | `antiestrangeiro` | 0 | `$antiestrangeiro on/off` |
| Punição | `remover` | 0 | `$punicao on/off` |
| Anúncio no grupo | `detectar` | 0 | `$anuncio on/off` |
| Modo Auditoria | `audit_only` | 0 | `$auditonly on/off` |
| Boas-Vindas | `bemvindo` | 0 | `$bemvindo on/off` |
| Apresentações | `presentation_enabled` | 0 | `$apresentacao on/off` |

Configuração persistida em SQLite (`group_mod`). Boas-Vindas e Apresentações são
**serviços** separados da moderação — `$automod on/off` não os altera.

---

## Apresentações (Comunidade 085)

Apresentações de membros dos grupos da Comunidade 085 são publicadas no tópico
**Apresentações** do grupo Telegram **Fortaleza 085**.

```
WhatsApp → PresentationSession → SQLite → consolidação → Telegram (thread 2)
```

| Item | Valor |
|---|---|
| chat_id | `-1003470059875` |
| thread_id | `2` |
| Link | https://t.me/Fortaleza_085/2 |

O SQLite é a **fonte oficial**; o Telegram é espelho. Requer grupo na Comunidade
085 **e** `$apresentacao on`.

---

## Proteções

O bot **NUNCA** executa ações contra:
- O próprio bot (`BOT_NUMBER` / `BOT_LID`)
- O MASTER (`MASTER_USER` / `MASTER_LID`)
- Administradores legítimos do grupo

Verificação centralizada em `src/services/groupAdmin.ts`.

---

## Monitoramento

- PM2: `pm2 status`, `pm2 logs`
- Logs: `~/.pm2/logs/bot-wpp-stable.out.log`
- Métricas Prometheus: `http://localhost:3001/metrics`
- Screen Share stats: `http://localhost:3002/lab/screen-stats`

---

## Documentação

**Fonte central:** [docs/TECHNICAL.md](docs/TECHNICAL.md) — arquitetura, AutoMod,
configuração por grupo, welcome, apresentações, bugs corrigidos e limitações.

| Arquivo | Descrição |
|---------|-----------|
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | **Documentação técnica central** |
| [docs/TESTING.md](docs/TESTING.md) | **Guia de testes: como rodar, camadas, alvos, limitações** |
| [docs/AI_CONTEXT.md](docs/AI_CONTEXT.md) | Manual de entrada para LLMs/IDEs |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Bugs conhecidos e resolvidos |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Diagnóstico de problemas |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisões arquiteturais |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planejamento do projeto |
| [CHANGELOG.md](CHANGELOG.md) | Linha do tempo temporal |
| [docs/ENDPOINTS.md](docs/ENDPOINTS.md) | Documentação dos endpoints HTTP |
| [docs/TELEMETRY.md](docs/TELEMETRY.md) | Métricas do Screen Share |
| [docs/PENDING_TESTS.md](docs/PENDING_TESTS.md) | Testes pendentes (Discord Web vs Desktop) |
| [docs/ARCHIVE/](docs/ARCHIVE/) | Documentação histórica |

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
