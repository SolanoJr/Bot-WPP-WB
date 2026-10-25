# HANDOFF — Bot-WPP / WarriorBlack

> **Bíblia de continuidade** — tudo que uma nova sessão (IA ou humana) precisa
> para continuar o trabalho sem perder contexto. Gerado em **25/10/2026** após a
> auditoria do mandato técnico (commit `a47fe6a`). Se algo aqui divergir do
> código, **o código vence** — e este arquivo deve ser corrigido.

---

## 1. CONTEXTO DO PROJETO

**O que é:** Bot multi-plataforma (WhatsApp principal, Telegram espelho/controle,
Discord secundário) para gerenciar comunidades do WhatsApp do dono (WarriorBlack):
welcome de novatos, apresentações, feedback de quem sai, notícias, moderação
automática (antibot/antispam/antilink) e telemetria de comandos. Roda em VPS
caseira atrás de Tailscale — **sem IP público**, custo zero.

**Stack:** Node.js + TypeScript · Baileys (WhatsApp multi-device) · SQLite
(`data/bot_database.db`, sem ORM — SQL direto com binds `?`) · PM2 (process
manager) · Vitest (testes) · Express (métricas 3001, lab 3004, discord-screen 3002).

**Os 3 ambientes:**

| Ambiente | Caminho | Papel |
|---|---|---|
| Windows (dev) | `D:\Downloads\Bot-WPP-WB-main` | código, testes, gates. **Sem cred GitHub local** |
| Linux (prod) | `~/bot-wpp` em `solanojr@100.101.218.16` (SSH, Tailscale) | runtime real, DB real, PM2 |
| GitHub | repositório remoto `origin` | fonte da verdade do histórico |

**Fluxo de deploy (regra permanente — automático após gates verdes):**
`typecheck 0 erros + build 0 erros + npm test 0 falhas` → commit → **push via
bundle** (local não tem cred: `git bundle create` → scp pra VPS → fetch+push
com `~/.git-credentials` da VPS) → **deploy na VPS**: backup `/tmp/bw-<ts>` →
`git reset --hard origin/main` → `npm ci && npm run build` → **sourced restart**
(`set -a; . ./.env; pm2 restart bot-wpp` — .env novo EXIGE sourced restart) →
3 pernas de smoke: `/health` 200, `/lab` 200, boot log `🎉 prontas!`.

**REGRA DE OURO: TODO teste vai para o GRUPO TESTE `120363410094452673@g.us` —
nunca em grupos reais.** Testes de código/DB são locais ou headless. Nunca
remover/adicionar membros em grupos de produção. (A violação disso foi o INC-019.)

**Canais do dono:** PV `146078742` (alertas/testes) · grupo Telegram
`-1003470059875` tópico `2` (Apresentações — destino de produção).

---

## 2. ESTADO ATUAL (25/10/2026)

| Item | Estado | Última verificação |
|---|---|---|
| origin/main (GitHub) | `7143873` (+doc: BUGS/HANDOFF INC-022) | 25/10 18:52 |
| VPS (~/bot-wpp) | `7143873` — deploys 18:05/18:40/18:48 todos verdes | 25/10 18:48 |
| Local (Windows) | sincronizado com origin/main | 25/10 |
| pm2 `bot-wpp` | online, boot `🎉 prontas!` 18:48:46, 0 [ERROR] novo | 25/10 18:48 |
| Smoke pós-deploy | `/health` 200 (`wpp:connected`) · lab 200 · `/lab/adapter` POST 200 | 25/10 18:48 |
| **Backup diário** | **FUNCIONANDO**: `backups/bot-wpp-2026-10-25T180547.db.gz` (677 KB) no boot, log `[backup] boot: ... (676 KB)` | 25/10 18:05 |
| **Vulns produção** | **0** (`npm audit --omit=dev` na VPS: found 0) — Dependabot round 2 feito (body-parser high) | 25/10 18:40 |
| Testes | **945 passed / 0 failed** / 3 skipped (flaky Discord, `it.skip` documentado) | 25/10 |
| typecheck/build | 0 erros | 25/10 |
| Disco VPS | 49% (16 G livres) | 25/10 18:07 |

**Portas na VPS:** 3001 `/metrics` (127.0.0.1) · 3004 `/lab` · 3002 discord-screen
viewer · 3005? (não usado).

