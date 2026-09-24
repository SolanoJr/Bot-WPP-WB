# CHANGELOG.md — Linha do Tempo do Projeto Bot-WPP

> **Última atualização**: 2026-09-24 19:30 BRT
> **Commit**: 25de193
> **Data/hora em BRT**: 2026-09-24 19:30 BRT

---

## 2026-09-24 (Correção do Quote/Reply WhatsApp)

| Data/Hora | Evento | Arquivos Alterados | Commit |
|-----------|--------|-------------------|--------|
| 2026-09-24 19:30 | **BUG CORRIGIDO**: quote/reply não aparecia como citação no WhatsApp | `src/platforms/whatsapp/baileys/BaileysMessageSender.ts` | 25de193 |

**Problema**: Respostas do bot não apareciam como mensagem citada no WhatsApp — o balão de citação não era renderizado.

**Causa raiz**: O `BaileysMessageSender` passava `quoted` dentro do objeto `content` (2º argumento de `sendMessage`), mas o Baileys v7 espera:
```ts
sock.sendMessage(jid, content, options)
```
O campo `quoted` deve estar em `options` (3º argumento), não em `content` (2º argumento). Quando em `content`, o Baileys ignorava e enviava a mensagem como texto simples.

**Correção**:
```ts
// ANTES (bug):
const res = await this.sock.sendMessage(toJid(chatId), msgOpts);
// msgOpts = { text, quoted } — quoted perdido dentro do content

// DEPOIS (correto):
const { quoted, ...content } = msgOpts;
const res = await this.sock.sendMessage(toJid(chatId), content, quoted ? { quoted } : undefined);
```

**Validação**: TESTE 3 do laboratório — Direct PASS + PlatformManager PASS. `contextInfo.stanzaId` corresponde à mensagem original em ambos os caminhos.

**Impacto**: Todos os comandos que usam `ctx.reply()` (como `$ping`, `$menu`, etc.) agora geram citação nativa corretamente no WhatsApp.

---

## 2026-09-16 (Sessão de Auditoria)

| Data/Hora | Evento | Arquivos Alterados | Commit |
|-----------|--------|-------------------|--------|
| 2026-09-16 13:45 | Telemetria Screen Share - endpoint /lab/screen-stats | discord-screen/server/index.js | e2f1336 |
| 2026-09-16 13:40 | Typecheck limpo - adicionado `fromMe?: boolean` em AutoModContext | src/services/autoModEngine.ts | 55142f8 |
| 2026-09-16 13:30 | Fix: isForeignNumber exclui JIDs de grupo/LID | src/services/casinoClassifier.ts | 6cbfcd5 |
| 2026-09-16 13:20 | Documentação atualizada (ROADMAP, AUDIT_REPORT, PENDING_TESTS, KNOWN_ISSUES) | docs/*.md | ee622b5, 9d4da53 |
| 2026-09-16 13:10 | Telemetria Screen Share - close codes, watch, erros | discord-screen/server/index.js | 1f53abe |
| 2026-09-16 09:13 | CasinoClassifier + 16 testes + documentação AI_CONTEXT | src/services/casinoClassifier.ts, docs/*.md | 8c538d9 |

---

## 2026-09-15 (Sessão de Screen Share e DNS)

| Data/Hora | Evento | Arquivos Alterados | Commit |
|-----------|--------|-------------------|--------|
| 2026-09-15 17:01 | Fix DNS - symlink para systemd-resolved | /etc/resolv.conf | - |
| 2026-09-15 14:28 | Bug DNS EAI_AGAIN diagnosticado | - | - |
| 2026-09-15 22:07 | Teste de transmissão Screen Share confirmado | logs | - |
| 2026-09-15 20:33 | Broadcaster conecta e stream inicia com sucesso | logs | - |

---

## 2026-09-03 → 2026-09-14

| Data/Hora | Evento | Arquivos Alterados | Commit |
|-----------|--------|-------------------|--------|
| 2026-09-14 | Admin sofrendo ação do AutoMod corrigido | src/services/autoModEngine.ts | 2698ee1 |
| 2026-09-14 | WAMessageKey truncada corrigida | BaileysMessageSender.ts | - |
| 2026-09-14 | Loop infinito AutoMod corrigido | BaileysMessageNormalizer.ts | - |
| 2026-09-14 | Baileys v7 sem store - migração authState | src/platforms/whatsapp/ | - |
| 2026-09-03 | Discord Screen Share integrado (Activity) | discord-screen/ | 526a30a |
| 2026-09-03 | Arquitetura multi-plataforma consolidada | src/core/, src/platforms/ | - |
| 2026-09-09 | npm audit fix (9/10 vulnerabilidades) | package.json, package-lock.json | - |
| 2026-09-09 | Auditoria de workspace e realocação | docs/ARCHIVE/ | - |

---

## Histórico de Commits Recentes

```
e2f1336 feat(telemetry): adiciona endpoint /lab/screen-stats para diagnóstico
55142f8 fix(types): adiciona fromMe no tipo AutoModContext
9d4da53 docs: atualiza ROADMAP, AUDIT_REPORT, PENDING_TESTS com correções da auditoria
ee622b5 docs(known-issues): corrige BUG-006 para cenário não validado
6cbfcd5 fix(casino): exclui JIDs de grupo/LID do isForeignNumber
1f53abe feat(telemetry): adiciona logs de close code, watch/unwatch, erros WebSocket
8c538d9 feat(audit): AI_CONTEXT, KNOWN_ISSUES, TROUBLESHOOTING, DECISIONS, ROADMAP, AUDIT_REPORT
2698ee1 chore: merge origin/main (retain local delete-chain fix)
526a30a feat: integra discord-screen como Discord Activity
```

---

## Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| v1.3.3 | 2026-09-16 | Auditoria, telemetria, correções de typecheck, casino classifier |
| v1.3.2 | 2026-09-09 | Segurança (npm audit), realocação de workspace |
| v1.3.1 | 2026-09-03 | Screen Share consolidação, porta 3002, Express 5 |
| v1.3.0 | 2026-09-03 | Discord Screen Share integrado (Activity) |
| v1.2.1 | 2026-09-02 | Blindagem AutoMod contra BOT/DONO/ADMINS |
| v1.2.0 | 2026-08-14 | Sarcasmo, $automod, $ondeestou, $kick/$ban com nome |

---

**Última atualização**: 2026-09-16 13:45 BRT
**Commit**: e2f1336
