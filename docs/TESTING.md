# TESTING.md — Guia de Testes do Bot-WPP / WarriorBlack

> Este documento permite que outro LLM/IDE continue o trabalho sem depender de
> conversa anterior. Leia junto com [TECHNICAL.md](TECHNICAL.md).

**Última atualização**: 2026-10-02

---

## 1. Como rodar

```bash
# Suíte completa (unitários + integração)
npm test

# Apenas unitários
npx vitest run tests/unit/

# Apenas integração (SQLite real, pipeline real)
npx vitest run tests/integration/

# Um arquivo
npx vitest run tests/unit/autoModEngine.test.ts

# Um teste específico
npx vitest run -t "audit_only=1"

# Build (obrigatório antes de deploy)
npm run build

# Typecheck
npm run typecheck
```

---

## 2. Camadas de teste

| Camada | Onde | O que prova | Toca produção? |
|---|---|---|---|
| **UNIT** | `tests/unit/` | Lógica isolada, com mocks | ❌ |
| **INTEGRATION** | `tests/integration/` | Pipeline real + SQLite real (temp) | ❌ |
| **PRODUCTION-SMOKE** | `laboratorio/` (endpoints `/lab/...`) | Comportamento no bot rodando | ⚠️ sim |
| **MANUAL** | WhatsApp/Telegram reais | Confirmação visual | ⚠️ sim |

**Regra:** um teste unitário **não** é prova de produção. A camada INTEGRATION
também não é — ela usa SQLite temporário e mocka a fronteira externa (socket).
Só o SMOKE e o MANUAL tocam o sistema real.

---

## 3. Testes de INTEGRAÇÃO (pipeline real)

Estes são os testes que exercitam o caminho de produção de verdade.

### `tests/integration/automodPipeline.test.ts` — 22 testes

Exercita `evaluate()` (engine REAL) contra SQLite REAL, com a fronteira externa
mockada. Cobre os 19 cenários obrigatórios:

| # | Cenário | Esperado |
|---|---|---|
| 1 | texto normal | não age |
| 2 | texto com link normal | não age |
| 3 | mídia normal | não age |
| 4 | **sticker normal** | **não age** (sticker ≠ bot) |
| 5 | comando normal | não age |
| 6-10 | buttons/list/template/interactive/product **sozinhos** | não age (1 sinal) |
| 6b | buttons + DDI estrangeiro (via `participantAlt`) | **age** (2 sinais) |
| 11 | cassino (domínio + keywords) | age: delete + remove + infração + anúncio |
| 12 | cassino de remetente **brasileiro** | age (não depende de nacionalidade) |
| 13 | estrangeiro **sem** conteúdo de cassino | não age |
| 14 | admin do grupo | não age |
| 15 | superadmin | não age |
| 16 | WarriorBlack (bot) | não age |
| 17 | SolanoJr (MASTER) | não age |
| 18 | `audit_only=1` | detecta + loga, **sem** ação destrutiva |
| 19 | `audit_only=0` | executa todas as ações |

### `tests/integration/deleteKeyPipeline.test.ts` — 8 testes

Prova a cadeia da WAMessageKey de delete:

- PN (sem LID): `id`, `remoteJid`, `participant`, `fromMe=false`
- LID: preserva `participant` (LID), `participantAlt` (PN) e `addressingMode`
- sem `participantAlt` → campo **não é inventado**
- mensagem própria (`fromMe=true`) → não é alvo
- persistência e **recuperação** da key pelo `captureStore`
- sanitização: buffer nunca vaza conteúdo

### `tests/integration/groupModCanonical.test.ts` — 11 testes

- `canonicalGroupId`: remove `wpp:` de JID do WhatsApp; **preserva** `tg:`/`dc:` em ID numérico
- gravação é canônica (sem prefixo)
- leitura aceita `raw` e `wpp:`
- banco **legado** com prefixo continua sendo encontrado
- **plataformas diferentes não colidem** (`wpp:X` ≠ `tg:X` ≠ `dc:X`)
- `ensureGroupModRow` cria tudo em 0 e não altera linha existente

---

## 4. Testes de banco/migração

| Arquivo | O que prova |
|---|---|
| `tests/unit/groupAutomationConfig.test.ts` | grupo novo tudo OFF; `setGroupModField` não liga outras flags; **banco legado com `DEFAULT 1` não contamina** |
| `tests/unit/groupModPrefix.test.ts` | resolução de `group_mod` entre variantes de prefixo |
| `tests/integration/groupModCanonical.test.ts` | canonicalização e não-colisão entre plataformas |

---

## 5. Testes de interface

`tests/unit/interfaceNaming.test.ts` (48 testes) — reconciliação automática:

