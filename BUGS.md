# BUGS.md - Registro Operacional

Este arquivo resume bugs ativos ou riscos operacionais que precisam de acompanhamento. O histórico detalhado existente continua em `docs/BUG_TRACKER.md`.

### Problema 4: $menu/$kick/$ban não funcionavam em Telegram/Discord
- **Sintoma:** comandos escritos para API crua do whatsapp-web.js (`msg.reply`, `msg.getChat()`, `chat.removeParticipants()`); `PlatformManager` passa `CommandContext` → quebrava fora do WhatsApp.
- **Causa raiz:** violação do desacoplamento — comandos acoplados à API do WhatsApp; interface `PlatformClient` não tinha gestão de membros.
- **Solução:**
  - `menu.ts` reescrito para `execute(ctx)` + `ctx.reply` (agnóstico).
  - Interface `PlatformClient`: adicionados `removeParticipant(chatId, userId)` e `banParticipant(chatId, userId)`.
  - Implementados em `WhatsAppAdapter` (removeParticipants + block), `TelegramAdapter` (kickChatMember/banChatMember), `DiscordAdapter` (guild.members.kick/ban).
  - `kick.ts`/`ban.ts` reescritos para `CommandContext` (permissão via `ctx.getChat().participants` + `isMaster`).
- **Arquivos afetados:** `src/bot/commands/menu.ts`, `kick.ts`, `ban.ts`, `src/platforms/base/PlatformTypes.ts`, `WhatsAppAdapter.ts`, `TelegramAdapter.ts`, `DiscordAdapter.ts`, `tests/unit/groupCommands.test.ts`.
- **Commit:** `7b2efab` (correção) + `60c169a` (testes).
- **Status:** Resolvido 2026-08-07. `$menu` funciona nas 3 plataformas (teste ✓); `$kick`/`$ban` usam interface agnóstica (testes ✓). Deploy no Linux via `7b2efab`.

## 2026-08-07 - Problema 3: metricsService retornava "Failed to collect metrics" - RESOLVIDO
- **Sintoma:** `GET /metrics` retornava `{"error":"Failed to collect metrics"}`; log: `TypeError [ERR_INVALID_ARG_TYPE]: The "chunk" argument must be of type string... Received an instance of Promise`.
- **Causa:** no `prom-client` v15, `registry.metrics()` é **async** (retorna Promise). O handler fazia `res.end(promise)`.
- **Solução:** `const metrics = await this.registry.metrics(); res.end(metrics);` em `src/services/metricsService.ts`.
- **Arquivo afetado:** `src/services/metricsService.ts`
- **Commit:** `015692b`
- **Status:** Resolvido 2026-08-07. `/metrics` retorna HTTP 200 com payload Prometheus; `/health` também OK na porta 3001.

## 2026-08-06 - Bot Offline por ProtocolError de Puppeteer + DNS do Linux - RESOLVIDO

### Problema 1: WhatsApp não inicializa (ProtocolError)
- **Sintoma:** `pm2 status bot-wpp` = `stopped`; log de erro: `ProtocolError: Page.navigate timed out. Increase the 'protocolTimeout' setting...` ou `Runtime.callFunctionOn timed out`.
- **Causa:** ausência de `protocolTimeout` no `puppeteerConfig` do `WhatsAppAdapter`. O `whatsapp-web.js` usa o Puppeteer padrão (30s) e estoura em ambiente headless lento.
- **Solução:** `protocolTimeout: 180000` em `src/platforms/whatsapp/WhatsAppAdapter.ts` (puppeteerConfig). Commit `4f34b5e`.
- **Arquivo afetado:** `src/platforms/whatsapp/WhatsAppAdapter.ts`
- **Status:** Resolvido 2026-08-06. Bot online, WhatsApp conectado.

### Problema 2: `git pull` falha com "Could not resolve host: github.com"
- **Causa:** resolver do container (LXC/PVE) apontava apenas para o DNS do Tailscale (`100.100.100.100`), que não resolve nomes públicos. DNS público (8.8.8.8) funciona.
- **Solução (sudo manual no servidor):**
  ```bash
  sudo tailscale set --accept-dns=false
  printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" | sudo tee /etc/resolv.conf >/dev/null
  getent hosts github.com   # deve retornar o IP
  ```
- **Status:** Resolvido 2026-08-06. Importante: se o container reiniciar e restaurar o resolv.conf do PVE, o DNS quebra de novo — reaplicar o comando acima (precisa de sudo).
- **Nota de segurança:** o agente NÃO usa `sudo -S` com senha em pipe (bloqueado por política). Comandos `sudo` devem ser executados manualmente pelo usuário no servidor.

