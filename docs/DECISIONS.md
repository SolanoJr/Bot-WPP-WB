# DECISIONS.md — Decisões Arquiteturais

> Registro de decisões técnicas importantes para entender por que o projeto é como é.

---

## DEC-001: Usar systemd-resolved em vez de /etc/resolv.conf estático

**Data**: 2026-09-15
**Status**: ✅ APLICADA

### Contexto
O servidor Linux usava `/etc/resolv.conf` estático com DNS do Tailscale (`100.100.100.100`), que falhava para `discord.com`.

### Decisão
Usar symlink para `/run/systemd/resolve/stub-resolv.conf` que gerencia DNS automaticamente com fallback para DNSs públicos.

### Justificativa
- systemd-resolved já está ativo e configurado com 8.8.8.8, 1.1.1.1
- Permite fallback automático
- É a maneira correta de gerenciar DNS no Ubuntu 24.04

### Consequências
- `/etc/resolv.conf` não deve ser editado manualmente
- Alterações de DNS devem ser feitas em `/etc/systemd/resolved.conf`

---

## DEC-002: Baileys v7 RC14 como engine do WhatsApp

**Data**: 2026-09-14
**Status**: ✅ APLICADA

### Contexto
O Baileys v7 RC14 é a versão atual e não tem `sock.store`.

### Decisão
Usar `authState.creds` e `authState.keys` em vez de `sock.store`. Para mensagens, usar eventos `ev.on('messages.upsert')`.

### Justificativa
- Baileys v7 é a versão mais recente e estável
- `sock.store` foi removido na v7

### Consequências
- Código compatível apenas com Baileys v7+
- Não funciona com Baileys v6 ou anterior

---

## DEC-003: isProtectedTarget() para proteger dono/bot/admins

**Data**: 2026-09-14
**Status**: ✅ APLICADA

### Contexto
Admins legítimos estavam sofrendo ações do AutoMod.

### Decisão
Criar função `isProtectedTarget()` que verifica se o ID é do bot, dono ou admin.

### Justificativa
- Protege o dono e o bot de ações destrutivas
- Impede que admins sofram ações indevidas

### Consequências
- Toda ação destrutiva deve chamar `isProtectedTarget()` primeiro
- Novos IDs protegidos devem ser adicionados em `permissions.ts`

---

## DEC-004: Discord Screen Share — Captura externa

**Data**: 2026-09-15
**Status**: ✅ APLICADA

### Contexto
O Discord bloqueia `display-capture` no iframe da Activity.

### Decisão
Usar `sdk.commands.openExternalLink()` para abrir página externa (`share.html`) que chama `getDisplayMedia()`.

### Justificativa
- O Discord não permite captura de tela no iframe
- A página externa tem permissão completa do navegador

### Consequências
- O fluxo de captura é em duas etapas (Activity → share.html)
- A página externa deve permanecer aberta durante a transmissão

---

## DEC-005: AutoMod com múltiplos sinais para cassino

**Data**: 2026-09-16
**Status**: ✅ APLICADA

### Contexto
O AutoMod anterior usava apenas `buttonsMessage` para detectar cassino, gerando falsos positivos.

### Decisão
Usar classificador multi-sinal (`casinoClassifier.ts`) que combina:
- `buttons-message`
- `casino-domain`
- `casino-keywords`
- `foreign-number`
- `external-links`
- `suspicious-name`

Requer confiança >= 60% e pelo menos 3 sinais.

### Justificativa
- Reduz falsos positivos
- Aumenta precisão na detecção de bots de cassino

### Consequências
- Mensagens com apenas 1 sinal não são classificadas como cassino
- Novos sinais podem ser adicionados facilmente

---

## DEC-006: Preservar WAMessageKey completa

**Data**: 2026-09-14
**Status**: ✅ APLICADA

### Contexto
A WAMessageKey era truncada antes de chegar ao `sock.sendMessage()`, causando falha no delete.

### Decisão
Preservar a key completa (id, remoteJid, fromMe, participant, participantAlt, addressingMode) desde a captura até o envio.

### Justificativa
- O Baileys precisa da key completa para deletar mensagens de terceiros
- Campos como `participantAlt` e `addressingMode` são essenciais para LID

### Consequências
- Nunca reconstruir WAMessageKey manualmente
- Sempre usar a key original capturada pelo Baileys

---

