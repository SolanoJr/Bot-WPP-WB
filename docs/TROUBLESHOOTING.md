# TROUBLESHOOTING.md — Diagnóstico de Problemas

> Guia rápido para diagnosticar problemas comuns no projeto.

---

## 1. DNS / Rede

### Sintoma: `EAI_AGAIN` ou `getaddrinfo failed`

**Diagnóstico**:
```bash
nslookup discord.com
nslookup api.telegram.org
resolvectl status
```

**Causa**: DNS não resolve domínios externos.

**Solução**:
```bash
# Verificar se /etc/resolv.conf é symlink para systemd-resolved
ls -l /etc/resolv.conf

# Se não for, criar symlink
sudo ln -sf /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf

# Validar
resolvectl status
nslookup discord.com
```

**Preferência**: Usar `systemd-resolved` (já configurado com 8.8.8.8, 1.1.1.1).

---

## 2. Baileys / WhatsApp

### Sintoma: `sock.store is not a function`

**Causa**: Baileys v7 não tem `sock.store`.

**Solução**: Usar `authState.creds` e `authState.keys`. Para mensagens, usar eventos.

### Sintoma: `fromMe` errado

**Diagnóstico**:
```bash
# Verificar se o cálculo de fromMe está correto
grep -n "fromMe" src/platforms/whatsapp/baileys/BaileysMessageNormalizer.ts
```

**Causa**: O Baileys v7 usa `isMe()` ou `isMeLId()` para calcular `fromMe`.

**Solução**: Usar `areJisSameUser()` para comparar JIDs.

### Sintoma: Mensagem de terceiro não é removida

**Diagnóstico**:
```bash
# Verificar se a WAMessageKey está completa
grep -n "deleteKey" src/services/testServer.ts
```

**Causa**: A key pode estar truncada (sem `participantAlt` ou `addressingMode`).

**Solução**: Preservar a key completa desde a captura até o envio.

---

## 3. AutoMod

### Sintoma: Loop infinito

**Diagnóstico**:
```bash
# Verificar logs do AutoMod
pm2 logs bot-wpp | grep "AutoMod"
```

**Causa**: Mensagens do próprio bot estão sendo reprocessadas.

**Solução**: Filtrar `fromMe === true` no normalizer e no AutoMod.

### Sintoma: Admin sendo punido

**Diagnóstico**:
```bash
# Verificar se isProtectedTarget está sendo chamado
grep -n "isProtectedTarget" src/services/autoModEngine.ts
```

**Causa**: Falta de verificação de admin antes de ações destrutivas.

**Solução**: Verificar `participant.admin` e `isProtectedTarget()` antes de agir.

---

## 4. Discord Screen Share

### Sintoma: Activity abre mas share.html não abre

**Diagnóstico**:
```bash
# Verificar se openExternalLink está sendo chamado
# Verificar console do navegador na Activity
```

**Causa**: `sdk.commands.openExternalLink()` pode falhar se:
- SDK não está pronto (`sdk.ready()` não concluído)
- URL não está allowlisted no Discord Developer Portal
- Tailscale Funnel não está ativo

**Solução**:
1. Verificar `sdk.ready()` antes de chamar `openExternalLink`
2. Verificar `tailscale funnel status`
3. Verificar Developer Portal

### Sintoma: share.html abre mas transmissão não aparece

**Diagnóstico**:
```bash
# Verificar logs do servidor
pm2 logs discord-screen --lines 50 --nostream

# Verificar se broadcaster conecta
# Verificar se viewer conecta
# Verificar se viewer envia watch(slot)
```

**Causa**: O viewer pode não estar enviando `watch(slot)` ou o servidor não está retransmitindo.

**Solução**:
1. Verificar console do navegador na Activity
2. Verificar `viewer.watching.has(slot)` no servidor
3. Verificar `pushChunk()` no servidor

### Sintoma: Vídeo não renderiza

**Diagnóstico**:
```bash
# Verificar erros de WebCodecs no console
# Verificar se VideoDecoder está configurado
# Verificar se keyframe foi recebido
```

**Causa**: O decoder pode não ter recebido um keyframe inicial.

**Solução**: Verificar se `entry.config` está sendo enviado para o viewer.

---

## 5. Telegram

### Sintoma: `getaddrinfo EAI_AGAIN api.telegram.org`

**Causa**: DNS não resolve `api.telegram.org`.

**Solução**: O TelegramAdapter já usa `127.0.0.53` (systemd-resolved stub). Se falhar, verificar DNS.

---

## 6. Build / Typecheck

### Sintoma: `npm run typecheck` falha

**Diagnóstico**:
```bash
# Verificar erros de tipo
npm run typecheck 2>&1 | head -20
```

**Causa**: Pode ser erro em arquivo novo ou import incorreto.

**Solução**: Corrigir os erros de tipo indicados.

### Sintoma: `npm run build` falha

**Diagnóstico**:
```bash
# Verificar erros de build
npm run build 2>&1 | tail -20
```

**Causa**: Pode ser erro de compilação TypeScript ou tsup.

**Solução**: Corrigir os erros indicados.

---

## 7. PM2 / Produção

### Sintoma: Processo cai imediatamente

**Diagnóstico**:
```bash
pm2 logs bot-wpp --lines 20 --nostream
```

**Causa**: Pode ser erro de inicialização (DNS, credenciais, porta ocupada).

**Solução**: Verificar logs e corrigir o erro.

### Sintoma: Processo online mas não responde

**Diagnóstico**:
```bash
pm2 list
pm2 logs bot-wpp --lines 10 --nostream
```

**Causa**: Pode estar conectado mas sem receber mensagens.

**Solução**: Verificar se o WhatsApp está conectado (QR code escaneado).

---

**Última atualização**: 2026-09-16