**Timers/schedulers ativos** (boot + interval, todos `.unref()`):
- no processo: consolidação de apresentações (2 min) · autoMod cleanup (15 min) ·
  feedback worker (6 h) · monitor de memória (60 s) · cleanup geral (6 h) ·
  **backup diário do SQLite (boot + 24 h — NOVO, `a47fe6a`)**
- systemd/cron da VPS: monitor 5 min (disco/mem/tailscale/pm2 → alerta no PV,
  cooldown 1 h) · watchdog · mensal dia 1 04:00

**Infra VPS (INC-013, 21/10):** fail2ban ativo · PermitRootLogin no · journald
cap 200M · pm2-logrotate · unattended-upgrades · snaps GUI removidos (3G→46M) ·
`tailscale set --accept-dns=false` (MagicDNS no resolv.conf mata apt quando o
tailnet cai — lição registrada). LXC Proxmox: `df` não reflete limpezas
(loop2 = backing file). **Disco/mem de 21/10 eram saudáveis; re-coletar no F0.**

**Sessão WhatsApp:** multi-device Baileys, auth em `~/bot-wpp/.wpp` (não apagar!),
health `connected` na última verificação.

**⚠️ Tailscale do PC (RESOLVIDO 25/10 ~20:55):** o daemon local ficou preso em
`NoState` com 2× `tailscaled.exe`; fix aplicado pelo usuário (`taskkill /F /IM
tailscaled.exe` + `net start Tailscale`). Se reaparecer: mesmo fix. O Tailscale
da VPS é independente e permaneceu sadio o tempo todo.

---

## 3. FEATURES IMPLEMENTADAS

| Feature | Estado | Evidência |
|---|---|---|
| **Welcome** (aviso aditivo de apresentação no join + boas-vindas com menção PN+PN, toggle `$bemvindo`, texto editável `$setwelcome`) | 🟢 produção | INC-010 (`04952b4`) + INC-012b; E2E real com restauração via PN (23/10, logs `welcome enviado`) |
| **Apresentação** (default aditivo, confirmação imediata no grupo, consolidação 2 min → Telegram, foto picsum 1× para os 2 canais, **route por origem**: teste→PV do dono, produção→grupo TG tópico 2) | 🟢 produção | INC-017/020/021; `df31ba9`; E2E Caio 23/10 e Alberto 24/10 (msg 220 nos logs) |
| **Feedback** (PV ao que saiu após 20 min, resposta dele → 📩 detalhada no PV do dono, anti-spam: `MAX_PV_PER_RUN=10`, cooldown por user, expira 7 d → `expired`) | 🟢 produção | INC-020/021; `23d1133`, `7747e61`, `84de488`; stress test 24/10: sent=10/deferred=10/cooldown=1/tooOld=1 |
| **Notícias RSS** (`$noticias`, Geek 08:00, dedup por hash, meta de grupos persistida) | 🟢 produção | INC-001→006→009→011 (`30b1bf6` RSS-first); dedup `92ebb78` |
| **Antibot** (score somatório + combo kick) | 🟢 produção | INC-008 (`be3cb2a`) |
| **`$cmd` toggle persistido** (tabela `command_state`, dispatcher lê o banco) | 🟢 produção | INC-015; `databaseService.ts:132` |
| **Permissões** (MASTER > admin-grupo > USER; gating por handler `isMaster`/`isSenderGroupAdmin`; stub central removido por decisão arquitetural) | 🟢 produção | INC-015; docs/PERMISSIONS.md + E2E por nível |
| **Render watchdog** (screenshare Discord: `rendered` 2 s → >4 s sem pintura com rede viva → keyframe; falsos positivos excluídos: aba oculta, rede morta, WebRTC, heartbeat velho, cooldown 8 s) | 🟢 código | suíte 96/96 local+VPS; **E2E ao vivo pendente** (precisa OAuth Discord + broadcaster) |
| **Monitoramento VPS** (monitor 5 min → alerta no PV `146078742`, cooldown 1 h; fail2ban, unattended, journald 200M) | 🟢 produção | INC-013 |
| **Tailscale watchdog** (systemd na VPS; `--accept-dns=false`) | 🟢 produção | INC-012/013 |
| **Detector de MASTER fantasma** (warning quando MASTER_USER não resolve; sanidade no boot) | 🟢 produção | `src/core/multiPlatform.ts:37` |
| **Backup diário do SQLite** (VACUUM INTO + gzip + rotação 7 em `BACKUP_DIR`) | 🟢 produção | `a47fe6a`; 3 testes unit; **primeiro backup real no boot 25/10 18:05 (677 KB)** |
| **`$promover`** (via `promoteParticipant(chatId,userId)` Baileys, status≠200 → erro claro) | 🟢 **E2E provado no Grupo Teste 25/10 18:50** (INC-022): candidato conta-de-teste promovido a admin e confirmado via `/lab/group-info`; reversão manual pendente no dono | `7143873`; rota `/lab/promote-member`; 5 testes unit + 2 de rota |
| **Telemetria de comandos** (`command_usage_events`: command/alias/platform/bot/chat/user/outcome/permission/duration/correlation_id, 3 índices, retenção 180 d; `command_logs` legado) | 🟢 produção | auditado 25/10 — completo, nada a fazer |

