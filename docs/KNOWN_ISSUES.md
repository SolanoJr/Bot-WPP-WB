# KNOWN_ISSUES.md — Bugs Conhecidos e Resolvidos

> Este documento registra bugs encontrados, suas causas e soluções para evitar regressões.

**Última atualização**: 2026-09-16 13:30 BRT
**Commit**: 6cbfcd5

---

## BUG-001: DNS EAI_AGAIN — Servidor não resolve discord.com

**Status**: ✅ RESOLVIDO
**Data**: 2026-09-15
**Severidade**: CRÍTICA

### Sintoma
```
[oauth] erro: TypeError: fetch failed
  [cause]: Error: getaddrinfo EAI_AGAIN discord.com
```

### Causa Raiz
O servidor Linux usava DNS do Tailscale (`100.100.100.100`) que retornava `SERVFAIL` para `discord.com`. O arquivo `/etc/resolv.conf` era estático e apontava apenas para DNS Tailscale.

### Solução
```bash
# Backup
cp /etc/resolv.conf /tmp/resolv.conf.static.bak

# Criar symlink para o stub do systemd-resolved
ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf

# Validar
resolvectl status
nslookup discord.com
```

### Como Evitar
- NUNCA editar `/etc/resolv.conf` manualmente
- O systemd-resolved gerencia o DNS corretamente com fallback para DNSs públicos
- Se `EAI_AGAIN` aparecer, verificar `resolvectl status` e `nslookup discord.com`

### Arquivos Envolvidos
- `/etc/resolv.conf` (symlink para `/run/systemd/resolve/stub-resolv.conf`)
- `/etc/systemd/resolved.conf` (DNS=8.8.8.8, FallbackDNS=1.1.1.1)

---

## BUG-002: Baileys v7 — sock.store is not a function

**Status**: ✅ RESOLVIDO
**Data**: 2026-09-14
**Severidade**: ALTA

### Sintoma
```
TypeError: sock.store is not a function
```

### Causa Raiz
O Baileys v7 RC14 removeu `sock.store`. O código antigo tentava acessar `sock.store.messages()`.

### Solução
Usar `authState.creds` e `authState.keys` em vez de `sock.store`. Para mensagens, usar eventos `ev.on('messages.upsert')`.

### Como Evitar
- NUNCA usar `sock.store` — não existe no Baileys v7
- Consultar documentação do Baileys v7 para API correta

### Arquivos Envolvidos
- `src/platforms/whatsapp/BaileysAdapter.ts`
- `src/platforms/whatsapp/baileys/`

---

## BUG-003: Loop Infinito no AutoMod

**Status**: ✅ RESOLVIDO
**Data**: 2026-09-14
**Severidade**: CRÍTICA

### Sintoma
AutoMod entrava em loop infinito, processando a mesma mensagem repetidamente.

### Causa Raiz
O normalizer não filtrava mensagens do próprio bot (`fromMe === true`). Quando o bot enviava um anúncio de moderação, o anúncio era reprocessado pelo AutoMod.

### Solução
```typescript
// No normalizer (BaileysMessageNormalizer.ts):
if (fromMe) {
  return; // Pula mensagens do próprio bot
}

// No autoModEngine.ts:
if (senderId === botId || ctx.fromMe === true) {
  return { acted: false, reason: 'mensagem do próprio bot' };
}
```

### Como Evitar
- SEMPRE verificar `fromMe` antes de processar mensagens
- SEMPRE verificar `senderId === botId` no AutoMod

### Arquivos Envolvidos
- `src/platforms/whatsapp/baileys/BaileysMessageNormalizer.ts`
- `src/services/autoModEngine.ts`

---

## BUG-004: WAMessageKey Truncada no Delete

**Status**: ✅ RESOLVIDO
**Data**: 2026-09-14
**Severidade**: ALTA

### Sintoma
Mensagens de terceiro não eram removidas visualmente do grupo, apesar do servidor aceitar o revoke.

### Causa Raiz
A WAMessageKey era truncada antes de chegar ao `sock.sendMessage()`. Campos como `participantAlt` e `addressingMode` eram perdidos.

