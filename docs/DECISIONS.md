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

**Última atualização**: 2026-09-16