---

## 4. INCIDENTES (INC-001 → INC-021)

| ID | Descrição | SHA | Status |
|---|---|---|---|
| INC-001 | $noticias: 404 model_not_found nos 2 providers | — (17/10) | ✅ resolvido (troca de modelo; culminou no RSS-first INC-011) |
| INC-002 | askAI/$pergunta no Gemini 2.5 descontinuado | `4dae5af` | ✅ resolvido 19/10 |
| INC-003 | Hermes: modelos EOL no NIM, :free extinto no OpenRouter (ferramenta do Hermes, não do bot) | — (17/10) | ✅ contornado |
| INC-004 | kick/ban: "plataforma sem lista" quando metadata sem participants | — (18/10) | ✅ resolvido (testes `groupAdminKickBan`) |
| INC-005 | Discord screenshare: reconexão mobile + freeze web | — (18/10) | ✅ resolvido (freeze → render watchdog INC-016); **app PC: devtools do usuário pendente** |
| INC-006 | Dedup de notícias (repetidas no dia) | `92ebb78` | ✅ resolvido 18/10 |
| INC-007 | "3 notícias em vez de 5" | — | ✅ não é bug (comportamento por design) |
| INC-008 | Antibot v1: score somatório + combo de kick | `be3cb2a` | ✅ resolvido 19/10 |
| INC-009 | Notícias no Geek + meta de grupos persistida | `99028c6` | ✅ resolvido 19/10 |
| INC-010 | Welcome não taggeia o novato (LID vs PN) | `04952b4` | ✅ resolvido 19/10 |
| INC-011 | Notícias desatualizadas (LLM sem browsing "lembrava") → RSS-first | `30b1bf6` | ✅ resolvido 20/10 |
| INC-012 | VPS inacessível por Tailscale | — (21/10) | 🟡 infra aberta (não afeta o bot) |
| INC-012b | $setwelcome ADITIVO (feature de design) | — (21/10) | ✅ entregue |
| INC-013 | Manutenção VPS: DNS quebrado + hardening completo | — (21/10) | ✅ fechado 100% |
| INC-014 | Dependabot prod (5 vulns) + $clima testado | `npm audit fix` | ✅ resolvido 21/10 |
| INC-015 | Dívidas de permissão (stub checkPermissions / $cmd toggle / ADMINS) | — (21-22/10) | ✅ dívidas 1-2 resolvidas (stub removido; toggle no banco); 🟡 dívida 3: lista ADMINS do .env **sem consumidor** (só blindagem anti-ban em `databaseService.ts:990`) |
| INC-016 | Render watchdog (resiliência screenshare) | suíte 96/96 | 🟡 mecanismo provado por testes; log real pendente de transmissão ao vivo |
| INC-017 | Apresentação: coletor surdo (senderId vs userId), nome multi-linha, env vazio (|| vs ??) | `621bae7`/`03d30e5` | ✅ resolvido 23/10 |
| INC-018 | Welcome real: sensor de admin cego (p?.admin vs isAdmin mapeado) + add aceita PN, não LID | `197aae4`/`606900e` | ✅ resolvido 23/10 |
| INC-019 | Violação de escopo: teste no grupo Figurinhas em vez do Grupo Teste | — (23/10) | ✅ documentado; escopo restaurado, lição registrada |
| INC-020 | Apresentação: default aditivo + aviso no join + confirmação imediata + feedback com espelho Telegram | `8339da0`+ | ✅ resolvido 23/10 |
| INC-021 | E2E com pessoa real: PV do feedback nunca saía ({text} obj vs string; PN NULL do cache), nome em linha única, 📩 ao dono, route por origem, foto 1×, idade "24" sem "anos", display_name no leave | `df31ba9`+`daee872` | ✅ resolvido 24-25/10 (display_name='Alberto' confirmado no DB 25/10) |
| INC-022 | Prova funcional E2E do $promover (fix a47fe6a) + rota /lab/promote-member; candidato conta-de-teste promovido 18:50:33 e confirmado admin; demote não existe — reversão manual pelo WhatsApp | `7143873` | ✅ resolvido 25/10 (reversão manual pendente no dono) |