### Solução
Preservar a key completa desde a captura até o envio:
```typescript
// BaileysMessageSender.ts — preservar key completa
const deleteKey = {
  id: key.id,
  remoteJid: key.remoteJid,
  fromMe: key.fromMe,
  participant: key.participant,
  participantAlt: key.participantAlt,
  addressingMode: key.addressingMode,
};
```

### Como Evitar
- NUNCA reconstruir WAMessageKey manualmente
- Sempre usar a key original capturada pelo Baileys

### Arquivos Envolvidos
- `src/platforms/whatsapp/baileys/BaileysMessageSender.ts`
- `src/services/testServer.ts`

---

## BUG-005: Admin Sofrendo Ação do AutoMod

**Status**: ✅ RESOLVIDO
**Data**: 2026-09-14
**Severidade**: CRÍTICA

### Sintoma
Administradores legítimos do grupo eram banidos ou tinham mensagens removidas.

### Causa Raiz
O AutoMod não verificava se o remetente era admin antes de executar ações.

### Solução
```typescript
// autoModEngine.ts — verificar admin antes de agir
const chat = await ctx.getChat(groupId);
const participant = chat?.participants?.find(p => p.id === senderJid);
if (participant?.admin === 'admin' || participant?.admin === 'superadmin') {
  return { acted: false, reason: 'remetente é admin' };
}
```

### Como Evitar
- SEMPRE verificar `isProtectedTarget()` e status de admin antes de ações destrutivas

### Arquivos Envolvidos
- `src/services/autoModEngine.ts`
- `src/services/permissions.ts`

---

## BUG-006: Discord Screen Share — Vídeo não aparece (Desktop)

**Status**: ⚠️ CENÁRIO NÃO VALIDADO
**Data**: 2026-09-15
**Data de reclassificação**: 2026-09-16
**Severidade**: BAIXA

### Sintoma
Usuário reportou que a transmissão funciona no Discord Web mas não no Discord Desktop.

### Histórico
- 2026-09-15: Inicialmente reportado como BUG-006 (Screen Share)
- 2026-09-16: Reclassificado — Web funciona, Desktop não validado
- Transmissão confirmada via logs: broadcaster conecta, stream inicia, codec negociado

### Hipóteses
1. Desktop usa visualização nativa (não canvas)
2. Desktop bloqueia WebCodecs no iframe
3. Desktop tem CSP diferente
4. Desktop não envia `watch(slot)` corretamente

### Status da Investigação
- [x] Broadcaster conecta ✅
- [x] Servidor recebe frames ✅
- [x] Viewer conecta ✅
- [ ] Desktop renderiza vídeo — NÃO VALIDADO

### Próximos Passos
- Verificar console do navegador no Desktop
- Verificar se `viewer.watching.has(slot)` é verdadeiro
- Verificar erros de WebCodecs

### Arquivos Envolvidos
- `discord-screen/server/rooms.js`
- `discord-screen/client/src/main.js`
- `discord-screen/client/src/player.js`

---

## BUG-007: Casino Classifier — isForeignNumber falso positivo para JID de grupo

**Status**: ✅ RESOLVIDO
**Data**: 2026-09-16
**Severidade**: MÉDIA

### Sintoma
JIDs de grupo brasileiros (ex: `120363410094452673@g.us`) eram classificados como `foreign-number`, aumentando a confiança de cassino incorretamente.

### Causa Raiz
A função `isForeignNumber()` não excluía JIDs de grupo (`@g.us`) ou LIDs (`@lid`).

### Solução
```typescript
export function isForeignNumber(jid: string): boolean {
  if (!jid) return false;
  // Ignora JIDs de grupo (ex: 120363410094452673@g.us)
  if (jid.includes('@g.us') || jid.includes('@lid')) return false;
  const n = jid.replace(/\D/g, '');
  return n.length > 0 && !n.startsWith('55');
}
```

### Como Evitar
- Sempre testar com JIDs de grupo e LIDs ao modificar funções de detecção

### Arquivos Envolvidos
- `src/services/casinoClassifier.ts`

### Atualização (2026-10-02)
A proteção contra LID foi **reforçada** no engine: `isForeignNumber()` agora
retorna `false` sempre que o JID contém `@lid`, e o número real é lido de
`key.participantAlt` via `isForeignSender()`. Isso corrigiu o BUG-F (LID tratado
como número estrangeiro), que faria o AntiEstrangeiro banir o grupo inteiro.
Ver `docs/TECHNICAL.md` §18.

