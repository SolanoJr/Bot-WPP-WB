
## [2026-10-25 · noite] HANDOFF + PENDENCIAS-USUARIO + Dependabot r2 + $promover E2E (INC-022)

- `HANDOFF.md` (0b37419, 295 linhas): bíblia de continuidade — 10 seções (contexto, estado, features com status, INC-001→022, pendências, perguntas, regras, comandos, arquivos-chave, checklist F0). Atualizado a cada mudança de estado.
- `PENDENCIAS-USUARIO.md` (novo): tudo que SÓ o dono faz — testes visuais, manuais no Grupo Teste, decisões de produto (Fortaleza A/B), infra, carga. Consultar quando o projeto estiver "liso liso".
- Dependabot round 2 (4d496ab): `npm audit fix` → **0 vulns em produção** na VPS (body-parser high DoS zerado; restam 3 dev-only breaking — vite/tinypool, cosmético). LIÇÃO: `npm ci --omit=dev` remove o typescript e MATA o build da VPS — build exige devDeps; corrigido com `npm ci` completo.
- `/lab/promote-member` (7143873) + **INC-022**: prova E2E do `$promover` no Grupo Teste — candidato conta-de-teste (PN 639474500179) promovido 18:50:33 via `promoteParticipant` real e confirmado admin no `/lab/group-info`. Proteções idênticas ao remove-member (MASTER/bot/já-admin/bot-não-admin/sem-adapter). Reversão manual pelo WhatsApp (sem demote — decisão). 2 testes de rota; suite 945/0/3.
- Auditoria de comandos × adapters (2B): 65 comandos, 8 métodos da interface em uso — 7 implementados nos 3 adapters, `promoteParticipant` WhatsApp-only por design, **0 métodos fantasmas** (o $promover era o único).
- Consistência de docs (2C): INC-016 ganhou bloco próprio no BUGS.md (era pendência do INC-005 implementada sem registro); PERMISSIONS.md verificado correto (2 papéis + bot protegido, ADMIN de .env removido).
- Cleanup VPS: `.env.bak` ×2 + `nl.js` (script de inject avulso) movidos para /tmp (recuperáveis) — working tree 100% limpa.
- Estado final: GitHub=VPS=local sincronizados; backup diário rodando (4 snapshots 25/10, rotação 7); pm2 online estável; 3 pernas verdes.

## [2026-10-25] Auditoria 3 ambientes + P1 backup diário + P2 limpeza — auditoria mandato técnico

### Contexto (matriz dos 3 ambientes):
- Windows `main@7951d12d` clean · GitHub `main@7951d12d` · Linux `main@7951d12d` (deploy 24/out 23:59). Ambientes alinhados; `.env` de produção contém o contrato INC-021 (LAB_*/TELEGRAM_PRESENTATION_*).

### Implementado (P1 — Integridade dos dados):
- `backupService` (novo): snapshot diário do SQLite via `VACUUM INTO` (materializa o WAL — lição do incidente 14/out) + gzip + rotação `BACKUP_KEEP` (default 7) em `BACKUP_DIR` (default ./backups). Roda no boot + a cada 24h, best-effort (falha loga, não derruba).
- Plugado no boot do `multiPlatform` ao lado dos demais schedulers.
- `backupDatabase()` existia desde 14/out, mas NENHUM scheduler o chamava — backups eram manuais e voláteis em /tmp.

### Implementado (P2 — anti-overengineering):
- `PlatformTypes`: removidos `mute?/unmute?/promote?/demote?` — abstração fantasma comprovada: 0 adapters implementavam, 0 callers (grep). Caminhos reais: `$mute` Map in-memory, `$promover` via `groupParticipantsUpdate` (exige chatId — assinatura que a interface nunca teve). TODOs rodada-3 resolvidos por remoção.
- `.env.example`: documentados os envs do INC-021 (LAB_GROUP_ID, LAB_PRESENTATION_CHAT_ID, TELEGRAM_PRESENTATION_CHAT_ID/THREAD_ID) e os novos BACKUP_DIR/BACKUP_KEEP.

### Auditoria sem ação necessária (evidência):
- Telemetria de comandos: `command_usage_events` já cobre command/alias/platform/bot/chat/user/outcome/permission/duration/correlation + 3 índices + retenção 180d.
- Segurança SQL: todos os pontos dinâmicos usam bind `?` ou escape (VACUUM INTO escapa aspas); zero secrets em logs.
- `platform ===` no core/services: apenas 4 ocorrências — abstração de adapters é real.
- Comandos: 65 arquivos, todos registrados no index; nenhum órfão evidenciado.

### Testes:
- `tests/unit/backupService.test.ts` (novo, 3 testes): .db.gz válido com dado restaurado, rotação por mtime, falha alta com dir inválido. Suite: ver gates do commit.

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

## [INVENTÁRIO 2026-10-05] Listas ($lista1/$lista2/$lista3)
- Nenhum arquivo físico, nenhuma tabela SQLite, nenhum código, nenhum arquivo removido no git.
- Arquitetura do bot (group_mod, presentationService, feedback_events, databaseService, captureStore) SUPORTA listas.
- Decisão: NÃO implementar nesta fase (não é expansão); NÃO declarar morto — apenas 'não existente, arquitetura suportada'.
- Nenhuma alteração no código atual necessária para futura ativação.
