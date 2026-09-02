# docs/ARCHITECTURE_FIXES.md — Registro de Correções de Arquitetura (anti-regressão)

> Estado atual (2026-09-02): o engine ativo é Baileys. As referências a WWebJS,
> Chromium e Puppeteer abaixo são contexto histórico de bugs já encerrados, não
> instruções para implementação nova.

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
   - ⚠️ **NÃO converter `@lid` → `@c.us`.** Correção anterior que fazia essa conversão quebrava o envio com `No LID for user` (o WWebJS moderno **exige o `@lid`** para enviar a esse contato).
   - Mantenha o `chatId` original (`@lid`) no envio. O `client.sendMessage` aceita o `@lid` como destino.
   - Higienizar APENAS o prefixo interno da plataforma (`wpp:`) e never alterar o sufixo do JID.
   - Fallback em caso de erro de transporte (`message.serialize`/`getMessageModel`): tentar
     `getChatById(chatId)` + `chat.sendMessage(text)` antes de falhar.
   - Log explícito do destino: `[WhatsAppAdapter] Enviando resposta para: <targetJid>`.
   - Falhas de transporte (Puppeteer/CdpPage.evaluate) são capturadas em `try/catch` e relançadas como
     `Falha de transporte ao enviar mensagem (<jid>): <msg>` — **não mascaram** a execução do comando.

### ⚠️ Risco de regressão
Se outra instância de IDE "simplificar" o `normalizeMessage` ou o `sendMessage` convertendo `@lid`→`@c.us`,
os comandos param de responder em chats privados (`No LID for user` no envio).

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

## 8. Inicialização de plataformas (`startAll`) — armadilhas (anti-regressão)

**Regra 1 — `startAll` SEMPRE paralelo.** Nunca `for { await adapter.initialize() }` sequencial.
O `TelegramAdapter.initialize()` dispara `launch()` do Telegraf, que **não resolve a Promise**
(long-polling só resolve ao encerrar o bot). Um `await` sequencial trava o loop e impede que
plataformas seguintes (Discord) inicializem. Usar `Promise.allSettled` (cada adapter em paralelo).

**Regra 2 — adapters NUNCA `await` `launch()`/`login()` bloqueante no `initialize()`.**
O `PlatformManager.setupAdapterHandlers()` (que registra o `onMessage` de despacho de comandos)
é chamado APÓS `adapter.initialize()` retornar. Se o `initialize()` não retorna, o handler de
despacho NUNCA é registrado → comando não responde (mesmo a plataforma "recebendo" mensagens).
O `TelegramAdapter.initialize()` deve disparar `launch()` em background (`.catch`) e retornar.

**Regra 3 — ao refatorar `menu.ts` ou qualquer comando de saída, PRESERVAR o conteúdo visual.**
A reescrita para `CommandContext` (agnóstico) não deve remover o layout do menu (HASH, uptime,
flags de status). Sempre manter ou melhorar — **nunca piorar** a apresentação.

**Sintoma de violação das Regras 1/2:** nos logs, só aparece `[WhatsApp] ✅ Pronto` e o Telegram/
Discord não aparecem como prontos; ou o Telegram recebe msgs mas `Executando <cmd> em telegram`
não aparece no log. Corrigir voltando ao padrão paralelo + launch em background.

## 9. Multi-número / Multi-sessão (SessionManager) — base para escalar (anti-regressão)

**Objetivo:** rodar N contas WhatsApp (números) no mesmo processo, cada uma com sessão
Chromium isolada. Implementado em `src/services/sessionManager.ts` (commit 40f9ee4).

**Como funciona:**
- `PlatformType` agora é `string` (não mais union fixa). Chaves válidas: `'whatsapp'`,
  `'telegram'`, `'discord'`, e `'whatsapp:<phone>'` (ex: `'whatsapp:558581344211'`).
- `getSessionConfigs()` lê `WPP_SESSIONS` do `.env` (CSV de números: `558581344211,559999999999`).
- `registerWhatsAppSessions()` cria 1 `WhatsAppAdapter` por número, cada um com `authDir`
  isolado em `sessions/<phone>`, e registra no `PlatformManager` sob a chave `whatsapp:<phone>`.
- Se `WPP_SESSIONS` estiver vazio → **modo legado**: 1 adapter com `platform='whatsapp'`
  (compatibilidade retroativa; usa `WWEBJS_AUTH_DIR` ou `.wwebjs_auth`).
- `WhatsAppAdapter` aceita `constructor({ authDir })`. O `connect()` usa `this.authDir`.

**Regras de anti-regressão:**
1. NUNCA hardcoded `platform === 'whatsapp'` para prefixar IDs. Usar `platform.startsWith('whatsapp')`
   (senão sessões `whatsapp:<phone>` perdem o prefixo `wpp:` nos chatId/userId).
2. Ao adicionar comando que opera em "todos os grupos do WhatsApp", iterar sobre as chaves
   `whatsapp*` do `PlatformManager`, NÃO assumir que existe só um adapter `'whatsapp'`.
3. Cada número = 1 processo Chromium (~300-500MB RAM). RAM é o gargalo real do escalonamento,
   não o código. Para "inúmeros números", prefira subir mais RAM OU migrar para Baileys (sem Chromium).
4. Para adicionar um novo número: apenas inclua no `WPP_SESSIONS` e `pm2 restart`. Sem código extra.

**Próximo passo (quando expandir de verdade):** comandos como `$automod`, `$menu`, broadcast
devem iterar todas as sessões `whatsapp:*`. Hoje só a sessão legada é coberta.

## 10. Estado do engine WhatsApp

O `BaileysAdapter` é o adapter ativo e usa WebSocket, sem Chromium. O contrato
`PlatformAdapter`/`PlatformClient` continua agnóstico para permitir futuras
plataformas, mas código novo deve integrar Baileys diretamente e não reintroduzir
WWebJS/Puppeteer sem decisão arquitetural explícita.

