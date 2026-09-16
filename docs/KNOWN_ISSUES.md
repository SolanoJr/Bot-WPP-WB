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

---

## BUG-008: Typecheck — fromMe não existe em AutoModContext

**Status**: ⚠️ PENDENTE
**Data**: 2026-09-16
**Severidade**: ALTA

### Sintoma
```
src/platforms/whatsapp/baileys/BaileysMessageNormalizer.ts(407,15): error TS2353
src/platforms/whatsapp/BaileysAdapter.ts(426,15): error TS2353
```

### Causa Raiz
O tipo `AutoModContext` não tem a propriedade `fromMe`, mas o código a passa.

### Solução Proposta
Adicionar `fromMe?: boolean` ao tipo `AutoModContext` em `autoModEngine.ts`.

### Como Evitar
- Sempre verificar o tipo `AutoModContext` ao adicionar propriedades

### Arquivos Envolvidos
- `src/services/autoModEngine.ts`
- `src/platforms/whatsapp/baileys/BaileysMessageNormalizer.ts`
- `src/platforms/whatsapp/BaileysAdapter.ts`

---

## BUG-009: Discord Activity — getDisplayMedia no iframe

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
