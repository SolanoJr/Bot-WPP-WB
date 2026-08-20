# 🐛 Bug Tracker - WarriorBlack Bot

Este documento registra bugs críticos encontrados e suas respectivas soluções para evitar reincidência.

## 1. Comandos Ignorados ($pergunta, $ban)
- **Sintoma**: O bot recebia o comando mas não respondia ou dava erro de "não definido".
- **Causa**: Conflito no `messageHandler.ts` onde a moderação interceptava o comando antes da execução, ou o `dist` estava desalinhado com o `src`.
- **Solução**: 
    - Reordenado o `messageHandler.ts` para que comandos (iniciados com `$`) pulem a moderação.
    - Forçado o uso de `handleKeywords` e `processAutoMod` com importações explícitas no `WhatsAppAdapter.ts`.
    - Atualizado o modelo da IA para `gemini-1.5-flash` para maior estabilidade e cota.

## 2. Gatilho "bot" sem Resposta
- **Sintoma**: Digitar "bot" no chat não gerava a resposta sarcástica.
- **Causa**: O `WhatsAppAdapter.ts` não estava importando ou chamando o `handleKeywords` corretamente após a migração para TypeScript.
- **Solução**: Importado `handleKeywords` no adaptador e adicionado bloco `try/catch` para interceptar a palavra-chave antes de enviar ao processador de comandos.

## 3. Erro no Comando $ban
- **Sintoma**: "client.blockContact is not a function".
- **Causa**: Uso de método inexistente na versão atual do `whatsapp-web.js`.
- **Solução**: Alterado para `contact.block()`, que é o método nativo correto da biblioteca.

## 4. Menu Desatualizado
- **Sintoma**: O menu não mostrava o status do AutoMod mesmo após a atualização.
- **Causa**: O `menu.ts` estava tentando importar de `moderationService` (antigo) em vez de `autoModService` (novo).
- **Solução**: Unificada a fonte de dados para `autoModService.ts` e atualizado o comando `$menu`.

---
---

## 41 (2026-08-20): WPP cai sozinho (Chromium travado) e não reconecta
- **Sintoma:** Bot "morre" quando dono chega em casa / muda de rede. Chromium do WWebJS trava no splash (swiftshader) ou sessão cai silenciosamente; `pm2` (autorestart) não mata pq node segue vivo.
- **Causa:** Sem watchdog. `disconnected` só reconecta se emitido; Chromium travado não emite. `restartOnAuthFail` só cobre auth fail.
- **Correção:** `setupWatchdog()` no `WhatsAppAdapter` (reconecta se >5min sem qr/ready, ou >30min inativo, ou WPP mudo). Logs `[CONEXÃO]` ricos (qr/auth/loading/initialize). `lastActivityTs` atualizado no `message` e `ready`.
- **Status:** Corrigido. Watchdog respeita QR pendente (não destrói antes do scan).

## 42 (2026-08-20): Confusão de logs — pong NÃO era reply de terceiro
- **Sintoma:** Selftest mandava `$ping` como o PRÓPRIO bot; dono mandou ping e não teve resposta (WPP caído, BUG 41).
- **Causa:** `ctx.reply` usa `client.sendMessage` (= wrapper do adapter, pois `adapter.client = this`). Funciona. "Não reply" era na verdade WPP caído.
- **Status:** Esclarecido. Reply OK; queda era BUG 41.

## 43 (2026-08-20): Pendências abertas (consolidado de TODO.md/BUGS.md da raiz)
- [ ] **SEGURANÇA:** Rotacionar tokens/chaves expostos fora do `.env` (Telegram, Discord, Gemini, Tailscale, SSH).
- [ ] Atualizar `TELEGRAM_BOT_TOKEN` no `.env` do Linux (401 Unauthorized — long polling bloqueado).
- [ ] `npm audit fix` em branch separada (8 vulns, 1 crítica) + build/test.
- [ ] Healthcheck que diferencie "PM2 online" de "WPP realmente conectado" — **PARCIAL:** logs `[CONEXÃO]` já mostram fase; falta endpoint/alert.
- **Status:** Aberto. Itens de 2026-07/08 ainda pendentes.

## 44 (2026-08-20): Histórico — desacoplamento AutoMod / startAll (2026-08-07)
- **Problema 5:** `$menu` travava — `processAutoMod` com `await` bloqueava despacho de comandos em `on('message')`. Corrigido: messageHandler chamado imediatamente, AutoMod fire-and-forget.
- **Problema 6:** Comandos não respondiam — `multiPlatform.ts` nunca chamava `platformManager.startAll()` (handler nunca registrado). Corrigido: `await platformManager.startAll()`.
- **Status:** Resolvido (histórico, mantido p/ não reincidir).

---

*Mantido por Hermes/Manus AI - Última atualização: 2026-08-20*