## DEC-007: SQLite como fonte de verdade; Relay InMemory descartado para config

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
O `$setwelcome` gravava no `InMemoryRepository` do Relay (`Map` em memória).
Reiniciar o processo apagava a configuração — e o bot nunca lia o valor de
volta. O comando respondia "atualizada" sem efeito real.

### Decisão
Toda configuração persistente (welcome, apresentações, automações por grupo) vive
no **SQLite**. O Relay InMemory **não** é fonte de verdade.

### Consequências
- Configuração sobrevive a restart, queda do bot e reconnect
- O Telegram é espelho, não fonte
- Nunca usar o Relay para dados que precisam persistir

---

## DEC-008: Configuração de automações centralizada em `group_mod`

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
Com o crescimento do projeto, cada automação poderia acabar com sua própria
configuração em local diferente — ou, no extremo oposto, toda a lógica num
arquivo gigante.

### Decisão
A **lógica** é separada por serviço (engine de moderação ≠ welcome ≠
apresentações), mas a **configuração** é centralizada na tabela `group_mod`,
consultável de forma consistente por `$automod status`.

### Consequências
- `getGroupAutomationStatus()` é a fonte única de leitura de status
- Uma flag nova precisa ser registrada em `GroupModConfig`, `GROUP_MOD_FLAGS` e
  `GROUP_MOD_DEFAULTS`
- Welcome e apresentações aparecem no status geral, mas têm serviços próprios

---

## DEC-009: Grupo novo começa com todas as automações DESLIGADAS

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
O bot podia passar a moderar um grupo só por ter entrado nele: `ensureGroupMod()`
usava defaults `true` e o schema tinha `DEFAULT 1`, o que também fazia
`setGroupModField` ligar outras flags indiretamente.

### Decisão
Todo recurso automático começa **desligado**. Nada liga por entrada em grupo.
Grupos existentes **não** são alterados nem resetados.

### Consequências
- `GROUP_MOD_DEFAULTS` com tudo `false`
- Escrita **explícita** de `0` ao criar a linha (não confiar no `DEFAULT` do
  schema — `CREATE TABLE IF NOT EXISTS` não altera tabela existente)
- Migrações são aditivas; nenhum `UPDATE` em massa

---

## DEC-010: Welcome separado da moderação

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
`$automod on/off` ligava também `bemvindo`, misturando um serviço de boas-vindas
com o motor de moderação.

### Decisão
Welcome é um **serviço**, não um módulo de moderação. `$automod on/off` controla
apenas as flags de moderação.

### Consequências
- `bemvindo` e `presentation_enabled` ficam fora de `MODERATION_FLAGS`
- O status geral mostra os serviços em bloco separado

---

## DEC-011: PresentationService separado do AutoMod engine

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
Detecção de apresentação é heurística de conteúdo (idade, trabalho, hobbies),
não moderação. Colocá-la no engine arriscaria tratar quem se apresenta como
suspeito.

### Decisão
`presentationService.ts` é um serviço independente, com suas próprias regras,
gatilhos e sessões. O engine não sabe que apresentações existem.

### Consequências
- Coleta roda em `handlePresentationCollect()` no normalizer, não no engine
- `presentation_enabled` é flag de serviço, não de moderação
- Requer adicionalmente grupo na Comunidade 085

---

## DEC-012: Telegram como espelho das apresentações

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
Publicar a apresentação diretamente no Telegram faria a existência dela depender
de a mensagem estar lá.

### Decisão
O **SQLite é a fonte oficial**; o Telegram é um espelho organizado. A
apresentação sobrevive a restart, queda do bot, queda do Telegram e reconnect do
WhatsApp.

### Consequências
- Se o Telegram falhar → `status='failed'`, retry posterior (a apresentação não
  se perde)
- Atualização **edita** a mensagem existente (`tg_message_id`), nunca duplica
- Destino fixo: chat `-1003470059875`, thread `2`

---

## DEC-013: LID e PN são identidades distintas

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
Em grupos com `addressingMode: 'lid'`, o `participant` é um LID
(`123456789012345@lid`). Tratá-lo como telefone fazia `isForeignNumber()`
retornar `true` para **todo** membro — o antiestrangeiro baniria o grupo inteiro.

### Decisão
LID **não** carrega DDI. A identidade e a relação LID↔PN vêm do **metadata real**
do grupo (`phoneNumber`), e o número real está em `key.participantAlt` quando o
participante é LID.

