# DIAGNÓSTICO DE CONSISTÊNCIA — AUDITORIA 2026-09-16

> Revisão crítica do relatório de auditoria produzido pelo Hermes.

**Data/hora**: 2026-09-16 13:05 BRT
**Commit**: 1f53abe

---

## A. INCONSISTÊNCIAS ENCONTRADAS

### INC-001: BUG-006 (Screen Share) — FALSO POSITIVO NO RELATÓRIO

**Relatório disse**: BUG-006 = "vídeo não aparece" (INVESTIGAÇÃO)
**Evidência real**: Logs mostram broadcaster conectando e stream iniciando com sucesso.
**Classificação correta**: E) FALSO POSITIVO — documentação desatualizada

**Justificativa**: Os logs confirmam:
- broadcaster conectado ✅
- stream iniciada ✅
- codec negociado ✅
- O usuário reportou que funciona no Web

O problema de viewer pode ser real (cenário Desktop), mas não está confirmado.
O BUG-006 deveria ser reclassificado como "PARCIALMENTE CORRIGIDO" ou "CENÁRIO NÃO VALIDADO".

---

### INC-002: Número de testes do casinoClassifier

**Relatório disse**: 12 testes
**Realidade**: 16 testes (todos passando)

O arquivo `tests/unit/casinoClassifier.test.ts` tem 16 testes, não 12.

---

### INC-003: isForeignNumber — Falso positivo para JID de grupo

**Arquivo**: `src/services/casinoClassifier.ts:77-80`

```typescript
export function isForeignNumber(jid: string): boolean {
  const n = (jid || '').replace(/\D/g, '');
  return n.length > 0 && !n.startsWith('55');
}
```

**Problema**: Trata JIDs de grupo (ex: `120363410094452673@g.us`) como números estrangeiros.

**Impacto**: Um grupo brasileiro com JID `120363410094452673@g.us` tem o sinal `foreign-number` adicionado, aumentando a confiança de cassino incorretamente.

**Classificação**: BUG ATUAL CONFIRMADO

---

### INC-004: Limiar de confiança (60%) e mínimo de sinais (3)

**Arquivo**: `src/services/autoModEngine.ts:496-498`

```typescript
const isHighProbabilityCasino =
  config.remover &&
  casinoDetection.detected &&
  casinoDetection.confidence >= 60 &&
  casinoDetection.signals.length >= 3;
```

**Problema**: O limiar de 3 sinais pode ser alto demais para capturar mensagens reais de cassino que têm apenas 2 sinais (ex: buttons-message + casino-domain).

**Classificação**: HIPÓTESE — precisa validação com mensagens reais

---

### INC-005: Proteção contra bot/owner/admin

**Arquivo**: `src/services/autoModEngine.ts:504-509`

```typescript
if (isProtectedTarget(senderJid)) {
  return { acted: false, reason: 'cassino: ID protegido', status: 'none' };
}
```

**Problema**: A proteção funciona, mas `senderJid` pode ser um JID de grupo (não de participante) se a mensagem não tiver `participant` definido. Nesse caso, `isProtectedTarget` não detecta corretamente.

**Classificação**: RISCO BAIO — precisa verificar se senderJid é sempre do participante

---

### INC-006: room.__telemetry — Contadores

**Arquivo**: `discord-screen/server/index.js`

```typescript
room.__telemetry = { broadcasters: 0, viewers: 0, reconnects: 0 };
room.__telemetry.viewers++;  // Incrementado no attach, mas nunca decrementado
```

**Problema**: O contador `viewers` é incrementado no attach mas nunca decrementado no detach. Isso significa que o número só cresce e não reflete o estado real.

**Correção aplicada**: Adicionado `activeViewers` com decremento no close.

---

### INC-007: Duplicação de ws.on('close') e ws.on('error')

**Problema**: O código original tinha:
```javascript
ws.on('close', () => R.detachViewer(room, ws));
ws.on('error', () => R.detachViewer(room, ws));
```

E o Hermes adicionou:
```javascript
ws.on('close', (code, reason) => { ... });
ws.on('error', (err) => { ... });
```

**Resultado**: Dois handlers para o mesmo evento. O primeiro `close` chama `detachViewer` e o segundo também. Isso causa `detachViewer` ser chamado duas vezes.

**Correção aplicada**: Removidos os handlers originais, mantendo apenas os novos com close code.

---

### INC-008: Template string bug

**Arquivo**: `discord-screen/server/index.js:1127`

```javascript
console.log(`[room ${room.id}] {auth.name} parou de assistir slot ${msg.slot}`);
```

