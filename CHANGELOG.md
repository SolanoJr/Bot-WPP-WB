# 📜 ChangeLog - WarriorBlack Bot

## [v1.3.0] - 2026-08-26
### 🔒 Segurança de permissões, correção do $mute e moderação de entrada no Baileys

#### 🚨 CRÍTICO — Escalada de privilégio em `isMaster()`
- `src/services/permissions.ts`: `isMaster()` usava `userId.includes('88998314322')`.
  Qualquer número que **contivesse** os dígitos do dono (ex.: `1188998314322@c.us`)
  era aceito como MASTER, ganhando acesso total ($shutdown, $ban, $promover).
  Agora a comparação é **exata** sobre conjuntos (`MASTER_LIDS` / `MASTER_PHONES`).
  Removido o fallback frouxo `'8898314322'`.
- Variações legítimas do mesmo número (com/sem DDI 55, 8 ou 9 dígitos) passaram a
  ser geradas por `phoneVariants()` e comparadas como **valores exatos**.

#### 🚨 CRÍTICO — `MASTER_LID` continha o LID do PRÓPRIO BOT
- Provado pelo log do Baileys em produção:
  `myPN=558581344211` / `myLID=2592935567439`.
- O `.env` de produção tinha `MASTER_LID=2592935567439@lid` (= o bot), e
  `BaileysAdapter.ts` repetia esse valor como fallback hardcoded. Consequência:
  **todo alerta de `notifyOwner()` era enviado ao próprio bot** — o dono nunca
  recebeu aviso de queda; o log confirmava `alerta enviado ao dono (2592935567439@lid)`.
- Correção: novo `getOwnerNotifyTarget()` resolve o destino do dono e **blinda** o
  caso, descartando o LID do bot do conjunto de LIDs do MASTER (com `console.warn`).
- `notifyOwner()` e `sendQrToOwner()` passaram a usar esse resolvedor.

#### 🛡️ Imunidade do MASTER e do bot (`isProtectedTarget`)
- Reescrito com comparação exata; `endsWith` protegia terceiros por acidente
  (ex.: `99558581344211` "terminava com" o número do bot).
- Guardas adicionadas em: `$delete` (`deleteMsg.ts`), `$promover` (`promover.ts`).
- **Guarda defensiva de última linha** em `removeFromGroup()` (`autoModService.ts`)
  e `banUser()` (`databaseService.ts`): mesmo que um caminho novo esqueça a
  checagem, o dono e o bot não podem ser removidos nem gravados como banidos.

#### 🐛 `$mute` — estava quebrado de duas formas (suíte verde mentia)
1. Lia `ctx.mentionedIds`, propriedade que **não existe** no `CommandContext`
   (menções ficam em `ctx.msg.mentions`): nunca encontrava o alvo.
2. `normId()` convertia `@lid` → `@c.us` ao montar a chave, enquanto o
   `messageHandler` consultava com o `@lid` original: **a chave nunca casava**, o
   mute era gravado e jamais aplicado (parecia funcionar sem fazer nada).
- Novo `src/bot/commands/targetResolver.ts` centraliza a resolução de alvo
  (`normalizeTargetId`, `getMentionedIds`, `resolveTargetId`), lê todas as fontes
  de menção (WWebJS + Baileys + reply) e **preserva o domínio** do ID.
- `mute.ts` e `desmute.ts` migrados para o resolvedor.

#### ✨ Moderação de ENTRADA agora funciona em produção
- `handleMemberJoin` existia **somente** no `WhatsAppAdapter` (WWebJS/legado).
  Como produção roda `WPP_ENGINE=baileys`, nada disso executava: banido que
  reentrava não era removido, antibots não agia na entrada e boas-vindas não saíam.
- Extraído para `src/services/memberJoinService.ts` (agnóstico de plataforma) e
  ligado ao evento `group-participants.update` do `BaileysAdapter`.

#### 🐛 Outras correções de runtime
- `ReferenceError` em 4 comandos que referenciavam `msg`/`args`/`client`
  inexistentes após o refactor `execute(ctx)`: `mute`, `desmute`, `info`,
  `feedback` (+ `promover` reescrito). Eles **lançavam exceção ao serem chamados**.