**Auditoria 25/10 (mandato técnico):** `a47fe6a` — P1 backup diário, P1 $promover
quebrado (0 adapters implementavam), P2 fantasmas da interface, P2 .env.example.
Detalhe completo em `docs/CHANGELOG.md`.

---

## 5. PENDÊNCIAS ABERTAS

### Técnicas (não bloqueiam testes)
1. ~~Push + deploy do `a47fe6a`~~ **FEITO 25/10 18:00-18:05** (push `0b37419`, deploy, 3 pernas verdes, backup nasceu).
2. Render watchdog: log real `keyframe pedido` (exige transmissão ao vivo).
3. ~~Dependabot~~ **round 2 feito 25/10**: `npm audit fix` (4d496ab) → **0 vulns em produção** na VPS; restam 3 dev-only (vite/tinypool, breaking — cosmético; GitHub Dependabot ainda lista por contar dev/CI).
4. **Reverter admin de teste no Grupo Teste** (INC-022): PN 639474500179 foi promovido para provar o $promover; dono remove pelo WhatsApp (grupo → info → membro → remover admin). Sem demote no bot (decisão: não criar).
5. Dívida INC-015-3: consumidor para `ADMINS` do .env (ou remover do .env).
6. BACKLOG edge cases: normalizer (8 pontos), automod (7), sender/quotedText,
   deleteMsg — `laboratorio/BACKLOG.md`.

### Testes manuais do usuário (só ele faz)
1. Confirmar msg 221 (forward da apresentação) no Telegram.
2. $promover no Grupo Teste (pós-deploy — agora funcional).
3. App PC do Discord: Ctrl+Shift+I na Activity → colar console/rede (tela preta pré-JS).
4. Testes manuais gerais de produção (o "liso liso" antes de ativar em grupos reais).

### Decisões pendentes
1. **Produção: apresentações de TODAS as comunidades no mesmo grupo Fortaleza
   (tópico Apresentações) ou uma comunidade = um destino?** (route atual: um grupo TG).
2. Ativar apresentação/feedback/welcome nos grupos de produção (grupo a grupo).
3. Welcome com prazo de apresentação (hoje: sem TTL) — mudar?

### Melhorias futuras (backlog)
Render watchdog E2E ao vivo · $despromover (nasce com assinatura `chatId`) ·
estatísticas de apresentações ($stats de apresentação) · maiores ver
`laboratorio/BACKLOG.md` e `docs/BACKLOG.md`.

---

## 6. PERGUNTAS PARA O USUÁRIO

1. **A msg 221 (forward da apresentação do Alberto) chegou no Telegram dele?**
   (prova visual do fluxo completo; nos logs, sim — `sent=1` 24/10 21:49)
2. **Produção: todas as comunidades no mesmo grupo Fortaleza, ou cada comunidade
   com o seu destino de apresentações?**
3. ~~O evento do Alberto tem `display_name='Alberto'`?~~ **RESPONDIDA 25/10
   (query no DB)**: sim — `('whatsapp|60382962012254@lid|120363410094452673@g.us|1792886991039', 'Alberto', 'contacted', 1, None)`. Fix `daee872` confirmado em produção.

---

## 7. REGRAS PERMANENTES (não negociáveis)

1. **Só o GRUPO TESTE `120363410094452673@g.us` recebe testes** — nunca grupos reais.
2. **Deploy automático após gates verdes** (typecheck 0 + build 0 + test 0 falhas) —
   sem perguntar de novo.
