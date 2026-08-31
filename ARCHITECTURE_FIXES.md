# ARCHITECTURE_FIXES.md — Regras de Anti-Regressão e Arquitetura Atual

> Fonte canonical para as seções 5.2 (Conectividade WhatsApp) e 5.3 (Arquitetura Atual)
> do AGENTS.md. O AGENTS.md aponta para este arquivo; mantê-lo atualizado evita
> divergência de documentação.

## 5.2. Conectividade WhatsApp (Baileys, sem Chromium)

- O engine ativo é **Baileys** (`@whiskeysockets/baileys`), que **NÃO usa Chromium/puppeteer** —
  conecta via WebSocket com o servidor WA. QR é gerado em PNG (`qrcode`) e enviado ao dono
  (ou salvo em `authDir/qr.png`).
- `WPP_ENGINE` foi **removido** — só existe o Baileys. O fallback WWebJS (`whatsapp-web.js`)
  foi eliminado (ver BUG_TRACKER BUG 39); todas as funcionalidades foram acopladas no Baileys
  (`getNumberId`, `getContactById`, `sendMedia` com voz, member-join, msg de prova, heartbeat).
- Timeout de diagnóstico de "não autenticou" é **240s** (o Baileys pode demorar a gerar QR
  em sessão nova).
- **Anti-regressão:** NUNCA reintroduzir `whatsapp-web.js`/`puppeteer` sem necessidade — o Baileys
  é o único engine. `qrcode-terminal` NÃO é mais usado (o Baileys usa `qrcode` para PNG).
- **Auth:** `sessionManager.ts` usa `WPP_SESSIONS` (CSV de números); cada número vira um
  `BaileysAdapter` com `authDir=sessions/<phone>` (configurável via `WPP_AUTH_DIR`). O env legado
  `WWEBJS_AUTH_DIR` foi renomeado para `WPP_AUTH_DIR` (commit 959c3cd).

## 5.3. Arquitetura atual (não confundir com a doc legada)

- **Entry point real do PM2:** `dist/core/multiPlatform.js` (configurado em `ecosystem.config.js`).
  O sistema multi-plataforma (`PlatformManager` + adapters) É o ativo.
- **Multi-número:** `src/services/sessionManager.ts` lê `WPP_SESSIONS` (CSV de números) e cria
  1 `BaileysAdapter` por número (authDir isolado `sessions/<phone>`, configurável via `WPP_AUTH_DIR`),
  registrado no `PlatformManager` como `whatsapp:<phone>`. Se `WPP_SESSIONS` vazio → modo legado
  (1 sessão `whatsapp`). `PlatformType` é `string` (não union).
- Detalhes de anti-regressão estrutural:
  - **Tratamento `@lid`**: mensagens de dono/grupo podem vir como `@lid` (número mascarado);
    o BaileysAdapter normaliza para o JID real antes de despachar.
  - **Despacho `startAll`**: `PlatformManager.startAll()` inicializa todos os adapters e registra
    handlers; não iniciar adapters fora dele.
  - **AutoMod desacoplado**: `autoModService` roda independente do messageHandler (não bloqueia
    o fluxo de comandos).
  - **Multi-sessão**: 1 adapter por número em `WPP_SESSIONS`; `whatsapp:<phone>` como chave.
  - **Baileys como único engine**: sem WWebJS/Chromium desde BUG 39.

## Bugs Críticos Recentes — timing/regressão

- **BUG 37** (typecheck): dívida de 70–71 erros TS resolvida — **0 erros** em `npm run typecheck`.
  Manter 0 erros em todo commit.
- **BUG 39** (remoção WWebJS): engine WWebJS eliminado; fallback acoplado no Baileys
  (`getNumberId`, `getContactById`, `sendMedia` com voz, member-join). `package.json` sem
  `whatsapp-web.js`/`puppeteer`.