- `cleanId()`: o sufixo de device vazava para o ID —
  `'2592935567439:60@lid'` virava `'259293556743960'` (ID inexistente).
- `normId()` do `BaileysAdapter`: `.replace(/:/,'@')` transformava
  `558581344211:60@s.whatsapp.net` em `558581344211@60@s.whatsapp.net` (inválido).
- `TelegramAdapter`: genérico `Telegraf<TgMessage>` violava a constraint
  `Context<Update>` e colapsava o tipo do ctx para `never` — **33 erros** em
  cascata. Corrigido para `Telegraf<TelegrafContext>` (+ guarda de `ctx.message`
  ausente, que era `TypeError` em runtime; `disable_web_page_preview` →
  `link_preview_options`).

#### 🧹 Configuração
- `tsconfig.json`: `NodeNext` → `CommonJS`/`Node10`. O projeto é
  `"type": "commonjs"` e todo o build sai em CJS (tsup `--format cjs`), mas o
  `NodeNext` exigia extensão `.js` nos imports e gerava ~30 erros TS2835 falsos.
- `PlatformUser`: declarados `isAdmin?` / `isSuperAdmin?` (usados por `kick`/`ban`
  mas ausentes do tipo, causando ~12 erros em cascata).

#### 📊 Resultado medido
- Erros de tipagem (`tsc --noEmit`): **129 → 58**.
- Testes: **95 → 136 passando**, 18 arquivos. Novos:
  `permissions-security.test.ts` (26), `mute-target.test.ts` (16),
  `memberJoinService.test.ts` (10).
- 3 bugs reais foram descobertos **pelos próprios testes novos** (`cleanId` com
  sufixo de device, DDI e nono dígito).

#### ⚠️ NÃO validado em produção nesta entrega
- Build verde e testes verdes **não** provam funcionamento em produção.
- Falta teste real no grupo "Teste": `$mute`, `$delete`, `$promover` e a entrada
  de membro (ban persistente/boas-vindas) via Baileys.
- `MASTER_LID` do `.env` de produção **continua com o valor errado** (LID do bot).
  O código agora o ignora com segurança, mas o valor correto do LID do dono ainda
  precisa ser descoberto e configurado.

## [v1.2.1] - 2026-08-17
### 🛠️ DNS do servidor (BUG 36) + testes de comandos

#### Adicionado / Corrigido
- **BUG 36 — DNS do servidor caído:** o `/etc/resolv.conf` apontava para `100.100.100.100` (DNS do PVE/Tailscale) que parou de responder. O bot ficava mudo (WA Web não resolvia `web.whatsapp.com` → `ERR_NAME_NOT_RESOLVED`).
- **Defesa em camadas no código:** `--dns-server=8.8.8.8` no Chromium (WhatsAppAdapter) + `dns.setServers(['8.8.8.8','1.1.1.1','8.8.4.4'])` no `multiPlatform.ts`.
- **Prevenção de infra (feita no servidor):** `systemd-resolved` com `DNS=8.8.8.8 1.1.1.1 8.8.4.4` + `FallbackDNS=100.100.100.100`, e `resolv.conf` como symlink do stub (`127.0.0.53`) → sobrevive a reboot/PVE.
- **Selftest refatorado:** roda no `change_state: CONNECTED` + fallback `setTimeout` 30s (o `ready` do WWebJS não dispara em sessão restaurada). Guard `__selftestModRan` evita duplo-run.
- **Removido:** comando `$teste` experimental e `scripts/run-teste.js` (não funcionavam — processo externo não compartilha o bot vivo).

#### Testado e validado (por evidência de log)
- `$cantada`, `$conselho`, `$conselhob` — respondem com frase aleatória do array local.
- `$noticias` — Gemini `gemini-2.5-flash` (o `gemini-1.5-flash` foi descontinuado/404).
- Selftest isolado (1 comando por vez) sem encher o grupo.
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

