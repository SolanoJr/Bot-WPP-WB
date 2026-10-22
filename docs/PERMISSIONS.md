# Modelo de Permissões — Bot-WPP-WB

> Fonte: F0 (mapeamento read-only) + F1 (E2E por nível no LAB), 20/10/2026.
> Escopo: como o bot decide quem pode fazer o quê. Documento de referência
> para futuras manutenções — os números e caminhos abaixo são os reais.

## 1. Os papéis reais

Existem **2 papéis com efeito** + o bot como alvo protegido. O nível `ADMIN`
do `permissions.ts` (alimentado pelo `ADMINS` do .env) **foi removido**
(22/10, INC-015 Dívida 3) — ver §7 Dívidas técnicas.

| Papel | Como é reconhecido | Onde é configurado |
|---|---|---|
| **MASTER** (dono do bot) | `isMaster()` em `src/services/permissions.ts` — 4 vias, qualquer uma basta: (1) `cleanId(userId) === MASTER_USER`; (2) `=== MASTER_NUMBER`; (3) `∈ OWNER_NUMBER_ALIASES` (hardcoded); (4) LID do usuário `=== MASTER_LID` | `.env` (`MASTER_USER`, `MASTER_NUMBER`, `MASTER_LID`) + hardcoded em `permissions.ts` (`OWNER_NUMBER_ALIASES`) |
| **ADMIN de grupo** | `isSenderGroupAdmin(chat, userId)` em `src/services/groupAdmin.ts` — lê `chat.participants` (metadata do grupo), casa por `id` **ou** `phoneNumber` (LID↔PN), exige `admin`/`superadmin` | No WhatsApp (o grupo diz quem é admin). Nada no .env. |
| **USER** | Qualquer outro remetente | — |
| **BOT** (alvo protegido) | `isBotTarget()` — `BOT_NUMBER_ALIASES` ∨ LID `=== BOT_LID` | `.env` vazio → fallbacks hardcoded em `permissions.ts` (`558581344211`, LID `2592935567439`) |

### `isProtectedTarget` — blindagem anti-self-sabotagem

```ts
isProtectedTarget(userId) = isMaster(userId) || isBotTarget(userId)
```

O master entra **automaticamente** (pelas 4 vias do `isMaster`). Quem respeita:
adapters (`BaileysMemberManager` ban/kick, Telegram, Discord), `autoModEngine`
(5 pontos), `memberJoinService` (antibot do INC-010), `deleteMsg`, `mute`,
`databaseService` (ban no DB). Nenhuma rota de moderação derruba dono/bot.

## 2. Fluxo real de autorização

```
Mensagem → PlatformManager (dispatcher)
  ├─ checkPermissions() → SEMPRE true (stub — dívida #1)
  ├─ rate limit global: 20 comandos/min por usuário
  └─ createCommandContext() monta o ctx:
       ctx.isMaster = isMaster(userId)            ← permissions.ts (4 vias)
       ctx.isAdmin  = isSenderGroupAdmin(chat, userId) ← groupAdmin.ts (metadata)
  → command.execute(ctx) → CADA handler faz o próprio gate
```

Não existe middleware central ativo: **todo o gating real é por handler**, e há
três padrões:

- `if (!isMaster(ctx.userId))` → master-only (`$banidos`, `$grupos`, `$send`, `$shutdown`, `$addcmd`)
- `if (!(ctx.isMaster || ctx.isAdmin))` → master OU admin de grupo (`$delete`, `$feedback`, `$lista`, `$noticias on/off/status`, `$sarcasmo`, `$cmd`, `$antibot`/mod toggles)
- `ban`/`kick`/`setwelcome`/`apresentacao`: gate próprio com `findParticipant` (admin/superadmin do metadata) ∥ `isMaster`, **e** pré-requisito de que o próprio bot seja admin do grupo (`isBotGroupAdmin`) — fail-closed se o metadata não verificar (`isPermissionsVerified === false` → "⏳ tente novamente", INC-004)

O `ban.ts` também nega se o alvo for admin do grupo, e a proteção de master/bot
acontece em `BaileysMemberManager`/adapters via `isProtectedTarget`.

## 3. Matriz de comandos por nível

| Nível | Comandos |
|---|---|
| **MASTER-only** | `$banidos`, `$grupos`, `$send` (sendMessage), `$shutdown`, `$addcmd` |
| **MASTER ou admin de grupo** | `$ban`, `$kick` (ambos exigem bot admin + sender admin/master + alvo não-admin + alvo não-protegido), `$setwelcome`, `$apresentacao`, `$delete`, `$feedback`, `$lista`, `$noticias on/off/status`, `$sarcasmo`, `$cmd`, `$antibot`, `$antiestrangeiro`, `$autolink`, `$automod` e demais toggles do modToggle |
| **Públicos** (só rate limit 20/min) | `$help`, `$info`, `$alive`, `$clima`, `$jogos`, `$conselhos`, `$cantada`, `$piada`, `$gtts`, `$lembrete`, `$menu`, `$interacao`, `$admin` (painel informativo, sem dado sensível) |

## 4. Números confirmados (20/10)