**Problema**: Falta o `$` antes de `{auth.name}`. O log mostra `{auth.name}` literalmente em vez do nome do usuário.

**Status**: CORRIGIDO (patch aplicado)

---

### INC-009: Prioridade dos endpoints temporários

**Relatório disse**: "11 endpoints temporários, severidade MÉDIA, prioridade ALTA"
**Realidade**:
- 5 endpoints realmente temporários: `/lab/whatsapp/test-third-revoke`, `/lab/whatsapp/test-self-revoke`, `/lab/whatsapp/apagar-agoraessa`, `/lab/whatsapp/find-target`, `/lab/whatsapp/group-metadata`
- 6 endpoints permanentes e úteis: `/lab/groups`, `/lab/stats`, `/lab/find-message`, `/lab/messages`, `/lab/adapter`, `/lab/history`, `/lab/delete-message`

O relatório classificou todos como "temporários" incorretamente.

---

### INC-010: Sync Linux/GitHub

**Windows**: commit 1f53abe, working tree tem arquivos modificados não commitados
**GitHub**: commit 1f53abe (push realizado)
**Linux**: commit 1f53abe (pull realizado), tem stash `autostash`

**Problema**: O Linux tem um stash `autostash` que foi criado durante o pull. Isso indica que havia alterações locais no Linux que foram automaticamente stashadas.

**Risco**: Se o stash não for aplicado, alterações locais podem ter sido perdidas.

---

### INC-011: Typecheck "preexistente"

**Erros**:
1. `BaileysMessageNormalizer.ts:407` — `fromMe` não existe em `AutoModContext`
2. `BaileysAdapter.ts:426` — `fromMe` não existe em `AutoModContext`

**Investigação**: Nenhum desses arquivos foi alterado hoje. Os erros são realmente preexistentes.

**Mas**: O Hermes não verificou se esses erros já existiam antes da auditoria. A afirmação "preexistente" precisa de evidência (git log).

---

### INC-012: Documentação duplicada

**Arquivos de documentação**:
- `ARCHITECTURE.md` (raiz) — documento antigo
- `docs/ARCHITECTURE.md` — documento mais recente
- `docs/AI_CONTEXT.md` — criado hoje
- `docs/KNOWN_ISSUES.md` — criado hoje
- `docs/TROUBLESHOOTING.md` — criado hoje
- `docs/DECISIONS.md` — criado hoje
- `docs/ROADMAP.md` — criado hoje
- `docs/AUDIT_REPORT.md` — criado hoje
- `docs/TELEMETRY.md` — criado hoje

**Problema**: `ARCHITECTURE.md` na raiz e `docs/ARCHITECTURE.md` podem ter conteúdo duplicado ou contraditório.

---

### INC-013: BUG-006 no ROADMAP

**ROADMAP diz**: "Discord Screen Share: Em andamento"
**Realidade**: O usuário reportou que funciona no Web. Deveria ser "Validado parcialmente" ou "Funcional (Web), não validado (Desktop)".

---

## B. ESTADO REAL DO PROJETO

| Componente | Status | Evidência |
|------------|--------|-----------|
| WhatsApp | ✅ Funcionando | MESSAGES_UPDATE_EVENT nos logs |
| Telegram | ✅ Funcionando | conectado |
| Discord | ✅ Funcionando | conectado |
| Screen Share (Web) | ✅ Funcionando | broadcaster + stream confirmados |
| Screen Share (Desktop) | ⚠️ Não validado | Sem testes |
| AutoMod | ✅ Funcionando | isProtectedTarget integrado |
| Casino Classifier | ⚠️ Com bugs | isForeignNumber falso positivo |
| DNS | ✅ Corrigido | symlink ativo |
| Documentação | ⚠️ Inconsistente | BUG-006 falso positivo, contagens erradas |

---

## C. BUGS REALMENTE ATUAIS

| ID | Bug | Arquivo | Severidade |
|----|-----|---------|------------|
| BUG-001 | `fromMe` não existe em AutoModContext | BaileysMessageNormalizer.ts:407, BaileysAdapter.ts:426 | ALTA |
| BUG-002 | `isForeignNumber` trata JID de grupo como estrangeiro | casinoClassifier.ts:78 | MÉDIA |
| BUG-003 | Template string sem `$` | discord-screen/server/index.js:1127 | BAIXA (corrigido) |
| BUG-004 | Template string sem `$` | discord-screen/server/index.js:1127 | BAIXA |
| BUG-005 | Possible stash não aplicado no Linux | — | MÉDIA |

