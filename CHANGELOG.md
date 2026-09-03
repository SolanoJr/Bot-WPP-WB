# 📜 ChangeLog - WarriorBlack Bot

## [v1.3.0] - 2026-09-03
### 🖥️ Discord Screen Share (Activity) — Integração Completa

#### Adicionado / Corrigido
- **Novo módulo `discord-screen/`**: Discord Activity completa (Express + WebRTC) para screen sharing
  - Server: Express + WebSocket (porta 3001), OAuth2 Discord, salas WebRTC, admin dashboard
  - Client: Vite + vanilla JS, `@discord/embedded-app-sdk`, captura tela via `getDisplayMedia`
  - Shared: WebRTC signaling, broadcaster, tokens JWT compactos
- **Comando `$screen`**: Cria sessão guest → sala → retorna links **Transmitir** (broadcaster) e **Assistir** (viewer)
- **Integração no core**: `DiscordScreenService` inicializado no `multiPlatform.ts` após `platformManager.startAll()`
  - Graceful shutdown inclui parada do screen service
  - Variável global `discordScreenService` para cleanup
- **PM2**: Novo processo `discord-screen` (`./discord-screen/server/index.js`, porta 3001)
  - Logs dedicados (`discord-screen-stable.out.log/.err.log`)
  - Memória 300M, node_args otimizados
- **Deploy automatizado** (`sync_and_deploy.sh`):
  - `npm ci` no `discord-screen/` e `discord-screen/client/`
  - `pm2 delete/start` para ambos processos via `ecosystem.config.js`