#### Alterado
- **`PlatformManager.startAll()`**: inicialização das plataformas agora em **paralelo** (`Promise.allSettled`) em vez de `await` sequencial. O `await launch()` do Telegram travava o loop e impedia o Discord de subir.
- **`TelegramAdapter.initialize()`**: não aguarda `launch()` bloqueante — dispara em background e retorna, permitindo que o `setupAdapterHandlers` (despacho de comandos) seja registrado. Antes o Telegram recebia msgs mas não despachava.
- **`src/bot/commands/menu.ts`**: restaurado o formato do menu com `HASH` (dinâmico do commit), `Uptime` e flags de status (ATIVO/SARCASMO/DDI/CARD/PALAVRAS/LINKS), mantendo `CommandContext` agnóstico.

#### Status
- Build OK; suite 105/107 (2 falhas pré-existentes fora de escopo: `commands-registry`, `discordAdapter`).
- 3 plataformas ativas e prontas (whatsapp, telegram, discord) no PID 576296.

## [v1.1.6] - 2026-08-07
### 🔧 Correções de BUGS 1‑4 e envio WhatsApp (`@lid` / retorno vazio)

#### Alterado (já aplicado no código em sessões anteriores)
- **BUG 1 — `getChatById` redundante:** `automod.ts`, `ban.ts`, `lists.ts`, `setwelcome.ts`, `index.ts`, `autoModService.ts` reutilizam a instância de `chat` obtida via `msg.getChat()`.
- **BUG 2 — `userId` em grupos:** `pergunta.ts` e `shutdown.ts` usam `msg.author` em grupos.
- **BUG 3 — `JSON.stringify` circular:** removidas serializações inseguras em `kick.ts`, `WhatsAppAdapter.ts`, `autoModService.ts`.
- **BUG 4 — fallback `Utils.js`:** `Msg.get()` tratado; patch `r: r` (`_serialized` → `$1`) aplicado.

#### Corrigido (Fase B — envio WhatsApp)
- **`No LID for user`**: a conversão `chatId` `@lid` → `@c.us` no `sendMessage` quebrava o envio. **Revertida** — o WWebJS moderno exige o `@lid` como destino. Mantido o `@lid` original.
- **Retorno `undefined`**: o WWebJS nem sempre devolve o objeto serializado ao enviar para `@lid` com `waitUntilMsgSent` (mesmo com envio OK). O `sendMessage` agora trata `sent === undefined` como sucesso (retorna payload mínimo) em vez de lançar "erro interno" falso.
- **Telegram**: o erro `504 Gateway Time-out` era transitório de rede (servidor alcança `api.telegram.org` normalmente — confirmado `HTTP 302`). Telegram在线 e recebeu `$menu` após o restart.

#### Status
- Build OK; suite 105/107 (2 falhas pré-existentes fora de escopo: `commands-registry`, `discordAdapter`).

## [v1.1.5] - 2026-08-07
### 🔧 Correção crítica: comandos não eram despachados (messageHandler nulo)

#### Alterado
- **`src/core/multiPlatform.ts`**: agora chama **`await platformManager.startAll()`** após registrar os adapters (que faz `initialize()` + `setupAdapterHandlers()` para cada plataforma). Antes, os adapters eram registrados e `initialize()` era chamado direto, mas o `startAll()` — que define o `messageHandler` de despacho de comandos — nunca rodava, deixando `this.messageHandler` nulo e silenciando todos os comandos (`$menu`, `$ping`, etc.).

#### Adicionado
- **Teste regressão** `tests/unit/whatsappMessageDispatch.test.ts`: prova que o `messageHandler` é invocado com `text='$menu'` quando registrado (equivalente ao `setupAdapterHandlers`).

#### Status
- Build OK; suite 105/107 (2 falhas pré-existentes fora de escopo: `commands-registry`, `discordAdapter`).

## [v1.1.4] - 2026-08-07
### 🔧 Correção: $menu travava no WhatsApp (desacoplamento do AutoMod)

#### Alterado
- **`WhatsAppAdapter.on('message')`**: o despacho de comandos (`messageHandler`) agora é chamado **imediatamente**, sem `await` bloqueante do `processAutoMod`/`handleKeywords`. A moderação (AutoMod/keywords) passa a rodar em paralelo (fire-and-forget) e não bloqueia mais o caminho crítico de comandos.
- **Motivo:** `msg.getChat()` do whatsapp-web.js (chats `@lid`) podia pendurar a Promise em sessão instável, travando o Event Loop e impedindo que `$menu` e outros comandos fossem respondidos.