---

## D. BUGS JÁ RESOLVIDOS

| ID | Bug | Evidência |
|----|-----|-----------|
| BUG-001 (antigo) | DNS EAI_AGAIN | Symlink ativo, nslookup OK |
| BUG-002 (antigo) | Baileys v7 sem store | Migração completa |
| BUG-003 (antigo) | Loop AutoMod | Filtro fromMe ativo |
| BUG-004 (antigo) | WAMessageKey truncada | Key preservada |
| BUG-005 (antigo) | Admin sofrendo ação | isProtectedTarget ativo |

---

## E. TESTES AINDA NÃO REALIZADOS

| ID | Teste | Status |
|----|-------|--------|
| SS-001 | Discord Web broadcaster | ✅ VALIDADO |
| SS-002 | Discord Web viewer | ✅ VALIDADO |
| SS-003 | Discord Desktop broadcaster | ⚠️ PARCIAL |
| SS-004 | Discord Desktop viewer | ❌ NÃO TESTADO |
| SS-005 | Web → Desktop | ❌ NÃO TESTADO |
| SS-006 | Desktop → Web | ❌ NÃO TESTADO |
| SS-007 | Desktop → Desktop | ❌ NÃO TESTADO |
| SS-008 | 2+ espectadores | ❌ NÃO TESTADO |
| SS-009 | Viewer entrando depois | ❌ NÃO TESTADO |
| SS-010 | Reconexão broadcaster | ❌ NÃO TESTADO |
| SS-011 | Reconexão viewer | ❌ NÃO TESTADO |
| SS-012 | Transmissão 5 min | ❌ NÃO TESTADO |
| SS-013 | Transmissão 15 min | ❌ NÃO TESTADO |
| SS-014 | Queda de rede | ❌ NÃO TESTADO |
| SS-015 | Recuperação pós-queda | ❌ NÃO TESTADO |

---

## F. PROBLEMAS DE DOCUMENTAÇÃO

| Arquivo | Problema |
|---------|----------|
| KNOWN_ISSUES.md | BUG-006 é falso positivo |
| ROADMAP.md | Screen Share deveria ser "Parcialmente validado" |
| AUDIT_REPORT.md | 12 testes (real: 16) |
| AUDIT_REPORT.md | 11 endpoints temporários (real: 5) |
| AUDIT_REPORT.md | Prioridade incoerente |
| ARCHITECTURE.md (raiz) | Possível duplicação com docs/ARCHITECTURE.md |

---

## G. PROBLEMAS DE SINCRONIZAÇÃO

| Ambiente | Commit | Problema |
|----------|--------|----------|
| Windows | 1f53abe | Working tree sujo (arquivos modificados) |
| GitHub | 1f53abe | OK |
| Linux | 1f53abe | Stash `autostash` não verificado |

---

## H. ALTERAÇÕES QUE AINDA PRECISAM SER FEITAS

1. **Corrigir isForeignNumber** — excluir JIDs de grupo (`@g.us`)
2. **Verificar stash no Linux** — aplicar ou descartar
3. **Atualizar KNOWN_ISSUES.md** — remover BUG-006 ou reclassificar
4. **Atualizar ROADMAP.md** — mudar Screen Share para "Parcialmente validado"
5. **Atualizar AUDIT_REPORT.md** — corrigir contagens
6. **Remover 5 endpoints temporários** — `/lab/whatsapp/test-*`, `/lab/whatsapp/apagar-agoraessa`, `/lab/whatsapp/find-target`, `/lab/whatsapp/group-metadata`
7. **Commitar alterações não commitadas no Windows**
8. **Verificar typecheck** — confirmar que erros são preexistentes

---

## I. O QUE ESTÁ REALMENTE PRONTO

- ✅ WhatsApp (Baileys v7)
- ✅ Telegram (Telegraf)
- ✅ Discord (discord.js)
- ✅ Discord Screen Share (Web, com telemetria)
- ✅ AutoMod (com proteções)
- ✅ DNS (systemd-resolved)
- ✅ Casino Classifier (funcional, com bug de JID de grupo)
- ✅ Telemetria Screen Share (close code, watch, erros)
- ⚠️ Documentação (com correções necessárias)
- ⚠️ Sync (Windows com working tree sujo, Linux com stash)

---

**Diagnóstico concluído. Aguardando aprovação para correções.**

**Data/hora**: 2026-09-16 13:05 BRT
**Commit**: 1f53abe
**Próximo passo**: Corrigir bugs documentados, limpar endpoints temporários, atualizar documentação.
