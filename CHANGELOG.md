# CHANGELOG.md — Linha do Tempo do Projeto Bot-WPP

> **Última atualização**: 2026-10-02
> **Suíte**: 509 testes / 35 arquivos (unit + integração)

---

## 2026-10-02 (Modo execução: pipeline real, delete, canonicalização)

| Evento | Arquivos |
|--------|----------|
| **Harness de integração do pipeline real** (22 testes) | `tests/integration/automodPipeline.test.ts` |
| **Delete ponta a ponta** com WAMessageKey completa (8 testes) | `tests/integration/deleteKeyPipeline.test.ts` |
| **Canonicalização de group_id** (11 testes) | `tests/integration/groupModCanonical.test.ts` |
| **BUG CORRIGIDO**: vazamento de config entre plataformas (`wpp:X` = `tg:X`) | `databaseService.ts` |
| **BUG CORRIGIDO**: `welcomeService` herdava defaults ligados no INSERT | `welcomeService.ts` |
| **BUG CORRIGIDO**: engine sem guard de `fromMe` (auto-punição) | `autoModEngine.ts` |
| **BUG CORRIGIDO**: capture-store em `laboratorio/` (produção dependia de lab) | `captureStore.ts` (novo) |
| `canonicalGroupId()` + `ensureGroupModRow()` | `databaseService.ts` |
| Guia de testes | `docs/TESTING.md` (novo) |

**Descoberta por teste:** o fallback de resolução de `group_mod` fazia um grupo
de **Telegram** ler a configuração de um grupo de **WhatsApp** com o mesmo
número. O fallback agora só se aplica a JIDs do WhatsApp (contêm `@`).

**Pipeline real:** os testes de integração exercitam `evaluate()` (engine real)
contra **SQLite real**, com a fronteira externa mockada — cobrindo 19 cenários
(texto, mídia, sticker, botões, cassino, admin/MASTER/bot/dono, audit_only
ON/OFF).

**Limitação declarada:** a confirmação **visual** do delete não é automatizável
(o Baileys v7 não expõe o estado da mensagem no cliente). O que é provado é que
a key enviada é a correta e recuperável. A confirmação visual permanece MANUAL.

---

## 2026-10-02 (Padronização da interface + nomenclatura oficial)

| Evento | Arquivos |
|--------|----------|
| **BUG CORRIGIDO**: `$bemvindo` importado mas nunca registrado (CRÍTICO) | `commands/index.ts` |
| **BUG CORRIGIDO**: `$menu` exibia 13 comandos inexistentes (`$lista1..3`) | `menu.ts` |
| Nomenclatura oficial: `$antilink`, `$anticassino`, `$punicao`, `$anuncio` | `modToggle.ts`, `index.ts` |
| Aliases legados preservados: `$autolink`, `$casino`, `$remover`, `$detectar` | `modToggle.ts` |
| Status do AutoMod: `DETECTORES` → `AÇÕES / MODO` → `AUTOMAÇÕES` | `modToggle.ts` |
| `$help` completo (documentava só 7 comandos) | `help.ts` |
| `$menu` reorganizado por categoria, com marcação `_(admin)_` | `menu.ts` |
| 48 testes de consistência da interface | `tests/unit/interfaceNaming.test.ts` |
| Tabela oficial de nomenclatura | `docs/TECHNICAL.md §8`, README, AI_CONTEXT |

**Problema:** o `$bemvindo on/off` **não existia** — era importado mas nunca
adicionado ao registro, então o serviço de boas-vindas não tinha como ser
ligado pelo chat. O `$menu` anunciava 13 comandos mortos (`$lista1`…`$lista3del`).
E a interface misturava nomes (`$autolink`/`$casino`) com rótulos imprecisos.

**Causa raiz:** o registro de comandos era um objeto literal sem verificação; o
menu/help eram texto estático sem checagem contra o registro real.

**Correção:** registrar `$bemvindo`; remover comandos mortos; adotar
nomenclatura oficial (PT-BR, prefixo "Anti-") mantendo aliases legados; status
estruturado; testes que comparam automaticamente menu/help com o registro real.

**Decisão:** **nenhuma migração de banco por estética** — os campos históricos
(`autolink`, `casino`, `remover`, `detectar`) permanecem; só a interface mudou.

---

## 2026-10-02 (Automações configuráveis por grupo + Welcome + Apresentações)

### Configuração centralizada de automações por grupo

