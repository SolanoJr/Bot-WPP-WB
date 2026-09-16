# AI_CONTEXT.md — Manual de Entrada para LLMs/IDEs

> **LEIA ANTES DE ALTERAR QUALQUER CÓDIGO**
> Este documento é a fonte primária de verdade sobre o projeto.

**Última atualização**: 2026-09-16 13:45 BRT
**Commit**: b9be3fb

---

## 1. O Que É o Projeto

**Bot-WPP / WarriorBlack** é um bot multi-plataforma (WhatsApp, Telegram, Discord, Discord Screen Share) com:
- Motor de moderação automática (AutoMod)
- Sistema de comandos unificado
- Relay de mensagens
- Screen sharing via Discord Activity
- Integração com IA (Gemini)

**Entry Point**: `src/core/multiPlatform.js` → `dist/core/multiPlatform.js`

**Plataformas Ativas**:
| Plataforma | Engine | Status |
|------------|--------|--------|
| WhatsApp | Baileys v7 RC14 | ✅ Produção |
| Telegram | Telegraf | ✅ Produção |
| Discord | discord.js | ✅ Produção |
| Screen Share | WebCodecs + WebSocket | ⚠️ Desenvolvimento |

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    PlatformManager (Singleton)                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐  │
│  │WhatsApp │ │Telegram │ │ Discord │ │  Screen Share   │  │
│  │(Baileys)│ │(Telegraf)│ │(d.js)  │ │ (WebCodecs+WS)  │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────────┬────────┘  │
│       └───────────┴───────────┴───────────────┘            │
│                           │                                  │
│              ┌────────────┴────────────┐                    │
│              │      Core Services       │                    │
│              │  (AutoMod, Permissions,  │                    │
│              │   Infractions, Logger)   │                    │
│              └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

**Estrutura de Diretórios**:
- `src/core/` — Entry point e orquestração
- `src/platforms/` — Adapters por plataforma
- `src/services/` — Serviços compartilhados
- `src/bot/commands/` — Comandos ($)
- `discord-screen/` — Screen sharing (projeto separado)
- `laboratorio/` — Scripts de teste/diagnóstico
- `tests/` — Testes unitários e integração
- `docs/` — Documentação

---

## 3. Plataformas

### WhatsApp (Baileys v7 RC14)
- **Arquivo**: `src/platforms/whatsapp/BaileysAdapter.ts`
- **Auth**: `sessions/558581344211/` (creds.json)
- **Eventos**: `ev.on('messages.upsert')`, `ev.on('messages.update')`
- **Store**: NÃO existe `sock.store` no Baileys v7

### Telegram (Telegraf)
- **Arquivo**: `src/platforms/telegram/TelegramAdapter.ts`
- **Token**: `TELEGRAM_BOT_TOKEN`
- **DNS fix**: Usa `127.0.0.53` (systemd-resolved stub)

### Discord (discord.js)
- **Arquivo**: `src/platforms/discord/DiscordAdapter.ts`
- **Token**: `DISCORD_BOT_TOKEN`
- **Intents**: Guilds, GuildMessages, MessageContent

### Discord Screen Share
- **Servidor**: `discord-screen/server/index.js` (porta 3002)
- **Client**: `discord-screen/client/src/main.js`
- **Activity**: Discord Embedded App SDK
- **Funnel**: Tailscale Funnel → `ubuntu.tail8486e7.ts.net`

---

## 4. Serviços Críticos

| Serviço | Arquivo | Responsabilidade |
|---------|---------|------------------|
| AutoMod | `src/services/autoModEngine.ts` | Moderação automática |
| Permissions | `src/services/permissions.ts` | Proteção dono/bot/admins |
| Infractions | `src/services/infractions.ts` | Registro de infrações |
| Logger | `src/services/loggerService.ts` | Winston estruturado |
| Database | `src/services/databaseService.ts` | SQLite (banco de dados) |
| MemoryMonitor | `src/services/memoryMonitor.ts` | GC automático |
| TestServer | `src/services/testServer.ts` | Endpoints de laboratório |

---

## 5. Proteções (NUNCA Ignorar)

