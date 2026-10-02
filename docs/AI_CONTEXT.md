# AI_CONTEXT.md — Manual de Entrada para LLMs/IDEs

> **LEIA ANTES DE ALTERAR QUALQUER CÓDIGO**
> Este documento é o ponto de entrada. A **fonte central de documentação
> técnica** é [TECHNICAL.md](TECHNICAL.md) — consulte-a para detalhes.

**Última atualização**: 2026-10-02
**Suíte de testes**: 420 testes / 31 arquivos (todos passando)

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
| AutoMod | `src/services/autoModEngine.ts` | Engine de moderação (detecção + ação) |
| Casino Classifier | `src/services/casinoClassifier.ts` | Classificador multi-sinal de cassino |
| Welcome | `src/services/welcomeService.ts` | Welcome por grupo + config de apresentação + comunidade |
| Apresentações | `src/services/presentationService.ts` | Sessões de apresentação (Comunidade 085) |
| Publisher | `src/services/presentationPublisher.ts` | Publicação no Telegram (espelho) |
| Member Join | `src/services/memberJoinService.ts` | Entrada de membro → welcome / ban-on-rejoin |
| Group Admin | `src/services/groupAdmin.ts` | **FONTE ÚNICA** de verificação de admin |
| Group IDs | `src/services/groupIds.ts` | `normGroupId` / `normUserId` |
| Permissions | `src/services/permissions.ts` | Proteção dono/bot (`isProtectedTarget`) |
| Infractions | `src/services/infractions.ts` | Registro de infrações |
| Logger | `src/services/loggerService.ts` | Winston estruturado |
| Database | `src/services/databaseService.ts` | SQLite (schema, migrações, config por grupo) |
| MemoryMonitor | `src/services/memoryMonitor.ts` | GC automático |
| TestServer | `src/services/testServer.ts` | Endpoints de laboratório |

---

## 4.1. Configuração de automações por grupo (LEIA ANTES DE MEXER)

Todas as flags vivem na tabela `group_mod` (SQLite) e são consultáveis por
`$automod status`.

**Regra de arquitetura:** todo recurso automático configurável começa
**DESLIGADO** em grupo novo. Grupos existentes nunca são resetados.

| Flag | Default | Controla |
|---|---|---|
| `antispam` | 0 | Anti-Spam |
| `antiestrangeiro` | 0 | Anti-Estrangeiro (DDI) |
| `autolink` | 0 | Anti-Link |
| `antibot` | 0 | Anti-Bot (≥2 sinais) |
| `casino` | 0 | Anti-Cassino |
| `remover` | 0 | Punição (banir/expulsar) |
| `detectar` | 0 | Anúncio no grupo |
| `audit_only` | 0 | Modo Auditoria (não age) |
| `bemvindo` | 0 | Boas-Vindas (serviço) |
| `presentation_enabled` | 0 | Apresentações (serviço) |

### Nomenclatura oficial (interface ↔ campo interno)

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

> **Não migrar o banco por estética.** Os campos históricos (`autolink`,
> `casino`, `remover`, `detectar`) permanecem internamente; só a interface e a
> documentação usam os nomes oficiais.

**⚠️ Armadilha:** `CREATE TABLE IF NOT EXISTS` **não altera** tabela existente.
Bancos antigos mantêm `DEFAULT 1` no DDL. Por isso o código **sempre** escreve as
colunas explicitamente em `0` ao criar uma linha — nunca confie no `DEFAULT`.

Ao adicionar uma flag nova:
1. Adicione em `GroupModConfig` e em `GROUP_MOD_FLAGS` (`databaseService.ts`).
2. Adicione em `GROUP_MOD_DEFAULTS` com `false`.
3. Adicione a migração `addColumnIfMissing`.
4. Adicione o comando em `modToggle.ts` (`ALIASES` + export + registro no index).
5. Se for automação de moderação, inclua em `MODERATION_FLAGS`.

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
6. **`quoted` no argumento errado** — `sendMessage(jid, content, { quoted })`; o `quoted` vai no **3º** argumento
7. **isSocketReady na v7** — usar `sock.ws.isOpen`; `sock.socket` não existe
8. **Race no handleClose** — `reconnectInProgress = true` ANTES do `setTimeout`
9. **Prefixo `wpp:` no group_mod** — usar `resolveGroupModKey()`, nunca comparação exata de JID
10. **LID tratado como telefone** — LID não carrega DDI; usar `participantAlt`/PN
11. **Double-count do AntiBot** — estrutura de mensagem = **UMA** categoria de sinal
12. **Admin auth no kick/ban** — usar `groupAdmin.ts`; nunca comparar `cleanId(LID)` com `cleanId(PN)`
13. **setwelcome no Relay InMemory** — persistir no SQLite; o Relay não é fonte de verdade
14. **Grupo novo com defaults ligados** — `GROUP_MOD_DEFAULTS` tudo `false` + escrita explícita de `0`
15. **setGroupModField ligando outras flags** — escrever **todas** as colunas ao criar a linha
16. **Casino/AntiBot sem flag própria** — cada automação tem sua coluna e seu comando

Detalhes completos (sintoma/causa/correção/teste) em
[TECHNICAL.md §26](TECHNICAL.md) e [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

---

## 10. Regras para LLMs/IDEs

**ANTES de alterar código**:
1. Ler este documento
2. Ler [TECHNICAL.md](TECHNICAL.md) — fonte central
3. Verificar `KNOWN_ISSUES.md` se o problema já foi resolvido
4. Verificar `TROUBLESHOOTING.md` para diagnóstico
5. Verificar `DECISIONS.md` para entender decisões arquiteturais

**NUNCA**:
- Editar `/etc/resolv.conf` manualmente (usar systemd-resolved)
- Usar `sock.store` (Baileys v7 não tem)
- Remover proteções de dono/bot/admin
- Comparar `cleanId()` para verificar admin (usar `groupAdmin.ts`)
- Confiar no `DEFAULT` do schema para defaults de aplicação
- Usar o Relay `InMemoryRepository` para dados que precisam persistir
- Criar endpoints temporários permanentes
- Assumir que hipótese é fato

**SEMPRE**:
- Validar com testes após mudanças
- Atualizar documentação quando arquitetura mudar
- Registrar bugs resolvidos em `KNOWN_ISSUES.md`
- Usar `isProtectedTarget()` antes de ações destrutivas
- Escrever todas as colunas ao criar uma linha de configuração

---

## 11. Contato e Recursos

- **Dono**: SolanoJr (558898314322)
- **Servidor**: `solanojr@100.101.218.16` (Ubuntu LXC, 2GB RAM)
- **Tailscale**: `ubuntu.tail8486e7.ts.net`
- **GitHub**: origin/main

---

**Última atualização**: 2026-09-16
**Versão do documento**: 1.0.0
