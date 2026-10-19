# BACKLOG — Verificações de runtime pendentes

Itens que exigem teste no lab + grupo teste, não validação estática.
Consumidos principalmente na Rodada 4 (Comandos + Automações).

## Bem-vindo
- Trigger: alguém entra no grupo
- Verificar: mensagem de boas-vindas dispara? Personalizada por grupo?
- Evidência esperada: mensagem no grupo teste + registro em log

> Ver também: docs/ROADMAP.md § 🔄 EM ANDAMENTO — mesmo item de validação
> em produção; consolidar na Rodada 4.

## Antibot
- Trigger: bot entra no grupo (ou é adicionado)
- Verificar: mensagem apagada? bot removido? (config: antibot=1 em group_mod)
- Evidência esperada: mensagem some + participante removido + log

## Listas
- Verificar: criação, edição, remoção, persistência entre reinícios
- Tabela envolvida: lists (existe, 0 rows em prod)
- **ACHADO (Rodada 4a): o caminho de escrita está MORTO.** `saveList()`
  (listsService.ts:51) e `getList()` (listsService.ts:76) não têm nenhum
  chamador em `src/`. Só `listLists()` é usado (lista.ts:24) — ou seja,
  `$lista` só lê. Não existe comando que crie/edite/remova lista; é por isso
  que a tabela tem 0 rows.
- **Backlog item: implementar `$lista add/remove/del`** (write path).
  Escopo: comando + wiring de `saveList`/`getList` + persistência.

## Feedback de saída
- Trigger: alguém sai do grupo
- Verificar: notifica? mensagem? log?
- Tabela envolvida: feedback_events (11 rows em prod — sugere que funciona)

## Sarcasmo
- Trigger: mensagem contém "bot" | menciona o bot | marca o bot
- **RESOLVIDO em b3e46ce** — envio quebrava: `sock.sendMessage(jid, string)` lança no Baileys e o `.catch(() => {})` engolia. Fix: `{ text: SARCASMO_TEXT }` + `logWarning` no catch. Verificado em produção (13:15–13:19, MESSAGES_UPSERT com `fromMe=true` e texto "nada ver com isso sinhô").
- **Nota:** anti-loop funciona (SARCASMO_COOLDOWN_MS = 30_000 em sarcasmoService.ts:29; chave `(groupId|userId)`; testado em produção). Dois injets de teste de 4c tiveram 210s de intervalo — além do TTL; mérito de medição, não bug.

## Auditoria de catches silenciosos
- Trigger: manter consistência de erros visíveis
- **Rodada 4c-fix, Parte 0** — auditou `.catch(() => {})` silencioso em src/. 6 ocorrências em 3 arquivos:
  - BaileysAdapter.ts:306 (notifyOwner), :312 (syncSubmodulesWithNewSocket),
    :318 (selfTest), :319 — caminho quente de reconnect/autoMod
  - BaileysMessageNormalizer.ts:261 — sarcasmo (fixado em b3e46ce)
  - BaileysMemberManager.ts:36 (updateBlockStatus) — caminho quente de ban
- **Backlog item:** analisar syncSubmodulesWithNewSocket e updateBlockStatus
  (2 em caminhos quentes). Rodada 5.

## Mute
- Trigger: comando de mute com duração
- Verificar: muta o alvo? deleta mensagens dele durante o mute? expira sozinho?
- Evidência esperada: mensagens apagadas durante janela + log de expiração

## Arquitetura (Rodada 2 discovery)

- Vazamento SDK: `autoModEngine.ts:16` importa `WAMessage` de baileys. Fix real
  precisa derivar shape dos 6 call sites (`autoModEngine.ts:80,131,154,392,458,492`).
  Rodada 3.
- Interface errada: `promote`/`demote` precisam de `chatId`. Rodada 3 (junto com o
  refactor de PlatformTypes).
- Fantasmas: `mute?`/`unmute?`/`promote?`/`demote?` na interface sem implementação.
  Decisão: implementar ou remover. Rodada 3.
- Ciclo: `databaseService.ts:398` ↔ `listsService.ts:17` (`await import()` lazy,
  não quebra boot). Rodada 3.
- 8 arquivos mortos (lista na Rodada 2 discovery). Rodada 3.
- 13 sites `platform ===` para mover a capacity. Rodada 3.
- God classes `testServer.ts` (1526), `databaseService.ts` (969), `autoModEngine.ts`
  (955). Rodada 5+.
