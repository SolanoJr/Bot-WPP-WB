# docs/AI_CONTEXT.md — Memória Técnica do Projeto Bot-WPP-WB

> Arquivo de continuidade para IDEs/agentes. Atualizado em 2026-08-20.
> Princípio: NÃO recomece a investigação do zero. Leia isto antes de agir.

## 1. Estado Atual

- **Data:** 2026-08-07
- **Branch:** `main` (Windows e Linux)
- **Commit atual:** `bf5e8ec` (HEAD; a correção do $menu via desacoplamento do AutoMod AINDA NÃO está commitada — ver seção "Alterações realizadas")
- **Build:** OK (7 targets CJS, 0 erros TS)
- **Testes:** `104 passed / 106` (2 falhas pré-existentes fora de escopo: `commands-registry.test.ts`, `discordAdapter.test.ts`)
- **Processo Linux:** PM2 `bot-wpp`, rodando `dist/core/multiPlatform.js`, online.
- **Ambientes:** Windows (dev, `D:\Desktop\SolanoJr\Programas\bot-wpp`), Linux prod (`solanojr@100.101.218.16:/home/solanojr/bot-wpp`). Sem worktrees. Sincronização via `scp` dos arquivos alterados + `npm run build` no Linux.

## 2. Arquitetura Descoberta

### Entrypoints
- **Bot principal:** `src/core/multiPlatform.ts` → compila para `dist/core/multiPlatform.js` (script do PM2 em `ecosystem.config.js`).
- **Servidor web de localização (Render):** `src/relay/server.ts` → `dist/relay/server.js`. Start Command do Render: `npm start` = `node dist/relay/server.js`. **Serviço SEPARADO do bot.**
- **Scripts (`package.json`):** `build:relay` compila `src/relay/server.ts`; `build` roda todos os `build:*`. `start` aponta para o relay.

### Adapters
- `src/platforms/whatsapp/WhatsAppAdapter.ts` — único que invoca `processAutoMod`/`handleKeywords` no `on('message')`.
- `src/platforms/telegram/TelegramAdapter.ts` — NÃO invoca AutoMod/keywords.
- `src/platforms/discord/DiscordAdapter.ts` — NÃO invoca AutoMod/keywords.

### PlatformManager (`src/platforms/PlatformManager.ts`)
- `startAll()`: `adapter.initialize()` → `setupAdapterHandlers(adapter)`.
- `setupAdapterHandlers` (linha ~96): `client.onMessage(async raw => { enrichMessage → detecta '$' → se comando, executeCommand })`.
- `client.onMessage` = `WhatsAppAdapter.onMessage(handler)` → `this.messageHandler = handler`.
- `commandRegistry` populado por `loadCommands(Map)` → `registerCommand` (loga `[PlatformManager] Comando registrado: <nome>`).
- `handleIncomingMessage()` (linha ~191) **NÃO participa do fluxo atual** — código morto/duplicado. O fluxo real usa o callback inline de `setupAdapterHandlers`.

### Fluxo de mensagens (confirmado por código)
```
WhatsAppAdapter.on('message')
  → (validações msg/id)
  → [AGORA] despacha messageHandler(platformMsg) IMEDIATAMENTE
  → [PARALELO, fire-and-forget] processAutoMod + handleKeywords
PlatformManager.setupAdapterHandlers callback
  → enrichMessage → detecta prefixo '$' → executeCommand
executeCommand → commandRegistry.get(name) → command.execute(ctx) → ctx.reply → WhatsAppAdapter.sendMessage
```

### Render / Serviço web
- `relay/server.ts` = Express que expõe `/location` (POST), `/pending/:chatId` (GET, polling), `/groups/:groupId/config` (GET/POST), `/telemetry`, `/health`.
- Usa `InMemoryRepository` (`src/relay/repositories/storage.repository.ts`) e `src/shared/types.ts`. Ambos existem.
- `$ondeestou` (`src/bot/commands/ondeestou.ts`) gera URL para `LOCATION_INTERFACE_URL` (site externo `https://bot-wpp-wb-sc.pages.dev`) com `relay = RELAY_URL` (`https://bot-wpp-relay.onrender.com`). O site externo envia a localização via POST ao Render e o bot faz polling em `/pending/:chatId`. **$ondeestou DEPENDE do Render.**