## 2026-08-03 - Correção and normalizeMessage null/undefined - RESOLVIDO

### Problema: "Message undefined/null em normalizeMessage"
- **Causa:** WhatsAppAdapter.normalizeMessage() lançava exception quando mensagem era null/undefined
- **Evidências coletadas:**
  - Logs: `[WhatsAppAdapter.normalizeMessage] ENTRY - msgHash: mxhi79, msg: false msg.id: undefined typeof msg: undefined`
  - Stack trace apontava para `normalizeMessage` em `dist/core/multiPlatform.js:1338`
  - Erro propagado para `sendMessage` e `reply` no `PlatformManager`
- **Solução aplicada:**
  - Adicionadas validações defensivas antes de `normalizeMessage()` em event handlers
  - Adicionadas validações no início de `normalizeMessage()` com mensagens de erro detalhadas
  - Adicionados try-catch blocks ao redor `normalizeMessage()` chamadas
  - Validação em `sendMessage()` antes de chamar `normalizeMessage(sent)`
- **Arquivos afetados:** `src/platforms/whatsapp/WhatsAppAdapter.ts`
- **Status:** Resolvido em 2026-08-03 - Bot restarted e running with fixes
- **Validação:** Comandos $menu, $ban e $kick funcionando em WhatsApp, Telegram e Discord

### Problema: "r: r" error no getChatById()
- **Causa:** Issue #201838 no whatsapp-web.js após atualização do WhatsApp Web
- **Solução aplicada:** Workaround para retornar chat básico sem participantes quando erro "r" ocorre
- **Arquivos afetados:** `src/platforms/whatsapp/WhatsAppAdapter.ts`
- **Status:** Partialmente resolvido - chat funcional mas sem lista de participantes

## 2026-07-31 - Sessão de correção e sincronização

### WhatsApp ProtocolError - RESOLVIDO
- **Problema:** ProtocolError no Puppeteer ao inicializar WhatsApp (Target closed)
- **Causa:** webVersionCache fixo causando incompatibilidade com versão atual do WhatsApp Web
- **Solução aplicada:** Removido webVersionCache e ajustadas flags Puppeteer (--disable-web-security, --disable-features=VizDisplayCompositor, --disable-extensions, remoção de --single-process)
- **Arquivos afetados:** `src/platforms/whatsapp/WhatsAppAdapter.ts`
- **Status:** Resolvido em 2026-07-31 - QR Code gerado com sucesso

### Telegram Timeout - INVESTIGAÇÃO EM ANDAMENTO
- **Problema:** Telegram falha na inicialização com timeout após 30s
- **Evidências coletadas:**
  - Token validado externamente via API (getMe retornou ok: true)
  - Token configurado corretamente no .env do Linux
  - launch() do Telegraf trava sem resposta (nenhum erro 401 nos logs)
  - Mensagens são recebidas ($menu detectado nos logs)
  - Timeout de 180s bloqueava inicialização do Discord - reduzido para 30s
- **Hipótese:** Bloqueio de long polling ou restrição de rede/firewall no servidor Linux
- **Status:** Aberto - requer investigação de rede/firewall

### Discord Handlers - RESOLVIDO
- **Problema:** Discord não processava comandos (handlers não configurados)
- **Causa:** setupAdapterHandlers nunca era chamado - PlatformManager.startAll() não era invocado
- **Solução aplicada:**
  - Removida duplicação de handler em registerAdapter
  - Configuração explícita de handlers após inicialização de todos os adapters
  - Timeout do Telegram reduzido para 30s para não bloquear Discord
- **Evidências:**
  - `[Discord] ✅ Pronto como SolanoJr (1307158493907652648)`
  - `[PlatformManager] Configurando handlers para discord...`
  - `📊 Plataformas ativas: whatsapp, telegram, discord`
- **Arquivos afetados:** `src/platforms/PlatformManager.ts`, `src/core/multiPlatform.ts`
- **Status:** Resolvido em 2026-07-31 - Discord inicializado e handlers configurados
- **Pendente:** Testar comando $menu no Discord para validar funcionalidade

### Sincronização Git - RESOLVIDO
- **Problema:** Arquivo `src/core/multiPlatform.ts` não rastreado no Windows
- **Solução aplicada:** Commit e push para origin/main, sync com Linux
- **Arquivos afetados:** Git (Windows, GitHub, Linux)
- **Status:** Resolvido em 2026-07-31 - todos ambientes sincronizados no commit 389f667