- 5 sites `member.isAdmin || member.isSuperAdmin` cru → usar
  `groupAdmin.findParticipant`. Rodada 3.
- `promote`/`demote` reais nos 3 adapters (precisa lab). Rodada 4.
- Persistir mute (hoje `Map` in-memory). Rodada 4.
- Reconciliação dos "37 sites" originais da Rodada 1 vs os ~12 refinados —
  item em aberto pra quando a Rodada 1 for revisitada. Não bloqueia.

## Banco + DDL + Integridade (Rodada 3a)

Resolvido em 3b: checkpoint do WAL (`f6423c8`), `backupDatabase` via VACUUM INTO
(`8234a96`), guard de DDL legado (`c905460`).

Pendente:
- Rebuild de `group_mod` com `DEFAULT 0` — prod ainda tem `DEFAULT 1` em
  `antispam/antiestrangeiro/autolink/remover`. Só depois do backup novo rodar
  por alguns dias. Janela com backup validado.
- TTL para `command_logs` e `ai_history` (este último guarda prompt+response inteiros).
- TTL/expurgo real para `feedback_events` — `expires_at` só filtra a query
  (`feedbackService.ts:184`), nunca deleta.
- `presentations` sem TTL.
- Trilha persistente para `$delete` (`deleteMsg.ts:75`) e `removeParticipant`
  (`BaileysMemberManager.ts:24`). Rodada 3c ou 4.
- Decidir `infractions`: implementar os 3 strikes (`MAX_INFRACTIONS`,
  `getInfractionCount`, `resetInfractions` — todos sem chamador) ou deletar o módulo.
- Limpar `data.preD2B/` e `ecosystem.config.js.preD2B` da VPS.
- Reconferir `discord-screen` no PM2 (hoje só `bot-wpp` online).
- Crontab da VPS: o `find` aponta pra `~/bot-wpp/backup`, que não existe — o real
  é `~/bot-wpp/data/backups`. Aplicar manualmente.

Correções de relatórios anteriores:
- `command_usage_events` **tem** retenção (180d, `databaseService.ts:392-399`).
  O relatório 3a listou como sem TTL — errado.
- `data.preD2B/` **existe na VPS** (`~/bot-wpp/data.preD2B/`). O "0 achados" da
  Rodada 2 valia só pro clone Windows.

## Rodada 4d — Mute e Antibot

### Mute — PARTIAL (cenário β)
- DRY-RUN vem de `src/platforms/whatsapp/baileys/BaileysMessageNormalizer.ts:222` (e `.ts:613`): o `raw.delete` do `handleMutedMessage` é um **stub que suprime o socket**, não flag de env.
- Resultado: o mute registra o alvo corretamente, mas a deleção foi suprimida por design (evitar send real em teste). Mute = PARTIAL.

### Antibot — PARTIAL
- Teste executado: `antibot=0 → 1`, `/lab/antibot-test`, aguardar 5s, restaurar.
- Resultado: `acted: false`, `moderationState: NONE`. Nenhum kick.
- O antibot não detectou o fake; o teste não confirmou kick.

Restore: antibot=0, audit_only=0 (confirmado).

## Tarefas estruturais pendentes

- Inventário de comandos: classificar cada comando registrado em
  VISÍVEL / OCULTO / DESABILITADO. Ver docs/RULES.md Regra 2.
- Revisão geral de docs: ler todos os .md em docs/, ver o que está
  desatualizado / faltando / desorganizado, atualizar e indexar.
- Investigar DRY-RUN do mute: BaileysMessageNormalizer.ts:222 e
  BaileysAdapter.ts:613. Hermes reportou "stub hardcoded", mas produção
  deleta mensagens — confirmar onde está o gate real (env? condição?
  caminho alternativo?). Ver docs/RULES.md Regra 4.
- Antibot: teste de detecção com payload realista (card/button, link de
  cassino). O teste de 4d rodou mas o fake não triggou heurística —
  resultado foi "nada detectado", não "antibot funciona".

- Comandos ocultos (2026-10-15): 11 comandos existem em estado OCULTO
  (alarme, lembrete, shutdown, noticias, apresentacao, autolink, casino,
  remover, detectar, delete, screen). Alguns podem ser úteis no futuro se
  melhorados. Estado atual mantido — nada muda agora. Revisitar depois de
  fechar as 3 automações prioritárias (apresentação, antibot, notícias).