---

## BUG-010: Grupo novo herdava automações ligadas

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: CRÍTICA

### Sintoma
Um grupo novo (ou a primeira vez que uma flag era ligada) passava a ter
AntiSpam, AntiLink, AntiEstrangeiro e Remover **ligados** sem ninguém pedir.

### Causa Raiz
Dois defeitos combinados:
1. `ensureGroupMod()` criava a linha com defaults `true`.
2. O schema de `group_mod` tinha `DEFAULT 1` nessas colunas, e
   `setGroupModField()` fazia `INSERT INTO group_mod (group_id, <uma flag>)` —
   as demais colunas recebiam o `DEFAULT` da tabela.

Agravante: `CREATE TABLE IF NOT EXISTS` **não altera** tabela já existente, então
bancos antigos mantêm o `DEFAULT 1` gravado no DDL mesmo após a correção do
código-fonte.

### Solução
- `GROUP_MOD_DEFAULTS` com **todas** as flags em `false`.
- Schema com `DEFAULT 0` (só afeta bancos novos).
- Escrita **explícita** de `0` em todas as colunas ao criar a linha, sem
  depender do `DEFAULT` do schema.

### Como Evitar
- Nunca confiar no `DEFAULT` do schema para defaults de aplicação.
- Testar sempre contra um banco com o DDL legado (cenário coberto em
  `tests/unit/groupAutomationConfig.test.ts`).

### Arquivos Envolvidos
- `src/services/databaseService.ts`

### Teste que comprova
`tests/unit/groupAutomationConfig.test.ts` — inclui o caso
"BANCO LEGADO — schema antigo com DEFAULT 1 não liga módulos".

---

## BUG-011: setGroupModField ligava outras flags indiretamente

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: ALTA

### Sintoma
`$bemvindo on` ligava AntiSpam, AntiLink, AntiEstrangeiro e Remover.

### Causa Raiz
O `INSERT` informava apenas a coluna pedida; as demais recebiam o `DEFAULT` da
tabela (`1`).

### Solução
Criar a linha com **todas** as flags explicitamente `0`
(`INSERT OR IGNORE INTO group_mod (group_id, <todas as colunas>) VALUES (?, 0, …)`)
e então aplicar só a flag pedida via `UPDATE`.

### Como Evitar
- Ao criar uma linha de configuração, sempre escrever **todas** as colunas.

### Arquivos Envolvidos
- `src/services/databaseService.ts`

### Teste que comprova
`tests/unit/groupAutomationConfig.test.ts` —
"ligar bemvindo não liga moderação (bug antigo do INSERT)".

---

## BUG-012: Casino e AntiBot sem flags próprias

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: MÉDIA

### Sintoma
Não era possível desligar o AntiBot ou o Casino sem desligar também o
AntiEstrangeiro.

### Causa Raiz
Ambos eram gated por `config.remover`. Não existia `antibot` nem `casino` no
schema de `group_mod`.

### Solução
- Colunas `antibot` e `casino` (default `0`).
- Gates do engine passaram a usar as flags próprias.
- Comandos `$antibot on/off` e `$casino on/off`.

### Como Evitar
- Cada automação configurável precisa de flag própria.

### Arquivos Envolvidos
- `src/services/databaseService.ts`
- `src/services/autoModEngine.ts`
- `src/bot/commands/modToggle.ts`

### Teste que comprova
`tests/unit/groupAutomationConfig.test.ts`, `tests/unit/autoModEngine.test.ts`.

---

## BUG-013: `$automod` status quebrado e incompleto

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: BAIXA

### Sintoma
O status sempre exibia "PERSONALIZADO (misturado)" e não listava AntiBot,
Casino, Welcome nem Apresentações.

### Causa Raiz
1. `getGroupModState()` retorna `'ativado'|'personalizado'|'desativado'`, mas o
   comando comparava com `'on'`/`'off'` — nunca casava.
2. `.replace('${estado}', …)` buscava uma string literal que não existia no
   template.

### Solução
- `getGroupModState()` com tipo de retorno explícito.
- `statusBlock()` monta o texto completo: moderação + serviços + modo.
- `$automod status` passou a usar `getGroupAutomationStatus()`.

