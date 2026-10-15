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

## Rodada planejada
Rodada 4 (Comandos + Automações) — após Rodadas 2 e 3.

---

## Features pedidas (2026-10-15)

Spec bruta do dono. Cada item vira rodada quando priorizado.

### Antibot — melhoria de detecção
- Hoje: `group_mod.antibot` existe, `autoModEngine` age. Verificar heurística.
- Toggle on/off por grupo (default off) — já existe.
- Sinais observados: card/button (não renderiza no web.whats);
  imagem/texto + link de cassino/aposta; número estrangeiro.
- Ação preferida: DELETAR MENSAGEM primeiro. Expulsar só com confirmação.
- IMPORTANTE (dono): não quer excluir estrangeiro que não é bot, nem
  novato. Quer ideia de SOMATÓRIA (score acumulando sinais) antes de decidir
  expulsar.
- Limitação conhecida: às vezes o texto/link da mensagem não é capturável.
- Aberto: qual score mínimo pra expulsar? Aviso ao invés de expulsão?

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