#### Adicionado
- **Teste regressão** `tests/unit/whatsappAutoModDecoupling.test.ts`: prova que o comando é despachado mesmo quando `getChat()` nunca resolve ou lança exceção.

#### Removido
- Logs temporários de diagnóstico (`FLOW_WPP` / `FLOW_PM` / `FLOW_WPP_SEND`) dos arquivos de produção após a correção.

#### Status
- Build OK; suite 104/106 (2 falhas pré-existentes fora de escopo: `commands-registry`, `discordAdapter`).

## [v1.0.0-JS-STABLE] - 2026-04-30
### 🚀 Estabilização e Blindagem de Produção

#### Adicionado
- **Novo Protocolo de Autenticação**: Implementada a variável `WARRIOR_AUTH_KEY` (16 caracteres) substituindo o sistema legado.
- **Middleware Manual de CORS**: Interceptor de Pre-flight (`OPTIONS`) respondendo com `204 No Content` para eliminar erros de `Failed to fetch`.
- **Diagnóstico Profundo**: Rota `/debug-env-check` no Relay para validar comprimentos de chaves e status de variáveis de ambiente.
- **Sanitização de URL**: Lógica no Frontend para remover automaticamente sufixos de porta (ex: `:296`) injetados por erro.

#### Alterado
- **Arquitetura Zero-Native (Anti-GLIBC)**: Remoção completa da dependência do SQLite no Relay. O armazenamento agora é **In-Memory** (Pure JS), resolvendo definitivamente os erros de `GLIBC_2.38` no Render.
- **Downgrade de Ambiente**: Node.js ajustado para **v20.x (LTS)** no `package.json` para máxima estabilidade em containers Linux.
- **Sincronização de Parâmetros**: Frontend e Bot agora utilizam `warriorKey` como padrão de comunicação.

#### Corrigido
- **CORS Pre-flight**: Erro de cabeçalho `x-api-key` não permitido resolvido com `Access-Control-Allow-Headers` explícito.
- **Polling Authentication**: Corrigido erro `401` no Bot ao tentar capturar localizações no Relay sem a chave Warrior.
- **Erro de Módulo**: Dependências `cors`, `express` e `dotenv` reinstaladas e formalizadas no `package.json`.

---

## [v1.1.1] - 2026-08-06
### 🔧 Recuperação de Produção (Bot Offline no Linux)

#### Corrigido
- **WhatsApp offline por ProtocolError de Puppeteer** (`Page.navigate timed out` / `Runtime.callFunctionOn timed out` durante `whatsapp-web.js` init).
  - **Causa:** o `dist/` do Linux não continha `protocolTimeout` no `puppeteerConfig` do `WhatsAppAdapter`. A máquina virtual do Linux reinicia eventualmente e o processo caía sempre na inicialização.
  - **Solução:** adicionado `protocolTimeout: 180000` ao `puppeteerConfig` em `src/platforms/whatsapp/WhatsAppAdapter.ts` (linha 46). O `whatsapp-web.js` encaminha esse campo para `puppeteer.launch()`, elevando o limite das chamadas CDP.
  - **Arquivo afetado:** `src/platforms/whatsapp/WhatsAppAdapter.ts`
  - **Commit:** `4f34b5e` (main)
- **DNS do Linux não resolvia `github.com`** (`Could not resolve host`). Resolver do container apontava só para o Tailscale DNS.
  - **Solução aplicada no servidor (sudo, manual):** `tailscale set --accept-dns=false` + `resolv.conf` fixo com `nameserver 8.8.8.8` / `1.1.1.1`. Isso reabilita o fluxo canônico Windows→GitHub→`git pull`→build→restart.
  - **Persistência:** `tailscale set --accept-dns=false` é persistente; `resolv.conf` é arquivo fixo (não symlink). Risco de reversão só em reboot completo do container que restaurasse o resolv.conf do PVE.

#### Validação
- `npm run build` OK (Windows e Linux).
- `pm2 restart bot-wpp` → status `online`, WhatsApp "Pronto como WarriorBlack (558581344211@c.us)", AutoMod ativo.
- `grep protocolTimeout dist/core/multiPlatform.js` = 1 ocorrência (fix presente no build de produção).

---

*Este é o estado estável pré-migração para TypeScript.*