## 3. Descobertas (factos confirmados)

- `menu` está registrado no `commandRegistry` (`[PlatformManager] Comando registrado: menu (todas)` nos logs).
- `ERR_INVALID_ARG_TYPE` no error log era de `[Metrics]` (`res.end(promise)` em vez de `res.end(await ...)`) — **já corrigido** no dist atual; NÃO é causa do $menu.
- `PlatformManager.handleIncomingMessage()` não participa do fluxo real (código morto).
- **Causa do $menu não responder (RESOLVIDA - 2 etapas):** (1) o `processAutoMod` era chamado com `await` no caminho crítico, e para `@lid` em sessão instável `msg.getChat()` pendurava; (2) MESMO após o desacoplamento, o comando não respondia. Logs DIAG_WPP provaram: `msg.body="$menu"` correto mas `temHandler=false` — `this.messageHandler` era `null`. Causa raiz final: **`src/core/multiPlatform.ts` NUNCA chamava `platformManager.startAll()`**, que é quem registra o `messageHandler` via `setupAdapterHandlers`. Sem ele, nenhum comando era despachado.
- `relay/server.js` foi removido da pasta raiz na limpeza, mas `src/relay/server.ts` permanece. O Render quebra porque roda `npm install` (sem build) → `dist/relay/server.js` inexistente. **Correção do Render (pendente, fase separada):** garantir build do relay no Render (`build` ou `build:relay` antes de `node dist/relay/server.js`).

## 4. Investigação do $menu

- **Etapa 1 (desacoplamento AutoMod):** fronteira confirmada em `[AutoMod] botPart: false`; `@lid` + `getChat()` pendurava. Corrigido com fire-and-forget. Mas o $menu AINDA não respondia.
- **Etapa 2 (messageHandler nulo):** logs DIAG_WPP mostraram `msg.body="$menu"` + `temHandler=false`. O `grep "startAll"` provou que `startAll()` só era DEFINIDO e NUNCA CHAMADO. O `multiPlatform.ts` registrava adapters + chamava `initialize()` direto, mas faltava `await platformManager.startAll()`.
- **Correção:** `multiPlatform.ts` agora chama `await platformManager.startAll()` (initialize + setupAdapterHandlers para todas as plataformas); removidas as chamadas `initialize()` diretas.
- **Validação:** teste real de `$menu` no WhatsApp pelo usuário + teste unitário `whatsappMessageDispatch.test.ts` (prova despacho quando handler registrado).

## 4b. Correção do envio de resposta (`@lid` no sendMessage) — 2026-08-07

- **Sintoma em produção:** após o comando ser despachado e executado, o `sendMessage` falhava com erro de transporte (Puppeteer `CdpPage.evaluate` em `whatsapp-web.js`). O texto sendo enviado era `"⚠️ Ocorreu um erro interno ao executar este comando."` — o comando rodava, mas a **resposta não era entregue** no chat `@lid`.
- **Causa raiz:** o `chatId` recebido do `normalizeMessage` vinha como `@lid` (ex: `2592935567439@lid`). O `sendMessage` removia o prefixo `wpp:` mas **não convertia `@lid` → `@c.us`**. O WWebJS **NÃO aceita `@lid` como destino de `client.sendMessage()`**.
- **Correção (`src/platforms/whatsapp/WhatsAppAdapter.ts` → `sendMessage`):**
  - Higienizar: se `cleanChatId.endsWith('@lid')` → substituir por `@c.us` (targetJid).
  - Log explícito: `[WhatsAppAdapter] Enviando resposta para: <targetJid>`.
  - `try/catch` no `innerClient.sendMessage` capturando falhas de transporte (Puppeteer) e relançando como `Falha de transporte ao enviar mensagem (<jid>): <msg>` (não mascara execução do comando).
- **Roteamento do $menu (agnóstico):** confirmado — `PlatformManager.executeCommand` usa `commandRegistry.get(name)` + `ctx.reply()`; `menu.ts` usa `ctx.reply(menu)` (CommandContext); Telegram/Discord têm `sendMessage` nativo. Nenhuma alteração necessária no PlatformManager.
- **Documentação:** criado `docs/ARCHITECTURE_FIXES.md` (registro anti-regressão); referência adicionada no README.md.

## 5. Render

