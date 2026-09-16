# KNOWN_ISSUES.md — Bugs Conhecidos e Resolvidos

> Este documento registra bugs encontrados, suas causas e soluções para evitar regressões.

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

## BUG-006: Discord Screen Share — Transmissão não aparece na Activity

**Status**: ⚠️ INVESTIGAÇÃO
**Data**: 2026-09-15
**Severidade**: MÉDIA

### Sintoma
- Broadcaster conecta corretamente (logs confirmam)
- Servidor recebe frames
- Viewer (Activity) conecta
- Mas o vídeo não aparece na Activity

### Causa Provável
O viewer pode não estar enviando `watch(slot)` para o servidor, ou o Tailscale Funnel não está encaminhando corretamente os frames do broadcaster para o viewer.

### Status da Investigação
- [x] Broadcaster conecta ✅
- [x] Servidor recebe frames ✅
- [x] Viewer conecta ✅
- [ ] Viewer envia `watch(slot)` — A VERIFICAR
- [ ] Servidor retransmite frames para viewer — A VERIFICAR
- [ ] Player decodifica frames — A VERIFICAR
- [ ] Canvas renderiza — A VERIFICAR

### Próximos Passos
1. Verificar console do navegador na Activity
2. Verificar se `viewer.watching.has(0)` é verdadeiro
3. Verificar se `pushChunk()` envia dados para o viewer

### Arquivos Envolvidos
- `discord-screen/server/rooms.js` (pushChunk, watching)
- `discord-screen/client/src/main.js` (viewer)
- `discord-screen/client/src/player.js` (decoder)

---

## BUG-007: Discord Activity — getDisplayMedia no iframe

**Status**: ✅ RESOLVIDO (design)
**Data**: 2026-09-15
**Severidade**: BAIA

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

**Última atualização**: 2026-09-16