3. Janelas do código: **feedback 7 dias** (expira → `expired`); **apresentação sem
   TTL** (confirmação imediata + consolidação 2 min).
4. Roteamento: **grupo de teste → PV do dono** (`146078742`); **produção → grupo
   Telegram** `-1003470059875` tópico `2`.
5. **NUNCA remover/adicionar membros em grupos reais**; no Grupo Teste, sempre
   restaurar (`/lab/restore-member`, add por PN — LID dá bad-request, INC-018).
6. **Nunca destruir histórico git** (sem force-push, sem rewrite).
7. **PARE em gate vermelho** — mostrar o erro, não "ajeitar" o teste.
8. `.env` novo na VPS **exige sourced restart** (`set -a; . ./.env; pm2 restart`).
9. Nunca apagar o banco (`data/bot_database.db`) nem a sessão WhatsApp (`.wpp`).
10. Backups antes de qualquer reset de deploy: `/tmp/bw-<ts>` (e agora o diário `backups/`).

---

## 8. COMANDOS ESSENCIAIS

```bash
# ── SSH na VPS ──────────────────────────────────────────────
ssh solanojr@100.101.218.16            # tudo abaixo roda lá: cd ~/bot-wpp

# ── Deploy completo (na VPS, após push estar no origin) ────
TS=$(date +%s); cp data/bot_database.db /tmp/bw-$TS && \
git fetch origin && git reset --hard origin/main && \
npm ci --omit=dev && npm run build && \
set -a; . ./.env; pm2 restart bot-wpp
# smoke (3 pernas): curl -s localhost:3001/health | grep connected
#                   curl -s localhost:3004/lab | head -1
#                   grep "prontas" ~/.pm2/logs/bot-wpp-out.log | tail -1

# ── Push via bundle (Windows → VPS → GitHub; Windows NÃO tem cred) ──
git bundle create "$TMPDIR/route-fix.bundle" main ^origin/main
scp "$TMPDIR/route-fix.bundle" solanojr@100.101.218.16:/tmp/
# na VPS: cd ~/bot-wpp && git fetch /tmp/route-fix.bundle main:incoming && \
#         git push origin incoming:main && git fetch origin && git reset --hard origin/main

# ── E2E no Grupo Teste (rotas /lab do testServer, port 3004) ──
curl -s -X POST localhost:3004/lab/inject-message -H 'content-type: application/json' \
  -d '{"groupId":"120363410094452673@g.us","text":"...","from":"<pn>@s.whatsapp.net"}'
# outras: /lab/group-info · /lab/remove-member · /lab/restore-member (add por PN!)
#         /lab/remove-and-add · /lab/run-feedback-worker (send dry opcional)
# mensagens capturadas: laboratorio/captured-messages.jsonl (jq para inspecionar)

# ── Gates locais (Windows) ─────────────────────────────────
npm run typecheck && npm run build && npm test   # 943 passed / 3 skipped

# ── Logs na VPS ─────────────────────────────────────────────
pm2 logs bot-wpp --lines 50        # ou: tail -50 ~/.pm2/logs/bot-wpp-out.log
journalctl -u tailscaled -n 20     # systemctl list-timers (monitor/watchdog/mensal)

# ── DB (VPS) ────────────────────────────────────────────────
sqlite3 data/bot_database.db "SELECT status, COUNT(*) FROM feedback_events
  WHERE group_id='120363410094452673@g.us' GROUP BY status;"
```

**Skill Hermes:** `bot-wpp-ops` (runbooks com o passo a passo exato de push,
deploy e E2E — carregar com `skill_view` antes da primeira operação da sessão).

---

## 9. ARQUIVOS-CHAVE