### `isProtectedTarget(userId)`
**Arquivo**: `src/services/permissions.ts`

NUNCA executar ações negativas contra:
- **558581344211** (WarriorBlack — o bot)
- **558898314322@s.whatsapp.net** (SolanoJr — o dono)
- **202658048684056@lid** (LID do dono)
- **Qualquer admin do grupo**

```typescript
// Correto:
if (isProtectedTarget(senderJid)) {
  return { acted: false, reason: 'ID protegido' };
}
```

### AutoMod NUNCA age contra:
- Mensagens do próprio bot (`fromMe === true`)
- Números protegidos
- Administradores legítimos do grupo

---

## 6. Variáveis de Ambiente

| Variável | Onde | Descrição |
|----------|------|-----------|
| `DISCORD_CLIENT_ID` | .env | ID da aplicação Discord |
| `DISCORD_CLIENT_SECRET` | .env | Secret da aplicação |
| `DISCORD_BOT_TOKEN` | .env | Token do bot Discord |
| `TELEGRAM_BOT_TOKEN` | .env | Token do bot Telegram |
| `SESSION_SECRET` | .env | Segredo para JWT (32+ chars) |
| `DISCORD_SCREEN_PORT` | .env | Porta do screen server (3002) |
| `DISCORD_SCREEN_PUBLIC_ORIGIN` | .env | URL pública (Tailscale) |

---

## 7. Build e Execução

```bash
# Typecheck
npm run typecheck

# Build completo
npm run build

# Testes
npm test

# Produção (PM2)
pm2 start ecosystem.config.js
pm2 logs
```

---

## 8. Troubleshooting Rápido

| Sintoma | Causa Provável | Solução |
|---------|----------------|---------|
| `EAI_AGAIN discord.com` | DNS falhou | Verificar `/etc/resolv.conf` → symlink para systemd-resolved |
| `sock.store is not a function` | Baileys v7 não tem store | Usar `authState.creds` em vez de store |
| `fromMe` errado | Cálculo de fromMe | Verificar `areJisSameUser()` |
| Loop infinito AutoMod | Mensagem do bot reprocessada | Filtrar `fromMe === true` no normalizer |
| Screen share não abre | Tailscale Funnel | Verificar `tailscale funnel status` |

---

## 9. Bugs Já Resolvidos (NÃO Reintroduzir)

1. **DNS EAI_AGAIN** — `/etc/resolv.conf` deve ser symlink para `/run/systemd/resolve/stub-resolv.conf`
2. **Baileys v7 sem store** — NÃO usar `sock.store`, usar `authState`
3. **Loop AutoMod** — Filtrar `fromMe === true` no normalizer
4. **WAMessageKey truncada** — Preservar key completa na cadeia de delete
5. **Admin sofrendo ação** — Verificar `isProtectedTarget()` antes de qualquer ação

---

## 10. Regras para LLMs/IDEs

**ANTES de alterar código**:
1. Ler este documento
2. Verificar `KNOWN_ISSUES.md` se o problema já foi resolvido
3. Verificar `TROUBLESHOOTING.md` para diagnóstico
4. Verificar `DECISIONS.md` para entender decisões arquiteturais

**NUNCA**:
- Editar `/etc/resolv.conf` manualmente (usar systemd-resolved)
- Usar `sock.store` (Baileys v7 não tem)
- Remover proteções de dono/bot/admin
- Criar endpoints temporários permanentes
- Assumir que hipótese é fato

**SEMPRE**:
- Validar com testes após mudanças
- Atualizar documentação quando arquitetura mudar
- Registrar bugs resolvidos em `KNOWN_ISSUES.md`
- Usar `isProtectedTarget()` antes de ações destrutivas

---

## 11. Contato e Recursos

- **Dono**: SolanoJr (558898314322)
- **Servidor**: `solanojr@100.101.218.16` (Ubuntu LXC, 2GB RAM)
- **Tailscale**: `ubuntu.tail8486e7.ts.net`
- **GitHub**: origin/main

---

**Última atualização**: 2026-09-16
**Versão do documento**: 1.0.0