### Como Evitar
- Não usar `.replace()` com placeholder literal; interpolar direto no template.

### Arquivos Envolvidos
- `src/bot/commands/modToggle.ts`
- `src/services/databaseService.ts`

### Teste que comprova
`tests/unit/command-signature.test.ts`, `tests/unit/groupAutomationConfig.test.ts`.

---

## BUG-009: Discord Activity — getDisplayMedia no iframe

**Status**: ✅ RESOLVIDO (design)
**Data**: 2026-09-15
**Severidade**: BAIXA

### Sintoma
Tentativa de usar `getDisplayMedia()` diretamente no iframe da Activity falhava.

### Causa Raiz
O Discord sandbox o iframe e bloqueia `display-capture` permission.

### Solução
O design correto é:
1. Activity usa `sdk.commands.openExternalLink()` para abrir página externa
2. Página externa (`share.html`) chama `getDisplayMedia()`
3. Frames são enviados via WebSocket para o servidor
4. Servidor retransmite para a Activity (viewer)

### Como Evitar
- NUNCA usar `getDisplayMedia()` dentro da Activity
- Sempre usar a página externa `share.html` para captura

### Arquivos Envolvidos
- `discord-screen/client/src/main.js` (openExternalLink)
- `discord-screen/server/public/share.html` (getDisplayMedia)

---

## BUG-014: `$bemvindo` importado mas nunca registrado

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: CRÍTICA

### Sintoma
`$bemvindo on/off` não respondia. O `$menu` anunciava o comando e o status do
AutoMod mostrava "Boas-Vindas", mas não havia **nenhuma forma de ligar o welcome
pelo chat** — o serviço de boas-vindas ficava permanentemente desligado.

### Causa Raiz
`bemvindoModCommand` era **importado** em `commands/index.ts` mas nunca
adicionado ao objeto `commands`. Importar não registra: o `loadCommands()` itera
`Object.entries(commands)`, e o comando não estava lá.

### Solução
Registrar `bemvindo: bemvindoModCommand` no objeto `commands`.

### Como Evitar
- Um import sem uso no objeto `commands` é **código morto silencioso**. O teste
  `tests/unit/interfaceNaming.test.ts` agora verifica que todo comando crítico
  (incluindo `$bemvindo`) está registrado.

### Arquivos Envolvidos
- `src/bot/commands/index.ts`

### Teste que comprova
`tests/unit/interfaceNaming.test.ts` — "5. Comandos críticos estão registrados".

---

## BUG-015: `$menu` exibia 13 comandos inexistentes

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: MÉDIA

### Sintoma
O `$menu` mostrava uma seção `📋 LISTAS (por grupo)` com comandos de lista
que **nunca existiram** em `src/` — texto morto de documentação antiga.
Também citava `$bemvindo`, que não estava registrado.

### Causa Raiz
O menu era texto estático, sem nenhuma verificação contra o registro real de
comandos. Comandos removidos do código continuaram sendo anunciados.

### Solução
Remover a seção de listas e o `$bemvindo` inexistente; reorganizar o menu por
categoria (AUTOMOD / AUTOMAÇÕES / ADMINISTRAÇÃO / USUÁRIO) com os nomes oficiais.

### Como Evitar
- Teste automatizado que extrai os comandos citados no `$menu`/`$help` e os
  compara com o registro real. Qualquer comando morto quebra o teste.

### Arquivos Envolvidos
- `src/bot/commands/menu.ts`

### Teste que comprova
`tests/unit/interfaceNaming.test.ts` — "$menu não cita comando inexistente".

---

## BUG-016: Nomenclatura inconsistente na interface

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: BAIXA

### Sintoma
A interface usava nomes divergentes do padrão: `$autolink`/`$casino` em vez de
`$antilink`/`$anticassino`; "Detectar" e "Remover" como rótulos de flags que
significam outra coisa; "Automações do grupo" em vez de "AutoMod".

### Causa Raiz
Ausência de uma tabela de nomenclatura oficial ligando nome exibido ↔ campo
interno. Cada comando foi escrito em momento diferente.

### Solução
- Nomes oficiais PT-BR: Anti-Spam, Anti-Link, Anti-Bot, Anti-Cassino,
  Anti-Estrangeiro, Punição, Anúncio no grupo, Modo Auditoria, Boas-Vindas,
  Apresentações.