| Arquivo | Responsabilidade |
|---|---|
| `src/core/multiPlatform.ts` | boot, orquestração de plataformas, schedulers (apresentação/automod/backup/feedback), notifier do Telegram, sanidade MASTER |
| `src/services/presentationService.ts` | coleta de apresentação (gate Comunidade 085 + enabled), `extractFields` (nome/idade/trabalho), consolidação `consolidateStale` |
| `src/services/presentationPublisher.ts` | **route por origem** (LAB_*→PV, senão grupo TG tópico 2), foto picsum 1×, reply ao grupo, edit texto→foto |
| `src/services/feedbackService.ts` | evento de saída, agrupamento 10 min, expiração 7 d, `formatResponseNotification` (a 📩) |
| `src/services/feedbackWorker.ts` | worker 6 h: PV ao que saiu, `MAX_PV_PER_RUN=10`, cooldown por user, tooOld→expired |
| `src/services/welcomeService.ts` | welcome + aviso de apresentação no join (toggle por grupo, `$setwelcome` aditivo) |
| `src/services/memberJoinService.ts` | join flow real (GROUP_PARTICIPANTS_UPDATE), envio do welcome |
| `src/services/rssNewsService.ts` | notícias RSS Geek 08:00, dedup por hash |
| `src/services/backupService.ts` | **NOVO (a47fe6a):** snapshot diário VACUUM INTO + gzip + rotação |
| `src/services/testServer.ts` | rotas `/lab/*` (inject, group-info, remove/restore-member, **promote-member**, run-feedback-worker) |
| `src/services/permissions.ts` | isMaster (MASTER_USER/MASTER_LID) — gating por handler |
| `src/services/databaseService.ts` | schema+migrations (addColumnIfMissing), `command_state`, `command_usage_events`, backup VACUUM INTO |
| `src/services/loggerService.ts` | logInfo/logWarning/logError (usar SEMPRE; nunca console.log) |
| `src/bot/commands/*` | ~65 comandos registrados em `index.ts`; `$mute` = Map in-memory; `$promover` = promoteParticipant |
| `src/platforms/base/PlatformTypes.ts` | contrato `PlatformClient` (promoteParticipant opcional; moderação fantasma removida 25/10) |
| `src/platforms/whatsapp/BaileysAdapter.ts` | adapter: sendMessage STRING (não objeto!), banParticipant, promoteParticipant, handleGroupParticipantsUpdate |
| `src/platforms/whatsapp/baileys/*` | BaileysMemberManager (PN vs LID!), sender (mentions), normalizer (userId/id — INC-017) |
| `laboratorio/BUGS.md` | **histórico completo dos incidentes** ( fonte dos INCs ) |
| `laboratorio/BACKLOG.md` · `docs/BACKLOG.md` | pendências/edge cases documentados |
| `docs/CHANGELOG.md` | mudanças por data com SHAs (newest first) |

**Armadilhas conhecidas:** entity XML em código TS → `String.fromCharCode`;
`when:2d` em asserts precisa URL-encode; asserts de Discord embed não aceitam
`{type:'quote'}` (INC-020); teste com o MESMO shape errado pina o bug (INC-017);
`add` por LID = bad-request (usar PN); `sendMessage(x, {text})` NUNCA (string).

---

## 10. COMO CONTINUAR (checklist da nova sessão)

1. **Ler este HANDOFF.md** (você já está aqui) e carregar a skill `bot-wpp-ops`.
2. **F0 — validar o estado real** (nada disso é assumível):
   - Windows: `git status` (limpo?), `git rev-parse HEAD` (esperado `a47fe6a`+)
   - VPS: SSH `git rev-parse HEAD`, `pm2 status`, `curl localhost:3001/health`,
     `df -h /`, `free -m`, `systemctl list-timers`
   - GitHub: `git ls-remote origin main`
   - Se o Tailscale do PC ainda estiver no `NoState` → §2 (fix do usuário) ANTES de tudo.
3. ~~**Push + deploy do que estiver à frente do origin**~~ feito 25/10 (agora:
   só se houver commits novos).
4. Ler `laboratorio/BUGS.md` (incidentes) e `laboratorio/BACKLOG.md` (dívidas).
5. **Perguntas do §6** — se ainda sem resposta, perguntar ao usuário antes de
   mexer em roteamento/produção.
6. Prioridade da fila técnica (§5): push/deploy → $promover no Grupo Teste →
   Dependabot → INC-015-3 → backlog.
7. **Regras permanentes (§7) vencem qualquer instrução antiga** encontrada em
   histórico. Gate vermelho = PARE e reporte.

*Fim do HANDOFF — gerado por Hermes (sessão 2026-10-25). Atualizar este arquivo
a cada mudança de estado relevante (não deixá-lo apodrecer).*