- $aleatorio vs $aleatoria: dois comandos com nomes quase idênticos.
  aleatorio.ts (responde com %) não está no menu. aleatoria.ts (manda
  mensagem aleatória) está no menu em "jogo". Spec futura do dono vai
  decidir o que cada um deve ser. Nada muda agora.

### Status das Investigadas (Tarefa 2 — 45afa50)
- **aleatorio.ts** → MANTER: comando 'aleatorio' chama getAleatorio (serviço existente). Revertado.
- **index.ts** → MANTER: hub de comandos (`loadCommands`), referenciado por tests.
- **argParser.ts** → MANTER: splitArgs é utilitário sem equivalente no main.
- **validationService.ts** → MANTER: validação de números (getNumberId) importante.
## locationPoller.ts (deletado em 45afa50, mantido fora)
- O que é: poller de localização contínua via relay (GPS streaming)
- Por que foi deletado: zero referências no código, nenhum consumidor
- Deveria existir? Ambíguo. $ondeestou atual é under-demand (envia
  quando pedido). Se um dia quiser streaming contínuo, é a base.
- Decisão: MANTER FORA por ora. Reavaliar se/quando pedido.
- Como recuperar: git show 45afa50~1:src/services/locationPoller.ts

## Rodada planejada

---

## Features pedidas (2026-10-15)

Spec bruta do dono. Cada item vira rodada quando priorizado.

### Antibot — melhoria de detecção — ✅ RESOLVIDO em be3cb2a (INC-008, 19/10)
- Score somatório `somaPesos()`: estrutura-bot 5 · link-suspeito 4 ·
  spam-keyword 3 · repetição <60s 3 · nome-suspeito 2 · foreign 2.
- Thresholds: <6 nada · 6-7 delete+infraction · 8-9 delete+announce ·
  >=10 delete+evidência admin. Expulsão SÓ no combo
  (estrutura-bot + foreign + 1ª msg pós-join), com delete confirmado
  antes de banir (gate deleteOk). Detalhes: laboratorio/BUGS.md INC-008.
- Pendências menores (futuras): o caminho combo-delete-failed não foi
  exercitado ao vivo no smoke (delete sempre PASS no lab); limitação
  de texto não capturável segue existindo.

### Telemetria — só gravar, sem comando
- Hoje: `command_usage_events` existe (retenção 180d), quase nada
  instrumentado (5 rows em 5 dias).
- Instrumentar TODOS os comandos: quantas vezes, em quais grupos/privados,
  por quem. Só gravar no DB por enquanto.
- NÃO quer comando `$telemetria` agora. Coleta pra estudar depois.

### Feedback — dois modos
- Hoje: `feedback_events` grava saída; `$feedback <texto>` existe.
- A (comando): `$feedback <texto>` salva no DB + manda no Telegram do dono.
  Verificar se já existe.
- B (DM de follow-up — NOVO):
  - Toggle on/off por grupo (default off).
  - Quem sai do grupo/comunidade (ou é removido): bot manda DM educada.
  - Saudação por horário. Diz que observou a saída. Pergunta opinião/motivo,
    afirma ser anônimo. Resposta gravada com grupo/comunidade, número, nome.
    Manda no Telegram do dono.
  - JANELA: esperar 10 min antes de mandar (pode sair e voltar; pode sair
    de vários grupos da comunidade ao mesmo tempo; pode sair da comunidade
    toda). Não floodar.
  - DM fechada: dono disse que qualquer um pode mandar mensagem pra
    qualquer um. Verificar no WhatsApp atual. Se falhar, logar e seguir.

### Bem-vindo + Apresentação (split, com quote)
- Hoje: `memberJoinService` + `welcomeService` + `$setwelcome`. Sem split.
- `$bemvindo on/off` (default off): marca novatos; 1ª linha imutável
  "Sejam bem-vindos @..."; admin edita linhas abaixo.
- `$apresentacao on/off` (default off): template. Admin edita; reset default.
- DUAS MENSAGENS SEPARADAS:
  Msg 1 = bem-vindo (menciona novatos) · Msg 2 = apresentação.