### Limpeza de ambiente - RESOLVIDO
- **Problema:** Core dump de 53MB no Linux, worktrees prunable
- **Solução aplicada:** Remoção de core.* e git worktree prune
- **Arquivos afetados:** Ambiente Linux, Git
- **Status:** Resolvido em 2026-07-31

## 2026-07-31 - Produção divergente e reiniciando

- **Problema:** O servidor Linux de produção estava divergente do GitHub (`ahead 4, behind 68`) e possuía arquivos não rastreados (`test-env.js`, `test-pm2-env.js`).
- **Causa provável:** Alterações/deploys diretos em produção sem sincronização completa com GitHub.
- **Solução aplicada:** Commits locais preservados em `backup/linux-local-20260731`; produção resetada para `origin/main` (`4fe8396`); artefatos temporários removidos.
- **Arquivos afetados:** Ambiente Linux `/home/solanojr/bot-wpp`, Git.
- **Status:** Resolvido em 2026-07-31.

## 2026-07-31 - Falha de inicialização no WhatsApp Web em produção

- **Problema:** PM2 acumulou ~7039 restarts; Puppeteer falhava com `net::ERR_NAME_NOT_RESOLVED`.
- **Causa raiz:** Tailscale DNS (`100.100.100.100`) ativo sem resolvers upstream configurados; resolução externa retornava `SERVFAIL`.
- **Solução aplicada:** `sudo tailscale set --accept-dns=false` + resolvers `8.8.8.8`/`1.1.1.1`; limpeza de journals PM2 (~2.9 GB); redeploy com `multiPlatform`.
- **Validação:** PM2 online com 0 restarts; WhatsApp e Discord inicializados; `web.whatsapp.com` responde HTTP 200.
- **Arquivos afetados:** Ambiente Linux, PM2, DNS/Tailscale.
- **Status:** Resolvido em 2026-07-31.

## 2026-07-31 - Telegram 401 em produção

- **Problema:** Telegram falha na inicialização com `401: Unauthorized` após recuperação do servidor.
- **Causa provável:** `TELEGRAM_BOT_TOKEN` inválido, revogado ou divergente do `.env` de produção.
- **Impacto:** Telegram indisponível; WhatsApp e Discord continuam operacionais.
- **Solução recomendada:** Rotacionar token no BotFather, atualizar `.env` do Linux e reiniciar PM2.
- **Arquivos afetados:** `.env` (Linux), `src/platforms/telegram/TelegramAdapter.ts`.
- **Status:** Aberto.

## 2026-07-31 - Migração multiPlatform incompleta

- **Problema:** `preFlightCheck()`, métricas Prometheus e polling de `/ondeestou` existiam apenas em `whatsapp.ts`.
- **Solução aplicada:** Extraídos para `src/core/bootServices.ts` e integrados em `multiPlatform.ts` (métricas, preflight, location polling via `platformManager`).
- **Arquivos afetados:** `src/core/bootServices.ts`, `src/core/multiPlatform.ts`.
- **Status:** Resolvido em 2026-07-31 (pendente commit/push para GitHub).

## 2026-07-31 - Vulnerabilidades em dependências

- **Problema:** `npm audit` reportou 8 vulnerabilidades, incluindo 1 crítica.
- **Causa:** Dependências transitivas vulneráveis em pacotes como `tar`, `undici`, `brace-expansion`, `js-yaml`, `postcss` e `esbuild`.
- **Impacto:** Risco de DoS, leitura arbitrária em dev server no Windows e problemas em dependências transitivas.
- **Solução recomendada:** Rodar `npm audit fix` em branch separada, revisar mudanças no lockfile e executar build/test antes de deploy.
- **Arquivos afetados:** `package-lock.json`, possivelmente `package.json`.
- **Status:** Aberto.

## 2026-07-31 - Testes Discord instáveis no pacote completo

- **Problema:** `npm test` falhou no pacote completo por timeout em testes do Discord, mas os testes isolados passaram.
- **Causa provável:** Contenção/tempo dos mocks de `discord.js` ou re-login desnecessário durante inicialização repetida.
- **Solução aplicada:** `DiscordAdapter.initialize()` agora retorna imediatamente quando o cliente já está pronto, usa imports estáticos do `discord.js` v14 e os mocks de teste disparam `clientReady` sem timer real.
- **Arquivos afetados:** `src/platforms/discord/DiscordAdapter.ts`, `tests/setup.ts`, `tests/unit/adapters.test.ts`, `tests/unit/discordAdapter.test.ts`.
- **Status:** Resolvido em 2026-07-31; `npm test` passou com 101 testes.