- Comandos oficiais com aliases legados preservados.
- Status do AutoMod estruturado em `DETECTORES` → `AÇÕES / MODO` → `AUTOMAÇÕES`.
- **Nenhuma migração de banco**: campos históricos permanecem.

### Como Evitar
- Consultar a tabela de nomenclatura em `docs/TECHNICAL.md §8` antes de criar
  comando ou rótulo novo.

### Arquivos Envolvidos
- `src/bot/commands/modToggle.ts`, `menu.ts`, `help.ts`, `index.ts`

### Teste que comprova
`tests/unit/interfaceNaming.test.ts` (48 testes).

---

## BUG-017: `welcomeService` herdava defaults ligados no INSERT

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: ALTA

### Sintoma
`$setwelcome <texto>` num grupo **sem linha** em `group_mod` podia ligar
AntiSpam, AntiLink, AntiEstrangeiro e Remover — as colunas não informadas
herdavam o `DEFAULT 1` do schema legado.

### Causa Raiz
`setWelcomeMessage` e `setPresentationEnabled` faziam `INSERT INTO group_mod
(group_id, <uma coluna>)`, o mesmo padrão do BUG-011 — que já havia sido
corrigido em `databaseService.ts`, mas **não** nestas duas funções.

### Solução
Ambas passaram a usar `ensureGroupModRow(groupId)`, que cria a linha com
**todas** as flags explicitamente `0` antes do `UPDATE`.

### Como Evitar
- Toda criação de linha em `group_mod` deve passar por `ensureGroupModRow()`.
  Nunca escrever `INSERT INTO group_mod (group_id, <uma coluna>)`.

### Arquivos Envolvidos
- `src/services/welcomeService.ts`
- `src/services/databaseService.ts`

### Teste que comprova
`tests/unit/presentationEnabled.test.ts`, `tests/unit/welcome.test.ts`.

---

## BUG-018: vazamento de configuração entre plataformas no `group_mod`

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: ALTA

### Sintoma
Um grupo de **Telegram** podia ler a configuração de um grupo de **WhatsApp**
com o mesmo identificador numérico (ex.: `146078742`). Descoberto por teste de
integração: `wpp:X` e `tg:X` retornavam a mesma config.

### Causa Raiz
O fallback de resolução (`getGroupModRow`, passo 3) tentava as variantes
`wpp:`/`tg:`/`dc:` para **qualquer** ID. Para IDs numéricos puros
(Telegram/Discord), isso fazia plataformas diferentes colidirem no mesmo
registro.

### Solução
O fallback passou a ser aplicado **somente** quando o ID é um JID do WhatsApp
(contém `@`), que é inequívoco. Para IDs numéricos, a resolução é exata —
preservando a distinção entre plataformas.

### Como Evitar
- Nunca tratar ID de plataformas diferentes como equivalentes. Telegram e
  Discord usam IDs numéricos que podem coincidir com números de telefone.

### Arquivos Envolvidos
- `src/services/databaseService.ts`

### Teste que comprova
`tests/integration/groupModCanonical.test.ts` —
"plataformas diferentes NÃO colidem".

---

## BUG-019: engine não tinha guard de `fromMe` (risco de auto-punição)

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: MÉDIA

### Sintoma
O `evaluate()` não verificava `msg.key.fromMe`. A proteção existia **apenas** no
normalizer. Qualquer outro caminho que chame o engine (testServer, harness,
laboratório) poderia avaliar a própria mensagem do bot — criando loop ou
auto-punição.

### Causa Raiz
Proteção de anti-loop implementada em uma única camada (normalizer), sem defesa
em profundidade no engine.

### Solução
Guard explícito no início de `evaluate()`: `fromMe === true` → retorna
`{ acted: false, reason: 'mensagem do próprio bot' }`.

### Como Evitar
- Proteções críticas devem ter **dupla defesa**: no ponto de entrada do fluxo
  e no ponto de decisão.

### Arquivos Envolvidos
- `src/services/autoModEngine.ts`

### Teste que comprova
`tests/integration/deleteKeyPipeline.test.ts` —
"fromMe=true não gera delete".

---