- **Variáveis de ambiente** (`.env.example`):
  - `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `DISCORD_SCREEN_PORT=3001`
  - `DISCORD_SCREEN_PUBLIC_ORIGIN`, `DISCORD_ADMIN_ID`, `TURN_URL/USER/PASS`
- **Comando `$screen`** registrado (`src/bot/commands/screen.ts`):
  - Usa `DISCORD_SCREEN_PORT`/`DISCORD_SCREEN_PUBLIC_ORIGIN` do `.env`
  - Conecta na porta correta do screen server (3001)
  - Fallback para localhost se não configurado

#### Limpeza
- Removidas pastas vazias: `src/platforms/discord/middlewares`, `src/platforms/telegram/middlewares`, `.test_auth`, `discord-screen/.cache`
- `ARCHITECTURE.md` reescrito para refletir estado real (Baileys ativo, Screen Share integrado)

#### Status
- Typecheck: 0 erros
- Build: Sucesso (inclui client Vite build)
- Testes: 156 passing (19 arquivos, +10 novos testes do screen)
- Git: Commit `526a30a` pushed para origin/main
- Deploy pronto: `sync_and_deploy.sh` atualizado para gerenciar ambos processos PM2

## [v1.2.1] - 2026-09-02
### 🔒 Segurança: blindagem AntiMod contra banimento acidental de BOT/DONO/ADMINS

#### Adicionado / Corrigido
- **`src/services/databaseService.ts` (`banUser`):** agora verifica `isProtectedTarget` antes de inserir na tabela `banned_users`. Tenta banir o BOT (558581344211), o DONO (5588998314322) ou qualquer ADMIN do grupo agora é bloqueado silenciosamente com log de aviso.
- **`src/services/autoModEngine.ts` Regra 1 (antiestrangeiro):** antes de chamar `banUser` + `removeParticipant`, verifica se o remetente é ID protegido. Se for, ignora a ação e logs "antiestrangeiro ignorado — ID protegido".
- **`src/services/autoModEngine.ts` Regra 2 (antibot):** mesma blindagem: se `isProtectedTarget(senderJid)`, não banir nem remover. Antes a regra 2 chamava `banUser` + `removeParticipant` direto, sem verificação — um falso positivo poderia banir o próprio bot ou o dono.
- **`src/bot/commands/addcmd.ts`:** agora requer `isMaster` (dono) para executar. Qualquer pessoa podia adicionar comandos customizados ao grupo antes; agora apenas o dono pode.
- **Limpeza:** removidos 4 arquivos Python de diagnóstico (`query_groups.py`, `query_groups2.py`, `query_schema.py`, `query_subject.py`) que não eram referência ativa.

#### Status
- Build OK; typecheck 0 erros; testes 130/134 (4 falhas pré-existentes de sqlite3 bindings no Windows, não relacionadas).
- Deploy Linux PID 133768 com as correções. Bot online: WhatsApp 558581344211, Telegram 8980550439, Discord 1307158493907652648.
- `dist/services/autoModEngine.js`: 5 ocorrências de `isProtectedTarget` (Regra 1 + Regra 2 + import).
- `dist/services/databaseService.js`: 2 ocorrências de `isProtectedTarget` (import + check em `banUser`).

## [v1.2.0] - 2026-08-14
### 🎯 Sarcasmo (keywordHandler), $automod, $ondeestou, $kick/$ban com nome

#### Adicionado / Corrigido
- **Sarcasmo (`src/services/keywordHandler.ts`):** 4 gatilhos funcionando por evidência:
  1. Palavra "bot" em qualquer texto (dedup por conteúdo 5s evita resposta dupla do WWebJS double-emit)
  2. Menção ao bot (`@WarriorBlack`) — reconhece ambos os IDs (`558581344211` e LID `2592935567439`)
  3. Bot digita "bot" → `message_create` handler também roda `handleKeywords`
  4. Reply em qualquer mensagem do bot → usa `getQuotedMessage()` quando `quotedMsg` não vem populado
  - Frase do dono: `tenho nada ver com isso não sinhô` (+ variações). Só reply + texto.
- **$automod (`modToggle.ts` + `PlatformManager.createCommandContext`):** aceita dono (isMaster) OU admin de grupo (`isAdmin` populado de `chat.participants`).
- **$ondeestou (`ondeestou.ts` + `locationPoller.ts`):** gera link + recebe loc do relay + posta Google Maps + texto de espionagem no grupo (validado 11:35:35).
- **$kick / $ban (BUG 34):** mostram NOME real da pessoa (via `getTargetDisplayName`) + menção.
- **$banidos:** lista com NOME da pessoa + NOME do grupo (getChat().name). Só MASTER.
- **AutoMod resilience:** `getChat()` com timeout 4s (`Promise.race`) — não trava mais em `@lid` (Issue #201838).
- **handleKeywords ANTES do processAutoMod** no `message` handler (AutoMod travava e bloqueava o sarcasmo).

#### Status
- Build OK; suite **97/97 (16 files)** — zero falhas.
- Deploy Linux PID atual com as correções. Sarcasmo validado por selftest + logs; $banidos/$ban-reentrada/$kick-outro-adm pendentes de validação em produção pelo dono.

## [v1.1.9] - 2026-08-10
### 🔧 Correção crítica: `$kick`/`$ban` e AutoMod (erro `r` / Issue #201838 / `@lid`)

#### Alterado
- **`WhatsAppAdapter.removeParticipant`/`banParticipant`:** passaram a usar `client.removeParticipants(chatId, [users])` **direto** (método do Client WWebJS), contornando `getChatById()` que lança `r:r` em chats `@lid`. Antes: `getChatById(...).removeParticipants(...)` → erro `r` no `$kick`/`$ban`.
- **`autoModService.processAutoMod`:** resiliente a falha de `getChat()` (erro `r:r`) — assume bot-admin quando não consegue verificar `participants`, e usa `client.removeParticipants`/`client.sendMessage` diretos. Antes o AutoMod abortava silenciosamente (precisei que uma adm banisse manualmente o +62 831-8527-5521 em 09/08).

#### Status
- Build OK; suite **107/107 (18/18 files)** — zero falhas.
- Deploy Linux PID 613687 com as correções. Pendente validação em produção (`$kick`/`$ban` e AutoMod em grupo `@lid`).

## [v1.1.8] - 2026-08-07
### 🔧 Correção de comandos (aliases, testes) e `$kick`/`$ban` (erro falso de admin)

#### Alterado
- **`src/bot/commands/index.ts`**: registrados aliases ausentes que o menu/testes esperavam: `piada`→`jokes`, `votar`→`vote`, `delvoto`→`delVote`, e o comando órfão `sendmsg` (`sendMessage.ts`) agora é importado e registrado.
- **`src/bot/commands/kick.ts` / `ban.ts`**: quando `chat.isPermissionsVerified === false` (WWebJS falhou ao obter participantes — Issue #201838 / chat `@lid`), o comando **não bloqueia com erro falso de "precisa ser administrador"**. Prossegue e deixa o WWebJS retornar o erro real, se houver.
- **`tests/unit/discordAdapter.test.ts`**: mock de `discord.js` agora exporta `GatewayIntentBits` e `Partials` (o adapter os importa no topo).
- **`tests/unit/commands-registry.test.ts`**: passa após registro dos aliases.

#### Status
- Build OK; suite **107/107 (18/18 files)** — zero falhas.
- Pendente deploy Linux para validar `$kick`/`$ban` em produção.

## [v1.1.7] - 2026-08-07
### 🔧 Correção de inicialização multiplataforma e menu