- Msg 2 TEM QUE CONTER obrigatoriamente:
  - Aviso: "Para salvar sua apresentação no Telegram, RESPONDA ESTA
    MENSAGEM (quote)."
  - Link das regras (atual:
    https://docs.google.com/document/d/1QCSdfBa3bSjwJ4ski9EaLJI2OE-Pct-vq5Ykd_Uzc1s/edit )
  - Template default (foto sem view-once, nome, idade, orientação,
    estado civil, o que faz, bairro, nick/redes, favoritos).
- Template default editável pelo admin. Reset pro default disponível.
- Captura: só respostas QUOTANDO a Msg 2 (via quotedMessageId).
- Quando alguém se apresenta: salva no grupo Telegram Fortaleza 085,
  tópico "apresentação", dizendo de qual grupo veio.

### Listas — pendente de brainstorm (NÃO implementar)
- Hoje: `$lista` só LÊ. `saveList`/`getList` são código morto (Rodada 4a).
- Proposta anterior (2 tipos evento/check) foi considerada complicada demais
  pelo dono. Pessoas normais não entendem.
- Salvo pra repensar com calma. Sem spec.
- Único ponto confirmado: qualquer membro pode adicionar/remover o próprio
  nome numa lista de rolê. Criar/deletar/editar a lista inteira = só admins.

### Notícias — RESOLVIDO em e61ff75
- Comando `$noticias <tema> [N]` (on-demand via IA) + agendador
  `$noticias on [HH:MM] [tema]` / `off` / `status`. `on`/`off`/`status` só
  admin do grupo ou master; on-demand é livre.
- Schema `group_news` (9d4f088) — `last_sent_at` em hora LOCAL
  (`YYYY-MM-DDTHH:MM:SS`, sem `Z`). Nunca `toISOString()`: às 22:00 local o UTC
  já é o dia seguinte e o scheduler concluiria "já enviou hoje" cedo demais.
- Scheduler `newsScheduler.ts` — tick 60s, retry sem marcar `last_sent_at`
  quando o envio falha, kill switch `WPP_NEWS_ENABLED=false`.
- `resolveAdapterKey` mapeia o `group_id` prefixado (`wpp:`/`tg:`/`dc:`) para a
  chave EXATA do adapter: `PlatformManager.sendMessage` não tem fallback por
  prefixo, então `'whatsapp'` não acha um adapter `whatsapp:558581344211`.
  Os 3 adapters removem o próprio prefixo antes de enviar (`toJid`, `^tg:`, `^dc:`).
- Comando continua OCULTO no menu (decisão de visibilidade adiada — ver item
  "Comandos ocultos" acima).
- **Pós-resolução (2026-10-17):** modelos descontinuados nos 2 providers →
  fix b094b42 (NEWS_PROVIDERS: `qwen/qwen3.8-27b` + `gemini-3.8-flash`);
  detalhes em laboratorio/BUGS.md INC-001.
- **Prompt pede "notícias de HOJE" a LLM sem browsing** (newsService.ts:60)
  — o conteúdo vem do treino, não de fonte real; em tema estranho pode
  voltar disclaimer. Melhoria futura: prompt honesto ("acontecimentos
  recentes que você conhece") OU fonte real (RSS/NewsAPI). Rodada própria.
- **Dedup de títulos (o "sem repetir") — RESOLVIDO em 92ebb78 (INC-006):**
  tabela `news_history` + bloco "NUNCA repita" no prompt + `extractTitles`
  (sem fallback de fragmento); gravação dentro de `fetchNews` cobre comando
  manual e agendador. Smoke em prod: 2 chamadas consecutivas, 0 overlap,
  6 rows no histórico. Detalhes: laboratorio/BUGS.md INC-006.
- **Verificar `$clima` (verificação de runtime)** — mesmo grupo das
  pendências de verificação do render watchdog e do app de PC
  (laboratorio/BUGS.md): confirmar em produção o comando, a resposta e a
  fonte de dados antes de qualquer mudança nele.

**Lição aprendida (P3.2):** o mock de teste deve espelhar o shape REAL do
accessor (camelCase: `groupId`, `scheduleTime`), não o shape do banco
(snake_case: `group_id`, `schedule_time`). `listEnabledNewsGroups()` retorna
camelCase e o scheduler lê `row.scheduleTime` — com o mock em snake_case o
campo era `undefined`, `'07:59' < undefined` dava `false` e o grupo enviava em
vez de pular. O teste pegou; sem ele, o bug passaria despercebido em produção.

### INC-009 — Notícias no Geek + meta de grupos (2026-10-19)
- **Geek ATIVO (wpp:120363419241913965@g.us):** group_news enabled=1,
  schedule 08:00 diário, top 5, topic 'mundo geek', dedup da INC-006
  aplicado (news_history compartilhado entre grupos). Primeira execução
  real: 19/10 08:00 — validar "TOP 5" no log e +5 títulos no
  news_history (limitação "HOJE sem browsing" das INC-006/007 vale).
- **Figurinhas antibot confirmado ATIVO:** 120363419033272638@g.us,
  antibot=1, audit_only=0. Comportamento v0 (2 sinais → delete+ban)
  até o INC-008 (score somatório) ir a prod; monitorar kicks errados.
- **Meta de grupos persistida (deploy 99028c6):** community_groups +
  coluna description (migration); accessors upsertGroupMeta/
  getGroupMeta/listGroups/listKnownGroupJids; população 2 caminhos
  (/lab/groups on-demand + refreshGroupMetas no cleanup boot+6h).
- **Fix: idempotência no startPeriodicCleanup (ABERTO):** multiPlatform
  inicializa 2x em todo boot ("Limpeza periódica agendada" 2x;
  MemoryMonitor "Já está rodando" idem — todo boot histórico). Antes
  invisível (cleanup <2s); com refreshGroupMetas (~3s) o 2º runCleanup
  bate no guard isRunning → "[ERROR] Erro na limpeza inicial" (benigno,
  capturado, limpeza #1 conclui). Guard no startPeriodicCleanup ou
  eliminar a dupla inicialização. Rodada própria — detalhes em
  laboratorio/BUGS.md INC-009.
- **$noticias on após o schedule não seta last_sent_at → dispara
  imediato (ABERTO):** o handler `on` não bloqueia disparo no mesmo
  dia; a ativação do Geek fez UPSERT com last_sent_at=now para começar
  amanhã. Fix opcional: setar last_sent_at no handler. Rodada própria.
- **Monitorar tempo do runCleanup (ABERTO):** 9+ grupos × getChat no
  refresh de metas; se o ciclo passar de ~5min (comunidades maiores),
  mover refresh para job separado. Stat disponível: groupsRefreshed.
- **Esperam teste real de runtime (herdadas):** $clima, render watchdog,
  app de PC devtools (verificar antes de qualquer mudança).

### askAI/$pergunta — modelo deprecado (ABERTO)
- `askAI` (aiService.ts) usa o endpoint NATIVO do Gemini com
  `gemini-2.5-flash` — descontinuado para contas novas ("no longer
  available to new users") → provável 404 em produção no `$pergunta`.
- Rodada própria (não junto do kick fix). Ordem: probe direto (Regra 5)
  com `gemini-3.8-flash` no endpoint nativo → fix → gates → deploy.
- Detalhes: laboratorio/BUGS.md INC-002.

### Hermes config — candidatos não probados pelo rerank (ABERTO)
- thinkingmachines/inkling-small:free — 403 "only available on agentic
  harnesses": gate por app; o script (axios puro) não passa, mas o Hermes
  real pode passar. Testar via `hermes -z` se um dia interessar.
- Nous (longcat-2.5-preview, solar-mini4) — sem NOUS_PORTAL_API_KEY
  (OAuth, $0 de crédito): script não alcança. longcat segue na chain
  (pre-existente); solar-mini4 fora até ter key ou teste via hermes proxy.
- google/gemma-4-31b-it:free — 429×2 upstream (congestionado) no probe;
  re-probrar antes de reintroduzir na chain.
- NIM z-ai/glm-5.3-flash e google/gemma-4-31b-it — no catálogo, mas
  timeout 2×20s no probe; re-probrar fora de pico antes de considerar.
- aliases pesado/forte → nvidia/moonshotai/kimi-k3 — fora do catálogo NIM
  (morto). **RESOLVIDO 2026-10-17:** repontuados para
  openrouter/nvidia/nemotron-3-ultra-550b-a55b:free (rodada rápida, via
  hermes config set model.aliases).

### Kick/ban INC-004 — pós-fix (OPCIONAL)
- Smoke real do retry ("⏳ Tente novamente em alguns segundos"): exigiria
  degradar o socket artificialmente num grupo de teste — mock já cobre os
  2 ramos por comando; só se um dia valer o custo.
- Nomes dos testes "RECUSA quando o metadata é indisponível" (kick e ban)
  ficaram com comentário esclarecedor em vez de rename — rename é
  cosmético, sem urgência.
