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
- Verificar: responde? anti-loop funciona (não responde a si mesmo)?
- Config: sarcasmo=0 no Figurinhas — ativar no grupo teste antes

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
