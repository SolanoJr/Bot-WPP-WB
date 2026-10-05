
## [2026-10-05] Fase 3-4 (Feedback + Sarcasmo) + Health Fix (BUG-017/020) — d153f10

### Implementado (verificado no código real + testes):
- `feedbackService`: registro de saída (`recordExitEvent`), agrupamento (`consolidatePending`), expiração (`listExpired`/`markExpired`), consulta (`listFeedback`/`stats`), mensagem formatada (`formatFeedbackRequest`/`formatTelegramNotification`). SQLite = fonte oficial. Telegram = espelho.
- `feedback_events` tabela + índices (`user`, `group`, `status`). Migration aplicada no Linux (DB atualizado).
- `feedback` flag em `group_mod`. Default OFF para grupos novos.
- Comando `$feedback` (on/off/status/lista/recentes/grupo/estatisticas) implementado e testado (26 testes).
- `sarcasmoService`: `containsBotWord` (palavra, não substring), `referencesWarriorBlack` (determinística: nome, reply, menção, "bot" palavra), `shouldRespond` (proteções: fromMe=false, isGroup=true, anti-loop via cooldown), `canRespond` (cooldown por grupo+usuário + global 5s), `markResponded`.
- Comando `$sarcasmo` (on/off/status) implementado e testado (32 testes).
- `sarcasmo` flag em `group_mod`. Default OFF.
- Integração no `BaileysMessageNormalizer`: detecta "bot" no texto da mensagem; respeita config `sarcasmo`; envia resposta diretamente via `sock?.sendMessage`.
- `BaileysHealth.syncToStore()`: atualiza `healthStore` proativamente no construtor, `setReady`, `setQrPending`. Corrige BUG-017/020 (health endpoint mostrando `awaiting-qr` quando conectado).
- `BaileysAdapter.getHealth()`: removida duplicação `setWppHealth` (agora só retorna, já que `BaileysHealth` sincroniza).

### Corrigido (verificado):
- BUG-017/020: `health` endpoint (`http://127.0.0.1:3001/health`) retorna `{"status":"healthy","wpp":"connected"}` quando WhatsApp está conectado. Antes retornava `awaiting-qr`.

### Testes (verificados no código real):
- `tests/unit/feedbackService.test.ts`: 26 testes (PASS).
- `tests/unit/sarcasmoService.test.ts`: 32 testes (PASS).
- `tests/unit/noGhostCommands.test.ts`: anti-regressão para comandos fantasmas (PASS).
- Total atual: 576 testes, 38 arquivos (PASS em Windows).

### Build + Deploy (verificados):
- `npm run build`: PASS (Windows e Linux).
- `git push origin main`: `d153f10` no GitHub.
- `git pull` + `npm run build` + `pm2 restart bot-wpp`: PASS no Linux (`online`, WhatsApp/Telegram/Discord conectados, PID 3143633).

### Documentação (atualizada com evidência real):
- `docs/KNOWN_ISSUES.md`: adicionada tabela de status pós-auditoria (PASS/⏳ PENDENTE) com referências ao código.
- Não registrado como resolvido: Welcome real (não testado com entrada real), Apresentações Telegram (não publicado real), Foto (não integrada), Rate limit (em memória), Pipeline AutoMod E2E (não validado com mensagem real de bot).

### Pendente (explicitamente não escondido):
- Welcome real com entrada de membro (requer acesso ao grupo).
- Apresentação real publicada no Telegram (requer membro + apresentação).
- Foto de apresentação (não implementada).
- Rate limit por grupo (cooldown global + per-user existe; rate limit ainda memória).
- Pipeline AutoMod E2E com delete real (requer grupo autorizado + mensagem real de bot).
