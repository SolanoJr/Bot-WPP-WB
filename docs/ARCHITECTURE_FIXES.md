# docs/ARCHITECTURE_FIXES.md — Registro de Correções de Arquitetura (anti-regressão)

> Documento de contexto para IDEs/agentes. Mantenha atualizado a cada correção estrutural.
> Última atualização: 2026-08-07.

## 1. Tratamento de identificadores `@lid` (WWebJS recente)

### Contexto
O `whatsapp-web.js` (WWebJS) passou a entregar conversas privadas com JID terminado em **`@lid`**
(ex: `202658048684056@lid`, `2592935567439@lid`) — identificador de privacidade/dispositivo (LID).
Anteriormente usava-se `@c.us` para contatos e `@g.us` para grupos.

### Regras aplicadas no `WhatsAppAdapter`

1. **Recepção (`normalizeMessage`):**
   - `isGroup` é derivado APENAS de `msg.from.endsWith('@g.us')`. JIDs `@lid` e `@c.us` → `isGroup = false` (conversa privada válida, **nunca descartada**).
   - Extração resiliente de `messageId` (ordem de fallback):
     ```ts
     const messageId = msg.id?._serialized
       || msg.id?.id
       || (msg.id?.remote && msg.id?.id ? `${msg.id.remote}_${msg.id.id}` : null)
       || String(msg.id);
     ```
     O WWebJS novo entrega `msg.id` como `{ $1, remote, id }` **sem `_serialized`**; o fallback garante o ID correto.
   - Log de auditoria pós-normalização confirma a entrega ao handler:
     `[WhatsAppAdapter] Payload normalizado e enviado ao handler: ID=… Chat=… User=… Text="…" isGroup=…`

2. **Envio (`sendMessage`):**
   - O WWebJS **NÃO aceita `@lid` como destino de `client.sendMessage()`**. É preciso higienizar o `chatId` convertendo `@lid` → `@c.us` antes do envio:
     ```ts
     let cleanChatId = chatId.replace(/^wpp:/, '');
     if (cleanChatId.endsWith('@lid')) {
       cleanChatId = cleanChatId.replace(/@lid$/, '@c.us');
     }
     const targetJid = cleanChatId;
     ```
   - Log explícito do destino: `[WhatsAppAdapter] Enviando resposta para: <targetJid>`.
   - Falhas de transporte (Puppeteer/CdpPage.evaluate) são capturadas em `try/catch` e relançadas como
     `Falha de transporte ao enviar mensagem (<jid>): <msg>` — **não mascaram** a execução do comando.

### ⚠️ Risco de regressão
Se outra instância de IDE "simplificar" o `normalizeMessage` ou o `sendMessage` removendo o mapeamento
`@lid`→`@c.us`, os comandos paradão de responder em chats privados (erro de transporte no `sendMessage`).

## 2. Despacho de comandos (`messageHandler` / `startAll`)

### Causa raiz histórica
`src/core/multiPlatform.ts` registrava os adapters e chamava `adapter.initialize()` direto, mas **NUNCA
chamava `platformManager.startAll()`**. O `startAll()` é o único responsável por `setupAdapterHandlers()` →
`client.onMessage(handler)` → define `this.messageHandler`. Sem ele, `this.messageHandler` ficava `null` e
**nenhum comando era despachado** (o bot conectava mas silenciava `$menu`, `$ping`, etc.).

### Regra
`multiPlatform.ts` DEVE chamar `await platformManager.startAll()` após registrar os adapters.
Removidas as chamadas `initialize()` diretas dos adapters (evita double-init).

### Diagnóstico
Se comandos silenciam mas o bot está "Pronto": logar `msg.body` e `temHandler` no `on('message')`.
`temHandler=false` ⇒ `startAll()` não foi chamado.

## 3. AutoMod desacoplado do caminho crítico

`processAutoMod`/`handleKeywords` rodam em **paralelo** (fire-and-forget `void Promise.resolve().then(...)`)
no `WhatsAppAdapter.on('message')`. O despacho do comando (`messageHandler`) é chamado **imediatamente**,
sem `await` bloqueante. Justificativa: `msg.getChat()` do WWebJS para `@lid` em sessão instável pode pendurar
a Promise e travar o Event Loop.
**NÃO mover o AutoMod para `PlatformManager.setupAdapterHandlers`** (quebraria o desacoplamento multiplataforma).

## 4. Estabilidade do Chromium/Puppeteer

`puppeteerConfig` no construtor do `WhatsAppAdapter` inclui:
`--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-accelerated-2d-canvas
--no-first-run --no-zygote --single-process --disable-gpu --disable-extensions`.

Graceful shutdown: `process.on('SIGINT'/'SIGTERM')` → `client.destroy()` (evita zumbis do Chromium).
Logs estruturados para `qr`, `authenticated`, `auth_failure`, `ready`, `change_state`, `disconnected`.

## 5. Roteamento de comandos (agnóstico)

- `PlatformManager.executeCommand` é agnóstico: `commandRegistry.get(name)` → `command.execute(ctx)` → `ctx.reply()`.
- `menu.ts` usa `ctx.reply(menu)` (CommandContext) — funciona em WhatsApp/Telegram/Discord.
- Telegram/Discord têm `sendMessage` nativo próprio; não dependem da API crua do WWebJS.
- Regra geral: comandos NUNCA devem usar `msg.reply`/`msg.getChat`/`chat.removeParticipants` da API crua;
  usar `CommandContext` + `PlatformClient` (`removeParticipant`/`banParticipant`).

## 6. Testes de regressão (não remover)

- `tests/unit/whatsappMessageDispatch.test.ts` — prova que o `$menu` é despachado quando o handler está registrado.
- `tests/unit/whatsappAutoModDecoupling.test.ts` — prova que o comando é despachado mesmo com `getChat()` pendente/lançando.
- `tests/unit/groupCommands.test.ts` — `$kick`/`$ban` usam interface agnóstica + validação de permissão.

## 7. Falhas de teste conhecidas (fora de escopo / baseline)

- `tests/unit/commands-registry.test.ts` — piada não registrada no menu (teste desatualizado).
- `tests/unit/discordAdapter.test.ts` — mock de `GatewayIntentBits` (teste desatualizado).
- Estas 2 falham consistentemente e NÃO foram introduzidas pelas correções acima.