- **Start Command atual:** `npm start` → `node dist/relay/server.js` (package.json:15).
- **Motivo do erro:** `dist/relay/server.js` não existe no Render (limpeza removeu pasta `relay/` raiz; Render não roda build).
- **Função de `relay/server.js`:** backend de localização/$ondeestou (Express). Separado do bot.
- **Dependências encontradas:** `ondeestou.ts` → `RELAY_URL`; site externo `bot-wpp-wb-sc.pages.dev` → POST ao Render.
- **Solução aplicada/pendente:** Render deve buildar o relay. Não alterar o Start Command para o bot principal (quebraria $ondeestou). **Ainda NÃO aplicado — fase separada.**

## 6. $ondeestou

- **Comando:** `src/bot/commands/ondeestou.ts` (name `ondeestou`).
- **Fluxo:** gera link `LOCATION_INTERFACE_URL?token&chatId&warriorKey&relay`. Usuário abre no site externo, envia localização → site POSTa no Render (`/location`) → bot faz polling `/pending/:chatId`.
- **Domínio/site:** `bot-wpp-wb-sc.pages.dev` (Cloudflare Pages, externo); `bot-wpp-relay.onrender.com` (Render).
- **Dependências externas:** Render (relay), site Pages, `WARRIOR_AUTH_KEY`, `RELAY_URL`.
- **Status após correção do $menu:** inalterado (não mexido nesta fase). Funcionalidade preservada.

## 7. Alterações Realizadas (nesta sessão)

| Arquivo | Motivo | Alteração | Data | Resultado |
|---|---|---|---|---|
| `src/platforms/whatsapp/WhatsAppAdapter.ts` | $menu travava em processAutoMod | Desacoplamento: messageHandler chamado imediatamente; AutoMod/keywords em paralelo (fire-and-forget) | 2026-08-07 | Build OK; teste unitário passa |
| `src/platforms/PlatformManager.ts` | Remover logs temporários | Removidos marcadores `FLOW_PM` | 2026-08-07 | Build OK |
| `tests/unit/whatsappAutoModDecoupling.test.ts` | Regressão do desacoplamento | Novo teste (2 casos: getChat pendente / lança) | 2026-08-07 | 2 passed |
| `CHANGELOG.md` | Documentar | v1.1.4 | 2026-08-07 | — |
| `BUG_TRACKER.md` (raiz) | Documentar | BUG histórico (31+) | 2026-08-07 | — |

> **NENHUMA alteração foi commitada/pushada** (conforme regra). O Linux recebeu os arquivos via `scp` + `npm run build` + `pm2 restart` (registrado).

## 8. Testes

- **Comando:** `npm run build && npm test`
- **Resultado:** 104 passed / 106.
- **Falhas (pré-existentes, fora de escopo):** `commands-registry.test.ts` (piada não registrada no menu), `discordAdapter.test.ts` (mock GatewayIntentBits). Não introduzidas por esta correção.
- **Novo teste:** `whatsappAutoModDecoupling.test.ts` (2 casos) — valida que o comando é despachado mesmo com `getChat()` pendente ou lançando.

## 9. Decisões (inclui negativas)

- **NÃO mover AutoMod para `PlatformManager.setupAdapterHandlers`** — quebraria desacoplamento multiplataforma (AutoMod é específico do WhatsApp).
- **NÃO remover/alterar Start Command do Render para o bot principal** — $ondeestou depende do servidor relay no Render.
- **NÃO remover funcionalidades antigas sem prova de morte** — regra da limpeza.
- **Remover logs temporários FLOW_*** após a correção (não virarem lixo permanente).
- **Preservar moderação:** AutoMod continua ativo, só não-bloqueante.

## 10. Próximos passos (continuidade)

1. **Teste real do $menu** no WhatsApp (usuário) após deploy no Linux — confirmar resposta.
2. **Render:** ajustar para buildar o relay (`build:relay` ou `build` antes de `node dist/relay/server.js`) sem quebrar $ondeestou. Investigar Start Command no dashboard do Render.
3. **Telegram/Discord:** validar $menu nessas plataformas (tokens já configurados no `.env` do Linux via `TELEGRAM_BOT_TOKEN`/`DISCORD_BOT_TOKEN`).
4. **Commit/push** das alterações após validação (usuário decide).