### Consequências
- `isForeignNumber()` retorna `false` para `@lid`
- `isForeignSender(msg, senderJid)` prefere o PN de `participantAlt`
- Nunca converter `@lid` → `@c.us` artificialmente
- `normUserId()` não é usado para decisões sensíveis de identidade

---

## DEC-014: Histórico do WhatsApp via `messaging-history.set`

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
O Baileys v7 não tem store, e o evento `messaging-history.set` não era tratado —
mensagens do histórico eram descartadas silenciosamente.

### Decisão
Tratar o evento e persistir via `laboratorio/capture-store.ts` (JSONL
append-only, sanitizado).

### Consequências
- O capture-store é **artefato de auditoria**, não histórico consultável
- Mensagens anteriores à implementação do handler não são recuperáveis
- Dados sensíveis (`mediaKey`, `fileEncSha256`) são redigidos

---

## DEC-015: audit_only com guard de admin ANTES

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
Em modo auditoria, o guard de admin rodava depois — a proteção não aparecia no
log, dificultando provar que o admin estava protegido.

### Decisão
O guard de admin roda **antes** da checagem de `audit_only`, para que a proteção
seja demonstrável no log mesmo em modo auditoria.

### Consequências
- `reason` mostra "remetente é admin" em vez de "audit-only" para admins
- Ordem: `isProtectedTarget` → admin → `audit_only`

---

## DEC-016: Threshold do AntiBot por sinais independentes

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
Uma única `buttonsMessage` podia gerar dois sinais (`mensagem-interativa` e
`buttonsMessage`), atingindo o threshold e banindo sozinha. Isso puniria qualquer
mensagem legítima com botão.

### Decisão
Estrutura de mensagem conta como **UMA** categoria de sinal, com dedupe. O
threshold é de **≥ 2 sinais independentes**.

### Consequências
- `estrutura-bot(buttonsMessage+listMessage)` = 1 sinal
- Estrutura + outro sinal (foreign, link suspeito, nome suspeito, spam keyword) = 2
- Botão legítimo isolado **não** é punido

---

## DEC-017: Nomenclatura oficial da interface (nome exibido ≠ campo interno)

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
A interface acumulou nomes divergentes: `$autolink`/`$casino`, rótulos
"Detectar" e "Remover" descrevendo flags com outro significado, e o status
misturando serviços com detectores.

### Decisão
Adotar uma **tabela oficial de nomenclatura** ligando nome exibido ↔ comando ↔
campo interno, com interface PT-BR e prefixo "Anti-" nos detectores. Nomes
oficiais primeiro; nomes históricos viram **aliases**.

**Não migrar o banco por estética.** Os campos `autolink`, `casino`, `remover`
e `detectar` permanecem — migrar arriscaria dados de produção por ganho apenas
cosmético.

### Consequências
- Detectores: Anti-Spam, Anti-Link, Anti-Bot, Anti-Cassino, Anti-Estrangeiro
- Ações/modo: Punição, Anúncio no grupo, Modo Auditoria
- Automações: Boas-Vindas, Apresentações
- Aliases mantidos: `$autolink`, `$casino`, `$remover`, `$detectar`
- `$menu` e `$help` só exibem comandos que existem no registro
- Nenhum `ALTER TABLE` ou `UPDATE` de renomeação

---

## DEC-018: `detectar` = anúncio, não detecção

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
O nome `detectar` sugeria que a flag controlava se o bot detecta. Lendo o
engine, a detecção **sempre** acontece — a flag só decide se o bot **anuncia**
no grupo (`🚫 [AUTOMOD] REMOVIDO: …`).

### Decisão
Exibir como **"Anúncio no grupo"**. O campo interno permanece `detectar`.

### Consequências
- Nenhum usuário desliga "detecção" achando que desligou o anúncio
- O `$help` explica que a detecção é sempre ativa

---

## DEC-019: `remover` = punição, não exclusão de mensagem

**Data**: 2026-10-02
**Status**: ✅ APLICADA

### Contexto
O nome `remover` era ambíguo — parecia "apagar a mensagem". Na prática a flag
controla **ban persistente + expulsão do grupo**, e só é consultada no
antiestrangeiro (AntiBot e Casino punem sempre que a própria flag está ligada).

### Decisão
Exibir como **"Punição (banir/expulsar)"**. O campo interno permanece `remover`.

### Consequências
- Fica claro que a flag pune, não apenas apaga
- O alias `$remover` continua funcionando

---

**Última atualização**: 2026-10-02