- **Dono/Master**: `558898314322` (PN) · LID `202658048684056@lid` — `.env` `MASTER_USER/MASTER_NUMBER/ADMINS = 558898314322@c.us`, `MASTER_LID = 202658048684056@lid`
- **Bot**: `558581344211` (PN) · LID `2592935567439@lid` — fallbacks hardcoded (não há `BOT_NUMBER`/`BOT_LID` no `.env`)
- `isMaster` **auto-nega o próprio bot**: se o número do bot colidir com MASTER, loga warning e não concede (detector `validateMasterConfig` no boot, warning-only).

## 5. E2E por nível — resultado no LAB (F1, 20/10)

LAB: `120363410094452673@g.us` ("Teste", 9 membros). Injeção via
`POST /lab/inject-message {groupId, senderId, text, mentions?}`.

| # | Sender | Comando | Esperado | Resultado |
|---|---|---|---|---|
| 1 | `558898314322@c.us` (master PN) | `$banidos` | sucesso | ✅ "LISTA DE BANIDOS" (via alias) |
| 2 | `202658048684056@lid` (master LID) | `$banidos` | sucesso | ✅ idem (via MASTER_LID) |
| 3* | `72576558715022@lid` (user) | `$setwelcome` | negado | ✅ `[ADMIN-CHECK] NÃO` + `[AUTH-FAIL]` + "❌ Apenas administradores…" |
| 4 | user | `$banidos` | negado | ✅ "❌ Apenas o MASTER pode consultar…" |
| 5 | `60382962012254@lid` (user) | `$setwelcome` | negado | ✅ idem 3 |
| 6 | user | `$help` | sucesso | ✅ "🤖 Comandos disponíveis" |
| 7 | bot (`558581344211@c.us`) | `$ban @bot` | negado | ⚠️ negado, mas por fail-closed (ver nota) |
| 8 | master PN | `$ban @dono` | negado (protegido) | ⚠️ idem — não exercitável |
| 9 | user | `$ban @membro` | negado | ⚠️ idem |
| 10 | bot | `$banidos` | negado (auto-nega) | ✅ "❌ Apenas o MASTER…" |

*Nota T3 (adaptado)*: o **LAB não tem nenhum admin** (todos os 9 participants
com `admin: null`) — o teste positivo do nível "admin de grupo" é impossível
no estado atual. T7/T8/T9 não exercitam os gates porque o **primeiro** gate do
`$ban`/`$kick` é `isBotGroupAdmin` (o bot precisa ser admin do grupo) e o
`groupMetadata` fresh do LAB deu timeout (`isPermissionsVerified:false`) →
resposta fail-closed "⏳ Não consegui carregar a lista de membros". Nada foi
executado: nenhum ban, nenhuma saída, `group_mod.welcome_message` do LAB
seguiu NULL. **Para exercitar o nível admin e o `isProtectedTarget` em E2E** é
pré-requisito manual do dono: promover o bot a admin do LAB (e um membro a
admin, para o teste positivo).

## 6. Como testar no LAB

```bash
curl -X POST http://127.0.0.1:3004/lab/inject-message \
  -H 'Content-Type: application/json' \
  -d '{"groupId":"120363410094452673@g.us","senderId":"<JID>","text":"$banidos"}'
```

SenderIds úteis: master PN `558898314322@c.us` · master LID
`202658048684056@lid` · user comum `72576558715022@lid` · bot
`558581344211@c.us`. Verificar no log: `[ADMIN-CHECK]`, `[AUTH-FAIL]`,
`[reply]` e `[PlatformManager] Executando`.

## 7. Dívidas técnicas conhecidas (ABERTAS no backlog)

1. **`checkPermissions` stub** (`PlatformManager.ts` ~:472): retorna `true`
   sempre; o gating real é por handler. O `requirePermission` do
   `permissions.ts` que o comentário aponta **não é usado por nenhum comando**.
2. **`$cmd <comando> on|off`** (RESOLVIDO, INC-015 D2, 22/10): era in-memory
   sem leitor e gravava "$ping" enquanto o dispatcher consultava "ping".
   Agora: tabela `command_state` em SQLite (persiste no restart), gate no
   dispatcher antes do execute (reply "⚠️ O comando \`X\` está desativado
   neste grupo. (\`$cmd X on\` reativa)"), `$cmd` imune ao próprio gate
   (lock-out), default habilitado, fail-open. E2E com restart comprovou a
   persistência.
3. **`ADMINS` do .env inócuo**: ~~aberto~~ **RESOLVIDO em 22/10 (INC-015
   Dívida 3)**: `ADMINS`, `PERMISSIONS.ADMIN`, `isAdmin()` e o case ADMIN do
   `requirePermission` foram removidos do `permissions.ts`. Hierarquia agora
   é MASTER > USER. O "admin" real continua sendo só o metadata do grupo
   (`groupAdmin.ts`). E2E `f1-perms.sh` re-executado: nenhum nível mudou de
   comportamento (ADMIN nunca teve efeito).

Decisão (20/10): adiar; decisão final (22/10): corrigir com a rede de
segurança deste documento (`f1-perms.sh`).
