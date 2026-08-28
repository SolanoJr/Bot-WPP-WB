# TODO.md - Próximas Ações

## Prioridade Alta

- [ ] Rotacionar imediatamente tokens, chaves SSH, chave Gemini, token Telegram, token Discord e chave Tailscale que foram expostos fora do `.env`.
- [x] Reconciliar produção Linux com GitHub (reset para `4fe8396`, branch backup `backup/linux-local-20260731`).
- [x] Investigar e corrigir DNS/rede do Linux (`tailscale set --accept-dns=false` + 8.8.8.8/1.1.1.1).
- [x] Auditar os 4 commits locais do Linux (preservados em branch backup; nada crítico a integrar).
- [x] Commit/push de `src/core/bootServices.ts` e `multiPlatform.ts` para sincronizar Windows ↔ GitHub ↔ Linux.
- [ ] Atualizar `TELEGRAM_BOT_TOKEN` no `.env` do Linux (401 Unauthorized - rede bloqueando long polling).
- [ ] Corrigir vulnerabilidades do `npm audit` em branch separada e validar com build/test.

## Prioridade Média

- [ ] Unificar o registro de bugs entre `BUGS.md` e `docs/BUG_TRACKER.md` para evitar duplicidade.
- [ ] Reduzir acoplamento dos testes de Discord a timers reais.
- [ ] Remover artefatos temporários de produção (`core.*`, scripts de teste soltos) somente após confirmar que não precisam ser preservados.
- [x] Revisar scripts de build: `build:services` não deve compilar `src/services/autoModService.test.ts` para `dist/services`.
- [ ] Investigar causa raiz de "Message undefined/null em normalizeMessage" (pode ser problema no whatsapp-web.js).

## Prioridade Baixa

- [x] Documentar runbook curto para sincronização Windows -> GitHub -> Linux ( commits 1b24a12).
- [ ] Adicionar checagem de saúde que diferencie "PM2 online" de "WhatsApp realmente conectado".
- [ ] Corrigir build de testes compilados em dist/services/ (workaround: excluir .test.ts do glob).

---
**Última atualização:** 2026-08-03 (Correção normalizeMessage null/undefined, sincronização completa)
