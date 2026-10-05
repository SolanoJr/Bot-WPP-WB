# TECHNICAL.md — Documentação Técnica Central do Bot-WPP / WarriorBlack

> **FONTE CENTRAL de documentação técnica.** Se outro documento contradizer
> este, o código-fonte prevalece — e este arquivo deve ser corrigido.
>
> **Última atualização**: 2026-10-02
> **Suíte de testes**: 509 testes / 35 arquivos (todos passando)

---

## Índice

1. [O que é o WarriorBlack](#1-o-que-é-o-warriorblack)
2. [Plataformas suportadas](#2-plataformas-suportadas)
3. [Arquitetura geral](#3-arquitetura-geral)
4. [PlatformManager e Adapters](#4-platformmanager-e-adapters)
5. [Fluxo de mensagens entre plataformas](#5-fluxo-de-mensagens-entre-plataformas)
6. [AutoMod — engine de moderação](#6-automod--engine-de-moderação)
7. [Configuração por grupo](#7-configuração-por-grupo)
8. [Automações de grupo (visão completa)](#8-automações-de-grupo-visão-completa)
9. [Sistema de Welcome](#9-sistema-de-welcome)
10. [Sistema de Apresentações](#10-sistema-de-apresentações)
11. [Comunidade 085](#11-comunidade-085)
12. [Telegram Fortaleza 085 / tópico Apresentações](#12-telegram-fortaleza-085--tópico-apresentações)
13. [Persistência SQLite](#13-persistência-sqlite)
14. [Sessões de apresentação](#14-sessões-de-apresentação)
15. [Histórico/sincronização de mensagens WhatsApp](#15-históricosincronização-de-mensagens-whatsapp)
16. [Delete / ban / remove](#16-delete--ban--remove)
17. [Proteção de admins/Master](#17-proteção-de-adminsmaster)
18. [LID ↔ PN](#18-lid--pn)
19. [Reconnect do WhatsApp](#19-reconnect-do-whatsapp)
20. [Comandos administrativos](#20-comandos-administrativos)
21. [Testes](#21-testes)
22. [Build](#22-build)
23. [Laboratório / E2E](#23-laboratório--e2e)
24. [Estado atual do projeto](#24-estado-atual-do-projeto)
25. [Decisões arquiteturais](#25-decisões-arquiteturais)
26. [Histórico de bugs importantes corrigidos](#26-histórico-de-bugs-importantes-corrigidos)
27. [Limitações conhecidas](#27-limitações-conhecidas)

---

## 1. O que é o WarriorBlack

**Bot-WPP / WarriorBlack** é um bot multi-plataforma (WhatsApp, Telegram, Discord)
com moderação automática, comandos unificados (`$`) e automações de grupo.

| Item | Valor |
|---|---|
| Entry point | `src/core/multiPlatform.ts` → `dist/core/multiPlatform.js` |
| Comando | `npm run bot:start` |
| Linguagem | TypeScript (ESM) |
| Banco | SQLite (`data/bot_database.db`) |
| Processo | PM2 (`ecosystem.config.js`) |
| Repositório | `SolanoJr/Bot-WPP-WB` |

**Objetivo**: um único bot que opera em três plataformas, com um motor de
moderação compartilhado e configuração persistente por grupo.

---

## 2. Plataformas suportadas

| Plataforma | Engine | Arquivo do adapter | Status |
|---|---|---|---|
| WhatsApp | Baileys v7 RC14 | `src/platforms/whatsapp/BaileysAdapter.ts` | ✅ Produção |
| Telegram | Telegraf | `src/platforms/telegram/TelegramAdapter.ts` | ✅ Produção |
| Discord | discord.js | `src/platforms/discord/DiscordAdapter.ts` | ✅ Produção |
| Screen Share | WebCodecs + WebSocket | `discord-screen/` | ⚠️ Web validado, Desktop não testado |

### Limitação importante de plataforma

`getChat()` só devolve `participants` (com `isAdmin`/`isSuperAdmin`) no
**WhatsApp/Baileys**. Telegram e Discord retornam `participants: []`.

**Consequência:** `$kick` e `$ban` **não funcionam** em Telegram/Discord — a
verificação de admin falha e o comando recusa. Isso é intencional: melhor
recusar do que agir sem verificar permissão.

---

## 3. Arquitetura geral

```
┌──────────────────────────────────────────────────────────────────┐
│                    PlatformManager (singleton)                    │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│   │ WhatsApp │  │ Telegram │  │ Discord  │  │ Screen Share  │   │
│   │ (Baileys)│  │(Telegraf)│  │ (d.js)   │  │ (WebCodecs)   │   │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────────────┘   │
│        └─────────────┴─────────────┘                             │
│                      │                                            │
│        ┌─────────────┴──────────────┐                            │
│        │      Group Automation      │  ← CONFIGURAÇÃO CENTRAL     │
│        │      (group_mod, SQLite)   │                            │
│        └─────────────┬──────────────┘                            │
│                      │                                            │
│   ┌──────────────────┼──────────────────┐                        │
│   │                  │                  │                        │
│   ▼                  ▼                  ▼                        │
│ Moderation      WelcomeService    PresentationService            │
│ Engine          (bemvindo)        (presentation_enabled)         │
│ ├ antispam                                                        │
│ ├ antiestrangeiro                                                 │
│ ├ autolink                                                        │
│ ├ antibot                                                         │
│ ├ casino                                                          │
│ ├ remover / detectar                                              │
│ └ audit_only                                                      │
└──────────────────────────────────────────────────────────────────┘
```

**Princípio de arquitetura:** a *lógica* é separada por serviço (engine de
detecção ≠ welcome ≠ apresentações), mas a *configuração* é centralizada na
tabela `group_mod` e consultável de forma consistente via `$automod status`.

### Estrutura de diretórios

```
src/
├── core/multiPlatform.ts        # Entry point, orquestração, timers
├── platforms/
│   ├── PlatformManager.ts       # Registro de adapters + despacho de comandos
│   ├── base/PlatformTypes.ts    # Interfaces (SendOptions, PlatformChat…)
│   ├── whatsapp/                # BaileysAdapter + submódulos baileys/
│   ├── telegram/                # TelegramAdapter
│   └── discord/                 # DiscordAdapter
├── services/
│   ├── autoModEngine.ts         # Engine de moderação (detecção + ação)
│   ├── casinoClassifier.ts      # Classificador multi-sinal de cassino
│   ├── welcomeService.ts        # Welcome + config de apresentação + comunidade
│   ├── presentationService.ts   # Sessões de apresentação
│   ├── presentationPublisher.ts # Publicação no Telegram (espelho)
│   ├── memberJoinService.ts     # Entrada de membro → welcome / ban-on-rejoin
│   ├── groupAdmin.ts            # FONTE ÚNICA de verificação de admin
│   ├── groupIds.ts              # normGroupId / normUserId
│   ├── databaseService.ts       # SQLite: schema, migrações, config por grupo
│   ├── permissions.ts           # isProtectedTarget (dono/bot)
│   ├── infractions.ts           # Registro de infrações
│   ├── testServer.ts            # Endpoints HTTP de laboratório (porta 3004)
│   └── loggerService.ts         # Winston estruturado
└── bot/commands/                # 55 comandos ($)
```

---

## 4. PlatformManager e Adapters

**`src/platforms/PlatformManager.ts`** é um singleton que:

1. Registra adapters (`registerAdapter`) — WhatsApp (1 ou N via `WPP_SESSIONS`),
   Telegram e Discord (se os tokens estiverem válidos).
2. Carrega os comandos (`loadCommands`) e os mantém num `Map`.
3. Despacha mensagens recebidas: cada adapter chama o handler registrado, que
   normaliza a mensagem, detecta o comando e o executa.
4. Monta o `CommandContext` (`createCommandContext`) — que inclui
   `ctx.isAdmin` resolvido por `isSenderGroupAdmin()` do `groupAdmin.ts`.
5. Expõe-se em `globalThis.__platformManager` para que o `testServer`
   (empacotado em escopo separado pelo bundler) use a MESMA instância.

**Contrato do adapter** (`src/platforms/base/PlatformTypes.ts`):
`sendMessage`, `sendMedia`, `getChat`, `getChats`, `getUser`,
`removeParticipant`, `banParticipant`, `onMessage`, `onReady`, `onDisconnected`.

`SendOptions` inclui `replyToMessageId`, `parseMode`, `disablePreview`,
`buttons`, `mentionedIds`, **`messageThreadId`** (tópicos de fórum do Telegram)
e `delete`.

---

## 5. Fluxo de mensagens entre plataformas

### Entrada (WhatsApp)

```
Baileys ev.on('messages.upsert')
   ↓
BaileysConnection (roteia eventos)
   ↓
BaileysAdapter.handleMessagesUpsert()
   ↓
BaileysMessageNormalizer.dispatchMessage()
   ├── runAutoMod()                 → autoModEngine.evaluate()   (fire-and-forget)
   ├── handlePresentationCollect()  → presentationService (Comunidade 085)
   └── msgHandler(normMsg)          → PlatformManager → comando ($…)
```

### Entrada (Telegram / Discord)

```
Telegraf / discord.js event
   ↓
Adapter (TelegramAdapter / DiscordAdapter)
   ↓
PlatformManager → comando ($…)
```

### Saída

Todo envio passa pelo adapter da plataforma. O WhatsApp tem `BaileysMessageSender`;
o Telegram usa `message_thread_id` quando `SendOptions.messageThreadId` é passado.

**Regra de anti-loop:** mensagens com `fromMe === true` são ignoradas no
normalizer (exceto em `WPP_LAB_MODE=1`), e o engine também ignora anúncios do
próprio AutoMod.

---

## 6. AutoMod — engine de moderação

**Arquivo:** `src/services/autoModEngine.ts`
**Função de entrada:** `evaluate(msg, ctx, groupId, senderJid, senderName)`

### Ordem de execução

1. Carrega a config do grupo (`getGroupMod`).
2. Se **nada** estiver ligado → retorna `{ acted: false, reason: 'nada ligado' }`.
3. Lê `audit_only`.
4. **REGRA 1 — antiestrangeiro** (`antiestrangeiro`): DDI ≠ 55 → ban + remove + delete.
5. **REGRA 2b — cassino** (`casino`): classificador multi-sinal.
6. **REGRA 2c — anti-bot** (`antibot`): ≥ 2 sinais independentes.
7. **REGRA 3 — autolink** (`autolink`): domínio suspeito → delete.
8. **REGRA 4 — antispam** (`antispam`): palavra-chave + contexto → delete.

### Sinais do AntiBot (`extractAntiBotSignals`)

| Sinal | Origem |
|---|---|
| `estrutura-bot(...)` | `buttonsMessage`, `listMessage`, `templateMessage`, `interactiveMessage`, `productMessage` — **conta como UMA categoria** |
| `foreign` | DDI ≠ 55 (via PN — ver LID ↔ PN) |
| `link-suspeito` | domínio na blocklist |
| `nome-suspeito` | padrão no pushName |
| `spam-keyword` | palavra-chave promocional |

**Regra anti-dupla-contagem:** uma mensagem com `buttonsMessage` **e**
`listMessage` gera **1** sinal estrutural, não 2. O nome do sinal expõe os
tipos para auditoria (`estrutura-bot(buttonsMessage+listMessage)`).

**Threshold:** `>= 2` sinais independentes.

### Guards (ordem importa)

1. `isProtectedTarget(senderJid)` — bot/dono nunca são punidos.
2. **Admin do grupo** — verificado **ANTES** do `audit_only`, para que a
   proteção apareça no log mesmo em modo auditoria.
3. `audit_only` — registra a detecção e **não** executa ação destrutiva.

### Classificador de cassino

**Arquivo:** `src/services/casinoClassifier.ts`
Combina `casino-domain`, `casino-keywords`, `buttons-message`, `template-message`,
`foreign-number`, `external-links`, `suspicious-name`.

Dispara com `confidence >= 60 && signals >= 3`, **ou** com a *combinação forte*
`casino-domain && (casino-keywords || buttons-message || template-message)`.

---

## 7. Configuração por grupo

**Tabela:** `group_mod` (SQLite). Uma linha por grupo.

### Flags

| Coluna | Tipo | Default grupo novo | Controla |
|---|---|---|---|
| `antispam` | 0/1 | **0** | Anti-Spam |
| `antiestrangeiro` | 0/1 | **0** | Anti-Estrangeiro (DDI) |
| `autolink` | 0/1 | **0** | Anti-Link |
| `antibot` | 0/1 | **0** | Anti-Bot (≥2 sinais) |
| `casino` | 0/1 | **0** | Anti-Cassino |
| `remover` | 0/1 | **0** | Executa remoção/ban |
| `detectar` | 0/1 | **0** | Registra a detecção |
| `audit_only` | 0/1 | **0** | Modo auditoria (não age) |
| `bemvindo` | 0/1 | **0** | Welcome (serviço) |
| `presentation_enabled` | 0/1 | **0** | Apresentações (serviço) |
| `welcome_message` | TEXT | `NULL` | Texto do welcome (`NULL` = padrão) |

### Regra para grupo novo

> **Todo recurso automático começa DESLIGADO.**

Nenhuma automação liga só porque o bot entrou no grupo. Grupos existentes **não**
são alterados nem resetados — `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ADD
COLUMN` são aditivos, e os valores já persistidos permanecem.

### Como a configuração é gravada

- `setGroupModField(groupId, flag, value)` — liga/desliga UMA flag. Cria a linha
  com **todas** as colunas explicitamente em `0` (não depende do `DEFAULT` do
  schema) e depois aplica o valor pedido.
- `setGroupModAll(groupId, config)` — aplica só as flags **presentes** no objeto;
  as ausentes são preservadas.
- `ensureGroupMod(groupId, config?)` — cria grupo novo com tudo `0`; em grupo
  existente só atualiza o que foi passado.
- `resolveGroupModKey()` — resolve o ID do grupo aceitando `wpp:`/`tg:`/`dc:` e
  o ID cru, sem colisão entre plataformas.

### Consulta centralizada

`getGroupAutomationStatus(groupId)` devolve `{ config, state, hasRow }`.
`state` ∈ `ativado` (tudo ligado) | `desativado` (nada ligado) | `personalizado`.

---

## 8. Automações de grupo (visão completa)

### Nomenclatura oficial (interface ↔ campo interno)

O banco **não** foi migrado por estética: campos históricos (`autolink`,
`casino`, `remover`, `detectar`) permanecem internamente, com nomes exibidos
padronizados. A correspondência é oficial:

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

### Significado real das flags ambíguas

| Flag | O que REALMENTE controla | Por que o nome antigo era ruim |
|---|---|---|
| `detectar` | **Enviar o anúncio público** no grupo (`🚫 [AUTOMOD] REMOVIDO: …`). A detecção em si **sempre** ocorre. | "Detectar" sugere que a detecção é desligável — não é. |
| `remover` | **Executar a punição**: ban persistente + expulsão do grupo. Só é consultado no antiestrangeiro; AntiBot e Casino sempre punem quando a própria flag está ligada. | "Remover" é ambíguo — parece "apagar mensagem". |

### Tabela de automações

| Automação | Serviço | Flag | Comando oficial | Status |
|---|---|---|---|---|
| Anti-Spam | `autoModEngine` | `antispam` | `$antispam on/off` | ✅ |
| Anti-Link | `autoModEngine` | `autolink` | `$antilink on/off` | ✅ |
| Anti-Bot | `autoModEngine` | `antibot` | `$antibot on/off` | ✅ |
| Anti-Cassino | `casinoClassifier` + engine | `casino` | `$anticassino on/off` | ✅ |
| Anti-Estrangeiro | `autoModEngine` | `antiestrangeiro` | `$antiestrangeiro on/off` | ✅ |
| Punição | `autoModEngine` | `remover` | `$punicao on/off` | ✅ |
| Anúncio no grupo | `autoModEngine` | `detectar` | `$anuncio on/off` | ✅ |
| Modo Auditoria | `autoModEngine` | `audit_only` | `$auditonly on/off` | ✅ |
| Boas-Vindas | `welcomeService` | `bemvindo` | `$bemvindo on/off` | ✅ |
| Apresentações | `presentationService` | `presentation_enabled` | `$apresentacao on/off` | ✅ |
| Mute | `bot/commands/mute` | tabela própria | `$mute` / `$desmute` | ✅ |
| Rate limit | `rateLimiter` | em memória | — | ⚠️ não por grupo |

**Status geral:** `$automod status` (ou `$automod` sem args), com a estrutura
`DETECTORES` → `AÇÕES / MODO` → `AUTOMAÇÕES`.

---

## 9. Sistema de Welcome

**Arquivos:** `src/services/welcomeService.ts`, `src/services/memberJoinService.ts`

### Fluxo

```
Baileys ev.on('group-participants.update')
   ↓
BaileysConnection (registra o listener)
   ↓
BaileysAdapter.handleGroupParticipantsUpdate()
   ↓
memberJoinService.handleMemberJoin()
   ├── se banido     → removeParticipant + aviso
   └── se bemvindo=1 → sendMessage(welcome)
```

### Mensagem padrão

```
Bem-vindo @novato 👋
```

Constante `DEFAULT_WELCOME`. Usada quando `welcome_message` é `NULL`.
**Não** contém instrução de apresentação — welcome e apresentação são sistemas
separados.

### Placeholders

| Placeholder | Valor |
|---|---|
| `{nome}` | display name do novato (ou o número) |
| `{numero}` | número/ID do novato |
| `{grupo}` | nome do grupo |

Placeholder sem valor vira string vazia (nunca `undefined`).

### Comando

```
$setwelcome           → mostra o welcome atual
$setwelcome <texto>   → substitui
$setwelcome reset     → restaura o padrão
```

Persistido em `group_mod.welcome_message`. **O Relay (`InMemoryRepository`) não
é fonte de verdade** — reinicia e perde tudo.

---

## 10. Sistema de Apresentações

**Arquivos:** `presentationService.ts`, `presentationPublisher.ts`

### Fluxo

```
WhatsApp (Comunidade 085 + presentation_enabled=1)
   ↓
PresentationSession (coleta mensagens do usuário)
   ↓
janela de inatividade (10 min)
   ↓
consolidate() → SQLite (FONTE OFICIAL)
   ↓
Telegram Fortaleza 085 → tópico Apresentações (thread 2)
   ↓
tg_message_id salvo no SQLite
   ↓
aviso ao novato
```

### Gatilhos

| Gatilho | Força |
|---|---|
| Reply à mensagem de welcome | MUITO FORTE |
| `$apresentar` | MUITO FORTE (funciona para membro antigo) |
| Sessão já aberta | continua coletando |
| ≥ 2 sinais de apresentação no texto | contextual |

Uma palavra isolada (ex.: "idade") **nunca** inicia uma apresentação.

### Regras

- Requer **grupo na Comunidade 085** **E** `presentation_enabled = 1`.
- Janela de inatividade: **10 minutos** (`DEFAULT_IDLE_MS`).
- Telegram é **espelho**; SQLite é a fonte oficial.
- Se o Telegram falhar → `status='failed'`, a apresentação **não se perde** e é
  retentada (a cada 2 min, junto com a consolidação).
- Se já existe `tg_message_id` → **edita** a mensagem, não duplica.

### Campos salvos

`nome`, `phone_number`, `user_id`, `display_name`, `idade`, `genero`,
`trabalho`, `hobbies`, `bio`, `orientacao`, `estado_civil`, `bairro`,
`rede_social`, `photo_ref`, `photo_source`, `original_text`,
`source_message_ids`, `tg_chat_id`, `tg_thread_id`, `tg_message_id`, `status`.

Campos são preenchidos **apenas** com marcador explícito no texto
("tenho 24 anos", "trabalho com TI"). Sem marcador → `NULL`, nunca inventado.
`original_text` preserva o texto original para permitir corrigir a extração
depois.

### Comandos

```
$apresentar           → inicia sua apresentação
$apresentacao on|off  → admin liga/desliga no grupo
$apresentacao status  → mostra estado + destino
```

---

## 11. Comunidade 085

O Baileys entrega, no metadata do grupo, `linkedParent` apontando para a
comunidade-mãe. **É a identificação REAL** — não uma lista de nomes.

| Item | Valor |
|---|---|
| Comunidade 085 | `120363422234580695@g.us` (`isCommunity: true`, nome "Fortaleza 085") |
| Constante | `COMMUNITY_085_ID` |
| Persistência | tabela `community_groups` (group_id → community_id) |
| Registro | `upsertCommunityGroup()` chamado ao receber evento de participantes |

Grupos filhos identificados via `linkedParent` (ex.: Figurinhas/Stickers,
Administrôs Geek, Geek Fortal 085).

**Grupo fora da Comunidade 085 nunca publica apresentação**, mesmo que alguém
tente ativar.

---

## 12. Telegram Fortaleza 085 / tópico Apresentações

| Item | Valor |
|---|---|
| Grupo | Fortaleza 085 |
| `chat_id` | `-1003470059875` |
| Tópico | Apresentações |
| `thread_id` | `2` |
| Link | https://t.me/Fortaleza_085/2 |

O `TelegramAdapter` repassa `message_thread_id` em `sendMessage` e `sendMedia`
quando `SendOptions.messageThreadId` é informado. Não existe um segundo sistema
de envio — a infraestrutura existente foi estendida.

---

## 13. Persistência SQLite

**Arquivo:** `data/bot_database.db` (WAL). Diretório configurável via `BOT_DATA_DIR`.

| Tabela | Papel |
|---|---|
| `group_mod` | Configuração de automações por grupo |
| `presentations` | Apresentações (fonte oficial) |
| `community_groups` | Relação grupo → comunidade |
| `banned_users` | Banidos por grupo |
| `infractions` | Infrações registradas |
| `ai_history` | Contexto recente por usuário para o Gemini |
| `member_joins` / `member_removes` | Audit trail de entrada/saída |
| `message_fingerprints` | Fingerprints para anti-spam |

### Migrações

Aditivas e tolerantes a falha: `addColumnIfMissing()` executa
`ALTER TABLE … ADD COLUMN` e ignora erro de coluna duplicada. **Nenhuma migração
destrutiva.** Grupos existentes preservam seus valores.

> **Atenção:** `CREATE TABLE IF NOT EXISTS` **não altera** uma tabela que já
> existe. Bancos criados antes da correção de defaults ainda têm `DEFAULT 1`
> gravado no DDL — por isso o código escreve as colunas explicitamente em `0` ao
> criar uma linha, em vez de confiar no `DEFAULT`.

---

## 14. Sessões de apresentação

```ts
interface PresentationSession {
  userId: string;          // identificador estável (LID ou PN) — nunca o nome
  groupId: string;
  startedAt: number;
  lastActivityAt: number;
  sourceMessageIds: string[];
  collectedTexts: string[];
  collectedMedia: Array<{ type: 'image' | 'other'; messageId: string; mediaType?: string }>;
  trigger: 'welcome_reply' | 'command' | 'signals' | 'continuation';
  status: 'collecting' | 'consolidated' | 'published' | 'failed';
}
```

Sessões vivem em memória durante a coleta; o resultado é **persistido no
SQLite** na consolidação. Uma apresentação pode ser composta por várias
mensagens (texto + foto) e vira **uma** apresentação.

---

## 15. Histórico/sincronização de mensagens WhatsApp

O Baileys v7 **não tem store**. Mensagens do histórico chegam pelo evento
`messaging-history.set`, que é tratado em `BaileysConnection` e persistido via
`laboratorio/capture-store.ts` (JSONL append-only, sanitizado — redige
`mediaKey`, `fileEncSha256` etc.).

**Limitação:** o capture-store é um artefato de laboratório/auditoria, não um
histórico consultável de produção. Mensagens anteriores à implementação do
handler **não** são recuperáveis.

---

## 16. Delete / ban / remove

### Delete de mensagem

O delete precisa da **WAMessageKey completa** — `id`, `remoteJid`, `fromMe`,
`participant`, `participantAlt`, `addressingMode`. Em grupos `@lid`, perder
`participantAlt`/`addressingMode` faz o servidor aceitar o revoke mas a mensagem
**não** desaparecer visualmente.

`buildDeleteKey()` preserva todos os campos da key original.

> **Distinção crítica:** o servidor aceitar o protocolo **não é prova** de que a
> mensagem foi removida visualmente. A confirmação vem do evento
> `messages.delete` / `messages.update` (protocolMessage), tratado em
> `dispatchKeyDeleted()`.

### Ban / remove

- `banUser()` registra em `banned_users` (por grupo).
- `removeParticipant()` remove do grupo via adapter.
- Entrada de membro banido → `memberJoinService` remove novamente
  (ban-on-rejoin), com blindagem de ID protegido.

---

## 17. Proteção de admins/Master

**Fonte única:** `src/services/groupAdmin.ts`
(`isBotGroupAdmin`, `isSenderGroupAdmin`, `findParticipant`, `normalizeParticipant`).

Camadas de proteção:

1. `isProtectedTarget(userId)` — `permissions.ts`. Protege o bot e o MASTER
   (`MASTER_USER`, `MASTER_LID`, `BOT_NUMBER`, `BOT_LID`).
2. **Admin do grupo** — verificado via metadata real do participante, não por
   comparação de string de JID.
3. **`fromMe`** — mensagens do próprio bot são ignoradas (anti-loop).

> **Regra:** nenhuma verificação paralela de admin por comparação de `cleanId`
> deve existir. Tudo passa por `groupAdmin.ts`.

---

## 18. LID ↔ PN

O WhatsApp moderno usa **LID** (`123456789012345@lid`) como identificador de
participante em grupos com `addressingMode: 'lid'`. O **PN**
(`558581344211@s.whatsapp.net`) é o número de telefone.

**Fatos que importam:**

- Um LID **não é** um número de telefone — **não carrega DDI**. Tratá-lo como
  telefone faz `isForeignNumber()` retornar `true` para todo membro, e o
  antiestrangeiro baniria o grupo inteiro.
- O número real está em `key.participantAlt` quando o `participant` é um LID.
  `isForeignSender(msg, senderJid)` olha os dois, preferindo o PN.
- A relação LID ↔ PN vem do **metadata do grupo** (`phoneNumber`), não de
  conversão artificial de `@lid` → `@c.us`.
- `normUserId()` existe, mas **não** é usado para decisões de identidade
  sensíveis (admin, auth, kick, ban).

---

## 19. Reconnect do WhatsApp

`BaileysConnection` (conexão, QR, reconnect) + `BaileysAdapter.handleClose()`.

```
Socket fecha
   ↓
connection.update → 'close'
   ↓
handleClose(reason, statusCode)
   ↓
reconnectInProgress = true   ← ANTES do setTimeout (evita race)
   ↓
setTimeout(backoff)
   ↓
connection.connect()
   ↓
connection.update → 'open'
   ↓
handleOpen() → syncSubmodulesWithNewSocket()
   ↓
reconnectInProgress = false
```

**Regras:**
- Todos os submódulos (`sender`, `normalizer`, `chatManager`, `memberManager`,
  `health`) devem apontar para a MESMA instância de socket.
- `isSocketReady()` usa `sock.ws.isOpen` (getter booleano do Baileys v7) com
  fallback para `sock.ws.socket.readyState === 1`. **Não** usar `sock.socket`
  nem `sock.ws.readyState`.
- DNS fixo no processo (`dns.setServers(['8.8.8.8','1.1.1.1','8.8.4.4'])`)
  contorna queda do resolver do PVE/Tailscale.

---

## 20. Comandos administrativos

Prefixo `$`. Total: **60 comandos primários** (64 chaves no registro, incluindo 4 aliases legados; +2 aliases dinâmicos de `$screen`).

### Moderação / AutoMod

| Comando | Efeito | Permissão |
|---|---|---|
| `$automod status` | Status geral de todas as automações | admin/Master |
| `$automod on\|off` | Liga/desliga a MODERAÇÃO (não mexe em serviços) | admin/Master |
| `$antispam on\|off` | Anti-Spam | admin/Master |
| `$antilink on\|off` | Anti-Link _(alias: `$autolink`)_ | admin/Master |
| `$antibot on\|off` | Anti-Bot | admin/Master |
| `$anticassino on\|off` | Anti-Cassino _(alias: `$casino`)_ | admin/Master |
| `$antiestrangeiro on\|off` | Anti-Estrangeiro | admin/Master |
| `$punicao on\|off` | Punição: banir/expulsar _(alias: `$remover`)_ | admin/Master |
| `$anuncio on\|off` | Anúncio no grupo _(alias: `$detectar`)_ | admin/Master |
| `$auditonly on\|off` | Modo auditoria | admin/Master |

### Serviços de grupo

| Comando | Efeito | Permissão |
|---|---|---|
| `$bemvindo on\|off` | Boas-Vindas | admin/Master |
| `$setwelcome [texto\|reset]` | Consulta/define/restaura o welcome | admin/Master |
| `$apresentar` | Inicia sua apresentação | qualquer membro (requer `presentation_enabled`) |
| `$apresentacao on\|off\|status` | Configura apresentações | admin/Master |

### Gestão de membros

| Comando | Efeito | Permissão |
|---|---|---|
| `$kick @user` | Remove membro | admin/Master + bot admin |
| `$ban @user` | Bane + remove | admin/Master + bot admin |
| `$banidos` | Lista banidos | admin/Master |
| `$mute` / `$desmute` | Silencia/desilencia | admin/Master |
| `$promover` | Promove a admin | admin/Master |

### Outros

`$menu`, `$help`, `$ping`, `$alive`, `$stats`, `$info`, `$grupos`, `$admin`,
`$noticias`, `$delete`, `$cmdtoggle`, `$addcmd`, `$send`, `$sendmsg`,
`$ratelimit`, `$screen` (aliases `$screenshare`, `$share`) e utilitários
(`$clima`, `$piada`, `$conselho`, `$cantada`, `$gtts`, `$alarme`, `$lembrete`,
`$nick`, `$pergunta`, `$jogos`, `$forca`, `$velha`, `$sorteio`,
`$vote`/`$votar`/`$voto`, `$delvote`/`$delvoto`, `$feedback`, `$fakechat`,
`$shutdown`).

**Interface:** `$menu` (visão geral por categoria) e `$help` (lista detalhada
com permissões). Ambos exibem **apenas** comandos que existem no registro —
coberto por `tests/unit/interfaceNaming.test.ts`.

---

## 21. Testes

```bash
npm test                                    # suíte completa
npx vitest run tests/unit/<arquivo>.test.ts # arquivo específico
npx vitest run -t "nome do teste"           # teste específico
```

**Estado:** 509 testes / 35 arquivos, todos passando.

| Área | Arquivo |
|---|---|
| **Pipeline real do AutoMod (integração)** | `tests/integration/automodPipeline.test.ts` |
| **Delete ponta a ponta (integração)** | `tests/integration/deleteKeyPipeline.test.ts` |
| **Canonicalização de group_id (integração)** | `tests/integration/groupModCanonical.test.ts` |
| Configuração de automações por grupo | `tests/unit/groupAutomationConfig.test.ts` |
| Engine de moderação | `tests/unit/autoModEngine.test.ts` |
| AntiBot (sinais + dupla contagem) | `tests/unit/antiBot.test.ts`, `antibotDoubleCount.test.ts` |
| Cenários do grupo Figurinhas | `tests/unit/automodFigurinhas.test.ts` |
| Welcome | `tests/unit/welcome.test.ts` |
| Apresentações (flag por grupo) | `tests/unit/presentationEnabled.test.ts` |
| Admin / kick / ban | `tests/unit/groupAdminKickBan.test.ts` |
| Prefixo de group_mod | `tests/unit/groupModPrefix.test.ts` |
| Reconnect Baileys | `tests/unit/baileysReconnect.test.ts` |
| Assinatura de comandos | `tests/unit/command-signature.test.ts` |
| Adapters | `tests/unit/adapters.test.ts` |

> **Regra:** um teste não é prova de funcionamento em produção. Testes unitários
> provam o *código*; comportamento real exige validação no grupo.

---

## 22. Build

```bash
npm run build      # bundler → dist/
npm run typecheck  # tsc --noEmit
npm run bot:start  # node dist/core/multiPlatform.js
```

---

## 23. Laboratório / E2E

`testServer` na **porta 3004** (apenas localhost) expõe endpoints `/lab/...` e
`/test` para injetar comandos e simular eventos pelo caminho real de produção.

| Endpoint | Uso |
|---|---|
| `POST /test` | Injeta um comando/mensagem no pipeline real |
| `GET /lab/groups` | Lista grupos (com `raw` do metadata) |
| `POST /lab/antibot-test` | Executa `evaluate()` real com contexto real |
| `POST /lab/restore-member` | Restaura membro removido em teste |

**Regra de ouro dos testes E2E:** nunca escolher um chat aleatório só porque
está disponível. Usar os alvos oficiais.

| Plataforma | Alvo |
|---|---|
| WhatsApp (teste) | grupo Teste `120363410094452673@g.us` |
| WhatsApp (produção) | grupo Figurinhas `120363419033272638@g.us` |
| Telegram | `tg:-1003470059875` |
| Discord | `dc:387787838013571072` |

---

## 24. Estado atual do projeto

### Funcionalidades implementadas

- ✅ Bot multi-plataforma (WhatsApp/Baileys v7, Telegram/Telegraf, Discord/discord.js)
- ✅ Engine de moderação com 6 módulos independentes + modo auditoria
- ✅ Configuração persistente por grupo, com defaults DESLIGADOS
- ✅ Status centralizado das automações (`$automod status`)
- ✅ Welcome configurável por grupo, com placeholders
- ✅ Listener real de `group-participants.update` (welcome + ban-on-rejoin)
- ✅ Sistema de apresentações persistente com espelho no Telegram
- ✅ Identificação real da Comunidade 085 via `linkedParent`
- ✅ Suporte a `message_thread_id` no Telegram
- ✅ Proteção de admins/Master em todas as ações destrutivas
- ✅ Delete com WAMessageKey completa
- ✅ Reconnect com backoff e sincronização de submódulos

### Em desenvolvimento / não validado

- ⚠️ Screen Share no Discord Desktop (Web validado, Desktop não)
- ⚠️ Download de mídia e foto de perfil do WhatsApp para apresentações
  (estrutura pronta; `downloadMediaMessage`/`profilePictureUrl` disponíveis no
  Baileys v7 mas ainda não integrados ao fluxo)
- ⚠️ `kick`/`ban` em Telegram e Discord (não suportados — `participants: []`)

### Testes comprovados

- ✅ 509 testes (unit + integração) passando, em 35 arquivos
- ✅ Configuração por grupo provada contra SQLite real, incluindo cenário de
  banco legado com `DEFAULT 1`
- ✅ `$kick` validado em produção (grupo Teste, 13→12 membros)

### Limitações

Ver seção [27](#27-limitações-conhecidas).

### Configurações importantes

| Item | Valor |
|---|---|
| Comunidade 085 | `120363422234580695@g.us` |
| Telegram Apresentações | chat `-1003470059875`, thread `2` |
| Grupo Teste | `120363410094452673@g.us` |
| Grupo Figurinhas | `120363419033272638@g.us` |
| Janela de inatividade | 10 minutos |
| Threshold AntiBot | ≥ 2 sinais independentes |

---

## 25. Decisões arquiteturais

### SQLite como fonte de verdade

O SQLite é a **fonte oficial** de toda configuração e das apresentações. O
Telegram é espelho. O Relay (`InMemoryRepository`) **não** é fonte de verdade —
reinicia e perde tudo; foi a causa do bug do `$setwelcome`.

### Configuração centralizada, lógica separada

A lógica é separada por serviço (engine de moderação ≠ welcome ≠ apresentações),
mas a **configuração** vive toda em `group_mod` e é consultável de forma
consistente. Isso evita os dois extremos ruins: um arquivo gigante com toda a
lógica, ou configuração espalhada por cada serviço.

### Grupo novo começa com automações desligadas

O bot nunca passa a moderar um grupo só porque entrou nele. Defaults em `0`,
aplicados explicitamente (não via `DEFAULT` do schema). Grupos existentes são
preservados.

### Welcome separado da moderação

Welcome é um **serviço de boas-vindas**, não um módulo de moderação.
`$automod on/off` **não** altera `bemvindo` nem `presentation_enabled`.

### PresentationService separado do AutoMod engine

Detecção de apresentação é heurística de conteúdo, não moderação. Misturar
poluiria o engine e arriscaria banir quem só se apresentou.

### Telegram como espelho das apresentações

A apresentação sobrevive a restart, queda do bot, queda do Telegram e reconnect
do WhatsApp. Se o Telegram falhar, o status vira `failed` e há retry — a
apresentação nunca se perde.

### LID ↔ PN

LID não carrega DDI. Identidade vem do metadata real do grupo
(`phoneNumber`/`participantAlt`), nunca de conversão artificial de `@lid`.

### Histórico do WhatsApp

Baileys v7 não tem store. O histórico chega por `messaging-history.set` e é
persistido no capture-store (artefato de auditoria), não como histórico
consultável.

### audit_only

Modo auditoria: detecta e registra, **não** executa ação destrutiva. O guard de
admin roda **antes** do `audit_only` para que a proteção apareça no log mesmo em
modo auditoria.

### Proteção de admins/Master

`isProtectedTarget()` + verificação de admin via metadata + `fromMe`. Fonte única
em `groupAdmin.ts`; nenhuma comparação paralela de JID é permitida.

### Threshold por sinais independentes

AntiBot exige ≥ 2 sinais **independentes**; estrutura de mensagem conta como UMA
categoria. Isso evita que um botão legítimo sozinho dispare banimento.

---

## 26. Histórico de bugs importantes corrigidos

### BUG-A: quoted no argumento errado do Baileys

| Campo | Valor |
|---|---|
| **Sintoma** | Respostas do bot não apareciam como citação no WhatsApp |
| **Causa** | `quoted` era passado dentro do 2º argumento (`content`); o Baileys v7 espera no 3º (`options`) |
| **Correção** | `sendMessage(jid, content, { quoted })` — `quoted` extraído para `options` |
| **Arquivo** | `BaileysMessageSender.ts` |
| **Teste** | `tests/unit/baileysReply.test.ts` + laboratório (Direct + PlatformManager) |

### BUG-B: socket stale após reconnect

| Campo | Valor |
|---|---|
| **Sintoma** | Envios falhavam após reconexão |
| **Causa** | Submódulos mantinham referência ao socket antigo |
| **Correção** | `syncSubmodulesWithNewSocket()` no `handleOpen()` |
| **Arquivo** | `BaileysAdapter.ts` |
| **Teste** | `tests/unit/baileysReconnect.test.ts` |

### BUG-C: race condition no handleClose

| Campo | Valor |
|---|---|
| **Sintoma** | Dois reconnects concorrentes |
| **Causa** | `reconnectInProgress = true` era marcado DENTRO do `setTimeout` |
| **Correção** | Marcar antes do `setTimeout` |
| **Arquivo** | `BaileysAdapter.ts` |
| **Teste** | `tests/unit/baileysReconnect.test.ts` |

### BUG-D: isSocketReady incorreto no Baileys v7

| Campo | Valor |
|---|---|
| **Sintoma** | Todos os envios falhavam com `readyState !== OPEN` |
| **Causa** | Código checava `sock.socket`/`sock.ws.readyState` — inexistentes na v7 |
| **Correção** | Usar `sock.ws.isOpen` com fallback para `sock.ws.socket.readyState === 1` |
| **Arquivo** | `BaileysAdapter.ts` |
| **Teste** | `tests/unit/baileysReconnect.test.ts` |

### BUG-E: group_mod com prefixo `wpp:`

| Campo | Valor |
|---|---|
| **Sintoma** | Config existia no banco mas o engine reportava "nada ligado" |
| **Causa** | DB gravava `wpp:120363…@g.us`; `evaluate()` recebia `120363…@g.us` (sem prefixo) → query exata falhava |
| **Correção** | `resolveGroupModKey()` com resolução em 3 passos (exato → normalizado → variantes `wpp:`/`tg:`/`dc:`) |
| **Arquivos** | `databaseService.ts`, `groupIds.ts` |
| **Teste** | `tests/unit/groupModPrefix.test.ts` |

### BUG-F: LID tratado como número estrangeiro

| Campo | Valor |
|---|---|
| **Sintoma** | AntiEstrangeiro baniria o grupo inteiro (todos os membros com `@lid`) |
| **Causa** | `isForeignNumber(LID)` — LID não é telefone, mas o código extraía dígitos e comparava o DDI |
| **Correção** | `isForeignNumber()` retorna `false` para `@lid`; `isForeignSender()` usa o PN de `key.participantAlt` |
| **Arquivo** | `autoModEngine.ts` |
| **Teste** | `tests/unit/autoModEngine.test.ts` |

### BUG-G: double-count do AntiBot

| Campo | Valor |
|---|---|
| **Sintoma** | Uma única `buttonsMessage` atingia o threshold e bania sozinha |
| **Causa** | O mesmo payload gerava `mensagem-interativa` **e** `buttonsMessage` → 2 sinais de 1 característica |
| **Correção** | Estrutura conta como UMA categoria (`estrutura-bot(<tipos>)`), com dedupe de sinais |
| **Arquivo** | `autoModEngine.ts` |
| **Teste** | `tests/unit/antibotDoubleCount.test.ts` |

### BUG-H: autorização de admin no kick/ban

| Campo | Valor |
|---|---|
| **Sintoma** | `$kick` respondia "bot não é admin" mesmo com o bot sendo admin |
| **Causa** | `cleanId(LID)` ≠ `cleanId(PN)` — o bot aparece como `@lid` nos participantes mas é conhecido pelo PN |
| **Correção** | `groupAdmin.ts` como fonte única, usando a relação real do metadata (`phoneNumber`) |
| **Arquivos** | `groupAdmin.ts`, `kick.ts`, `ban.ts`, `PlatformManager.ts` |
| **Teste** | `tests/unit/groupAdminKickBan.test.ts` |

### BUG-I: history sync não capturado

| Campo | Valor |
|---|---|
| **Sintoma** | Mensagens do histórico do WhatsApp eram descartadas |
| **Causa** | O evento `messaging-history.set` não tinha handler |
| **Correção** | Handler que persiste via PDO no capture-store (sanitizado) |
| **Arquivos** | `BaileysConnection.ts`, `laboratorio/capture-store.ts` |
| **Teste** | `tests/unit/historyCapture.test.ts` |

### BUG-J: setwelcome persistindo no Relay InMemory

| Campo | Valor |
|---|---|
| **Sintoma** | `$setwelcome` respondia "atualizada" mas a mensagem sumia após restart — e o bot nunca a usava |
| **Causa** | Gravava no `InMemoryRepository` do Relay (`Map` em memória) em vez do SQLite |
| **Correção** | Persistir em `group_mod.welcome_message`; `welcomeService` lê do SQLite |
| **Arquivos** | `setwelcome.ts`, `welcomeService.ts` |
| **Teste** | `tests/unit/welcome.test.ts` |

### BUG-K: grupo novo herdando defaults ligados

| Campo | Valor |
|---|---|
| **Sintoma** | Grupo novo nascia com AntiSpam/AntiLink/AntiEstrangeiro/Remover ligados |
| **Causa** | `ensureGroupMod()` usava defaults `true`; o schema tinha `DEFAULT 1` |
| **Correção** | `GROUP_MOD_DEFAULTS` com tudo `false`; schema com `DEFAULT 0`; escrita explícita de `0` (não depende do DDL) |
| **Arquivo** | `databaseService.ts` |
| **Teste** | `tests/unit/groupAutomationConfig.test.ts` |

### BUG-L: setGroupModField ativando outras flags indiretamente

| Campo | Valor |
|---|---|
| **Sintoma** | `$bemvindo on` ligava AntiSpam, AntiLink, AntiEstrangeiro e Remover |
| **Causa** | `INSERT INTO group_mod (group_id, <uma flag>)` — as demais colunas recebiam o `DEFAULT` da tabela (`1`) |
| **Correção** | Criar a linha com todas as flags explicitamente `0` e então aplicar só a pedida |
| **Arquivo** | `databaseService.ts` |
| **Teste** | `tests/unit/groupAutomationConfig.test.ts` (inclui cenário de banco legado com `DEFAULT 1`) |

### BUG-M: Casino/AntiBot sem flags próprias

| Campo | Valor |
|---|---|
| **Sintoma** | Impossível desligar AntiBot ou Casino sem desligar também o antiestrangeiro |
| **Causa** | Ambos eram gated por `config.remover`; não existia `antibot` nem `casino` no schema |
| **Correção** | Colunas `antibot` e `casino` (default 0) + comandos `$antibot` e `$casino`; gates passaram a usar as flags próprias |
| **Arquivos** | `databaseService.ts`, `autoModEngine.ts`, `modToggle.ts` |
| **Teste** | `tests/unit/groupAutomationConfig.test.ts`, `tests/unit/autoModEngine.test.ts` |

### BUG-N: `$automod` status quebrado

| Campo | Valor |
|---|---|
| **Sintoma** | Status sempre mostrava "PERSONALIZADO" e não listava todas as automações |
| **Causa** | Comparava `state` com `'on'/'off'` (a função retorna `'ativado'/'desativado'`) e fazia `.replace('${estado}')` de uma string literal inexistente |
| **Correção** | `getGroupModState()` tipado; `statusBlock()` monta o texto completo (moderação + serviços + modo) |
| **Arquivo** | `modToggle.ts`, `databaseService.ts` |
| **Teste** | `tests/unit/command-signature.test.ts` |

---

## 27. Limitações conhecidas

1. **`$kick`/`$ban` só funcionam no WhatsApp.** Telegram/Discord retornam
   `participants: []`; a verificação de admin falha e o comando recusa.
2. **Mídia e foto de perfil do WhatsApp ainda não integradas** ao fluxo de
   apresentações. `downloadMediaMessage()` e `profilePictureUrl()` existem no
   Baileys v7, mas o `photo_ref` guarda o ID da mensagem — o download não está
   ligado.
3. **Capture-store é artefato de laboratório**, não histórico consultável.
   Mensagens anteriores à implementação do handler não são recuperáveis.
4. **Rate limit não é por grupo** — vive em memória (`rateLimiter.ts`).
5. **Screen Share no Discord Desktop** não validado (Web funciona).
6. **Testes unitários não provam comportamento em produção.** Validação real
   exige o grupo.
7. **`setGroupModField` interpola o nome da coluna** no SQL. É seguro porque a
   coluna vem de uma lista fechada (`GROUP_MOD_FLAGS`) e é validada, mas
   qualquer nova flag precisa ser adicionada a essa lista.

---

## Referências

- Código-fonte: `src/`
- Testes: `tests/unit/`
- Decisões: `docs/DECISIONS.md`
- Bugs: `docs/KNOWN_ISSUES.md`
- Contexto para LLMs: `docs/AI_CONTEXT.md`
- Endpoints: `docs/ENDPOINTS.md`

---

**Última atualização**: 2026-10-02