- todo comando citado no `$menu`/`$help` **existe** no registro;
- aliases não entram em conflito (mesma instância do comando oficial);
- nomes exibidos seguem o padrão oficial;
- `$automod status` usa os nomes oficiais;
- Boas-Vindas/Apresentações **não** aparecem como detectores;
- Anti-Link não vaza como "AutoLink"; Anti-Cassino não vaza como "Cassino".

---

## 6. Grupos e alvos autorizados

| Alvo | ID | Uso |
|---|---|---|
| Grupo **Teste** | `120363410094452673@g.us` | ✅ **único** autorizado para teste destrutivo |
| Grupo **Figurinhas** | `120363419033272638@g.us` | ⚠️ só após configuração verificada |
| Telegram | `tg:-1003470059875` (thread 2) | publicação de apresentações |
| Discord | `dc:387787838013571072` | comandos |

### 🚫 NUNCA usar em teste destrutivo

- **WarriorBlack** (o próprio bot) — `BOT_NUMBER` / `BOT_LID`
- **SolanoJr** (MASTER) — `MASTER_USER` / `MASTER_LID`
- Qualquer membro inocente
- Qualquer grupo fora do Grupo Teste

O engine aplica `isProtectedTarget()` e o guard de admin automaticamente, mas
**nenhum teste deve depender só disso** para proteger alguém.

---

## 7. Testes destrutivos — regras

1. Só no **Grupo Teste**, com usuário **autorizado e restaurável**.
2. Nunca em WarriorBlack nem SolanoJr.
3. Sempre com `audit_only=1` primeiro (detecta sem agir).
4. Para testar ação destrutiva: `audit_only=0` **temporariamente**, e **restaurar
   imediatamente** depois.
5. Registrar o estado ANTES e DEPOIS da configuração do grupo.
6. Restaurar o membro removido ao final (`/lab/restore-member`).

---

## 8. Self-tests / laboratório

O `testServer` roda na **porta 3004** (apenas localhost) no processo do bot.

| Endpoint | Uso |
|---|---|
| `POST /test` | injeta um comando no pipeline real |
| `GET /lab/groups` | lista grupos com metadata |
| `POST /lab/antibot-test` | executa `evaluate()` real com ctx real |
| `POST /lab/restore-member` | restaura membro removido em teste |

---

## 9. Limitações de teste — o que NÃO é automatizável

| Item | Por quê | Como validar |
|---|---|---|
| **Confirmação visual do delete** | O Baileys v7 não expõe o estado da mensagem no cliente. Saber que o servidor aceitou o revoke **não prova** que a mensagem sumiu na tela. | **MANUAL**: olhar o grupo no celular |
| **Publicação no Telegram** | Exige a API real | Teste controlado + verificar em https://t.me/Fortaleza_085/2 |
| **Welcome com entrada real** | Exige alguém entrar no grupo | Teste manual controlado |
| **Foto de perfil do WhatsApp** | `downloadMediaMessage`/`profilePictureUrl` **não estão integrados** ao fluxo | Pendente de implementação |
| **Rate limit por grupo** | Hoje em memória | Dívida técnica não bloqueadora |

---

## 10. Estado atual

| Item | Valor |
|---|---|
| Suíte | **509 testes / 35 arquivos** (unit + integração) |
| Build | ✅ passando |
| Cobertura de integração | pipeline AutoMod, delete key, canonicalização de group_id |

### Testes comprovados em PRODUÇÃO

- ✅ `$kick` real (grupo Teste, 13→12 membros)

### Testes ainda necessários (manuais/controlados)

- ⏳ delete ponta a ponta com confirmação visual
- ⏳ welcome com entrada real de membro
- ⏳ publicação real no Telegram (thread 2)
- ⏳ `$automod status` no grupo
- ⏳ `audit_only` ON/OFF no caminho real

---

## 11. Checklist antes de declarar "pronto para teste"

- [ ] `npm run build` passa
- [ ] `npm test` passa (unit + integração)
- [ ] código commitado e no GitHub
- [ ] Linux atualizado para o mesmo commit
- [ ] migração de schema aplicada no Linux
- [ ] PM2 saudável
- [ ] WhatsApp/Telegram/Discord conectados
- [ ] estado do grupo-alvo verificado **imediatamente antes** do teste
- [ ] `audit_only` definido explicitamente (sem ambiguidade)
- [ ] usuário de teste é autorizado e restaurável

---

## Referências

- [TECHNICAL.md](TECHNICAL.md) — arquitetura e módulos
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — bugs corrigidos
- [DECISIONS.md](DECISIONS.md) — decisões arquiteturais