## BUG-020: capture-store em `laboratorio/` (produção dependia de lab)

**Status**: ✅ RESOLVIDO
**Data**: 2026-10-02
**Severidade**: MÉDIA

### Sintoma
`BaileysConnection` e `BaileysMessageNormalizer` importavam o capture-store via
`require('../../../../laboratorio/capture-store.js')` — código de **produção**
dependendo de um diretório de laboratório, fora de `src/`.

### Causa Raiz
O módulo nasceu como artefato de investigação e passou a ser usado pelo fluxo
principal sem ser promovido a código de produção.

### Solução
Movido para `src/services/captureStore.ts`; imports atualizados; agora entra no
bundle (`dist/services/captureStore.js`).

### Como Evitar
- Nada em `src/` deve importar de `laboratorio/`. Se o pipeline precisa, o
  módulo pertence a `src/`.

### Arquivos Envolvidos
- `src/services/captureStore.ts` (novo)
- `src/platforms/whatsapp/baileys/BaileysConnection.ts`
- `src/platforms/whatsapp/baileys/BaileysMessageNormalizer.ts`

### Teste que comprova
`tests/integration/deleteKeyPipeline.test.ts`, `tests/unit/historyCapture.test.ts`.

---

**Última atualização**: 2026-10-02

---
## Estado pós-auditoria (2026-10-05, d153f10)

Verificado no código real, não na documentação:

| Recurso | Status | Evidência |
|---|---|---|
| $feedback / automação Feedback | ✅ PASS | feedbackService.ts, feedback_events SQLite, 26 testes |
| $sarcasmo / automação Sarcasmo | ✅ PASS | sarcasmoService.ts, 32 testes, integrado no normalizer |
| $menu / $help / comandos registrados | ✅ PASS | 64 comandos registrados; $lista1-3 removidos (nunca existiram) |
| $automod status (blocos separados) | ✅ PASS | AutoMod ≠ automações (Welcome/Apresentações/Feedback/Sarcasmo) |
| health endpoint / BUG-017, BUG-020 | ✅ PASS | BaileysHealth.syncToStore(); `/health` retorna `wpp: connected` |
| group_mod / defaults OFF | ✅ PASS | GROUP_MOD_DEFAULTS todos OFF; ensureGroupModRow() escreve 0 explícito |
| Welcome real (membro real) | ⏳ PENDENTE | Listener group-participants.update implementado; não testado com entrada real |
| Apresentações Telegram (thread 2) | ⏳ PENDENTE | presentationPublisher implementado; não publicado real confirmada |
| Foto de apresentação | ⏳ PENDENTE | downloadMediaMessage/profilePictureUrl não integrado |
| Rate limit por grupo | ⏳ PENDENTE | Cooldown global + por grupo+usuário implementado; rate limit ainda memória |
| Pipeline AutoMod E2E (delete real) | ⏳ PENDENTE | Delete key pipeline testado; prova visual não obtida |
| Testes destrutivos em grupos autorizados | ⏳ PENDENTE | Não realizado nesta fase (sem autorização explícita) |

**Resultado final dos testes (576/576, 38 arquivos):** ✅ PASS
**Estado Git (Windows = GitHub = Linux):** ✅ PASS (d153f10)
**Estado PM2 (Linux):** ✅ PASS (online, WhatsApp+Telegram+Discord conectados)
**Estado Build (Windows + Linux):** ✅ PASS
**Estado Health endpoint:** ✅ PASS (`healthy`, `wpp: connected`)

**O que você pode testar agora:**
- $feedback e automação de saída (simulada via harness; E2E real requer saída de membro)
- $sarcasmo (simulado; responderá com "tenho nada ver com isso sinhô" quando "bot" for detectado)
- $menu / $help / $automod status
- Configuração por grupo (group_mod com feedback/sarcasmo)

**O que ainda NÃO pode ser testado sem autorização real:**
- Welcome com entrada real de membro (não há permissão para adicionar/remover membros no Figurinhas/Teste)
- Apresentação publicada no Telegram (requer membro real + mensagem de apresentação)
- Foto de apresentação (não implementada)
- Delete E2E com prova visual (requer mensagem real no grupo autorizado)
- Pipeline AutoMod completo (requer mensagem real de bot com sinais estruturais)