| Evento | Arquivos | Commit |
|--------|----------|--------|
| **BUG CORRIGIDO**: grupo novo herdava automações ligadas | `databaseService.ts` | — |
| **BUG CORRIGIDO**: `setGroupModField` ligava outras flags indiretamente | `databaseService.ts` | — |
| **BUG CORRIGIDO**: Casino/AntiBot sem flags próprias | `databaseService.ts`, `autoModEngine.ts`, `modToggle.ts` | — |
| **BUG CORRIGIDO**: `$automod` status quebrado e incompleto | `modToggle.ts`, `databaseService.ts` | — |
| `$automod status` mostra moderação + serviços + modo | `modToggle.ts` | — |
| Comandos novos: `$antibot`, `$casino`, `$auditonly` | `modToggle.ts`, `commands/index.ts` | — |
| `$automod on/off` não mexe mais em welcome/apresentações | `modToggle.ts` | — |
| 15 testes novos (SQLite real + cenário de banco legado) | `tests/unit/groupAutomationConfig.test.ts` | — |

**Problema:** um grupo novo — ou a primeira vez que uma flag era ligada — passava
a ter AntiSpam, AntiLink, AntiEstrangeiro e Remover **ligados** sem ninguém
pedir. `$bemvindo on` ligava quatro módulos de moderação.

**Causa raiz:** `ensureGroupMod()` usava defaults `true`, e o schema tinha
`DEFAULT 1`. `setGroupModField()` fazia `INSERT` de apenas uma coluna — as demais
herdavam o `DEFAULT` da tabela. Agravante: `CREATE TABLE IF NOT EXISTS` **não
altera** tabela existente, então bancos antigos mantêm `DEFAULT 1` no DDL.

**Correção:** `GROUP_MOD_DEFAULTS` com tudo `false`; escrita **explícita** de `0`
em todas as colunas ao criar a linha (sem depender do `DEFAULT`).

### Welcome configurável por grupo

| Evento | Arquivos |
|--------|----------|
| Listener real de `group-participants.update` | `BaileysConnection.ts`, `BaileysAdapter.ts` |
| `welcomeService.ts` (get/set/resolve + placeholders) | novo |
| `memberJoinService` envia welcome | `memberJoinService.ts` |
| `$setwelcome` persistido no SQLite (era Relay InMemory) | `setwelcome.ts` |
| Migração `group_mod.welcome_message` | `databaseService.ts` |
| 11 testes | `tests/unit/welcome.test.ts` |

**Problema:** o evento de entrada de membro **não era escutado** — o
`memberJoinService` era código morto. E `$setwelcome` gravava no
`InMemoryRepository` do Relay, que reinicia e perde tudo; o bot nunca lia o valor.

**Correção:** listener de `group-participants.update` encadeado até
`memberJoinService`; welcome persistido em `group_mod.welcome_message`, com
padrão `Bem-vindo @novato 👋`.

### Sistema de apresentações + espelho no Telegram

| Evento | Arquivos |
|--------|----------|
| `presentationService.ts` (sessões, coleta, extração, persistência) | novo |
| `presentationPublisher.ts` (publicação/edição no Telegram) | novo |
| `$apresentar` e `$apresentacao on/off/status` | novos |
| Migração `group_mod.presentation_enabled` + tabelas `presentations`/`community_groups` | `databaseService.ts` |
| `message_thread_id` no Telegram | `PlatformTypes.ts`, `TelegramAdapter.ts` |
| Timer de consolidação (2 min / janela de 10 min) | `multiPlatform.ts` |
| 12 testes | `tests/unit/presentationEnabled.test.ts` |

**Decisão:** SQLite é a fonte oficial; o Telegram (Fortaleza 085, tópico
Apresentações, thread 2) é espelho. Identificação da Comunidade 085 pelo
`linkedParent` real do metadata — não por lista de nomes.

---

## 2026-09-30 (Auditoria final do AntiBot / AutoMod)

| Evento | Arquivos | Commit |
|--------|----------|--------|
| Guard de admin antes do audit_only + harness sem footer de cassino | `autoModEngine.ts`, `testServer.ts` | ce97635 |
| Combinação forte de cassino + guard de admin no AntiBot | `autoModEngine.ts` | 1ebaf79 |
| 25 testes de auditoria do Figurinhas | `tests/unit/automodFigurinhas.test.ts` | 605b901 |
| restore-member desbloqueia antes de readicionar | `testServer.ts` | 599bef3 |
| **BUG CORRIGIDO**: LID não carrega DDI — antiestrangeiro baniria o grupo inteiro | `autoModEngine.ts` | 6e75540 |
| Rota `/lab/antibot-test` (evaluate real com ctx real) | `testServer.ts` | 8de7ef1 |
| **BUG CORRIGIDO**: mentions vazio no harness (kick/ban nunca executavam) | `testServer.ts` | e694fc8 |

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