## 2026-07-31 - Build de serviços empacotava teste

- **Problema:** `npm run build` gerava `dist/services/autoModService.test.js`.
- **Causa:** Script `build:services` usava glob `src/services/*.ts`, incluindo arquivos `.test.ts`.
- **Solução aplicada:** Script alterado para listar explicitamente os serviços de produção.
- **Arquivos afetados:** `package.json`.
- **Status:** Resolvido em 2026-07-31; `npm run build` validado.

### Problema 5: $menu travava no WhatsApp (processAutoMod bloqueava o caminho crítico de comandos)
- **Sintoma:** `$menu` (e qualquer comando) chegava ao `WhatsAppAdapter.on('message')`, rodava `processAutoMod`, e o fluxo parava silenciosamente em `[AutoMod] botPart: false` — sem erro capturado e sem despachar o comando. O usuário não recebia resposta.
- **Causa raiz:** `processAutoMod` (e `handleKeywords`) eram chamados com `await` **dentro** do `on('message')`, à frente de `if (this.messageHandler) await this.messageHandler(...)`. Para mensagens de chat privado (`@lid`), `msg.getChat()` / acesso a `chat.participants` do whatsapp-web.js podem iniciar uma Promise que **nunca resolve** quando a sessão WhatsApp Web está instável, pendurando o Event Loop e impedindo o despacho de comandos.
- **Solução aplicada:** desacoplamento não-bloqueante — o `messageHandler` (despacho de comando) é chamado **imediatamente**; `processAutoMod` + `handleKeywords` rodam em paralelo via `void Promise.resolve().then(async () => {...})` com `.catch()` próprio (fire-and-forget). A moderação continua ativa, porém não bloqueia mais o caminho de comandos.
- **Arquivos afetados:** `src/platforms/whatsapp/WhatsAppAdapter.ts` (função `on('message')`); `tests/unit/whatsappAutoModDecoupling.test.ts` (novo — prova que o comando é despachado mesmo com `getChat` pendente ou lançando).
- **Logs de diagnóstico removidos:** marcadores `FLOW_WPP` / `FLOW_PM` / `FLOW_WPP_SEND` (adicionados na investigação) foram retirados após a correção.
- **Status:** Resolvido 2026-08-07. Teste unitário criado (2 casos: getChat pendente e getChat lançando). Build OK; suite 104/106 (2 falhas pré-existentes fora do escopo: `commands-registry`, `discordAdapter`).

### Problema 6: $menu (e todos os comandos) não respondia — `messageHandler` nunca registrado
- **Sintoma:** após o desacoplamento do AutoMod (Problema 5), o `$menu` continuava sem resposta. Logs DIAG_WPP mostraram `msg.body="$menu"` correto, mas `temHandler=false` — ou seja, `this.messageHandler` era `null` no `WhatsAppAdapter.on('message')`, então o `if (this.messageHandler)` era falso e o comando nunca era despachado.
- **Causa raiz:** `src/core/multiPlatform.ts` registrava os adapters (`registerAdapter`) e chamava `adapter.initialize()` diretamente, mas **NUNCA chamava `platformManager.startAll()`**. O `startAll()` é quem invoca `setupAdapterHandlers(adapter)` → `client.onMessage(handler)` → `this.messageHandler = handler`. Sem esse call, o handler de despacho de comandos simplesmente não existia. O bot conectava (evento `ready` → "Pronto como WarriorBlack") mas não processava comandos.
- **Histórico:** o log antigo tinha 47 "Comando recebido" / 19 "Executando menu" de uma época em que o `startAll()` era chamado; a limpeza/refatoração removeu essa chamada e quebrou o despacho silenciosamente.
- **Solução aplicada:** `multiPlatform.ts` agora registra os adapters e chama **`await platformManager.startAll()`** (que faz `initialize()` + `setupAdapterHandlers()` para todos). Removidas as chamadas `initialize()` diretas dos adapters (evita double-init).
- **Arquivos afetados:** `src/core/multiPlatform.ts` (chamada de `startAll`); `tests/unit/whatsappMessageDispatch.test.ts` (novo — prova que o `$menu` é despachado quando o handler está registrado).
- **Status:** Resolvido 2026-08-07. Build OK; suite 105/107 (2 falhas pré-existentes fora do escopo: `commands-registry`, `discordAdapter`).
