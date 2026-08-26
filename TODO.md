# TODO — Pendências do Bot-WPP

> Arquivo enxuto de pendências. Decisões arquiteturais ficam no `AGENTS.md`; bugs detalhados no `BUG_TRACKER.md`.

## Pendências conhecidas
- [ ] **WhatsAppAdapter.ts (WWebJS/Chromium, 1386 linhas) está obsoleto.** O engine ativo é Baileys (`WPP_ENGINE=baileys`). O `sessionManager.ts` ainda importa `WhatsAppAdapter` (usado só se engine=wwebjs). Remover após confirmar que nenhum fluxo depende dele. O import morto em `bot/commands/index.ts` já foi removido.
- [ ] **`docs/MONITORING_GUIDE.md` e `docs/ARCHITECTURE_FIXES.md`** — revisar se são redundantes com `ARCHITECTURE.md`/`AGENTS.md` e remover se obsoletos.
- [ ] **DNS no Linux:** o `dns.setServers` no `multiPlatform.ts` é inefetivo para `axios`/HTTPS (usa `getaddrinfo`/resolv.conf). O fix real é `/etc/hosts` + `resolv.conf` (8.8.8.8). Documentar ou remover o `dns.setServers`.
- [ ] **Testes automatizados** (`vitest`/`scripts/tests/autotest.js`) não cobrem a padronização de comandos `execute(ctx)`. Adicionar teste de regressão.

## Feito nesta auditoria (commit pós-auditoria)
- [x] Removido `commandExecutor.ts` (código morto).
- [x] Removido import morto de `WhatsAppAdapter` em `bot/commands/index.ts`.
- [x] Padronizados 33 comandos para `execute(ctx)` (mapeados `msg.author`→`ctx.userId`, `msg.from`→`ctx.chatId`, `msg.body`→`ctx.text`, `msg.getChat()`→`ctx.getChat()`, `msg.reply`→`ctx.reply`).
- [x] Deletados 7 branches locais obsoletos (copilot/agentes antigos).
- [x] Removidos docs redundantes de sessões antigas (`AI_CONTEXT`, `AI_HANDOFF`, `IMPLEMENTACAO_REPORT`, `CARD_PENDING`, `PLACEHOLDERS`).
- [x] Singleton no `getDb()` + `getChat` lazy no `CommandContext` (otimizações de latência).
- [x] `$ping` mede RTT real; `$pergunta`/`$clima` corrigidos para `ctx.reply`.
