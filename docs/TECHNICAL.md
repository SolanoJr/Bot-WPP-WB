# Documentação Técnica — Bot-WPP

## 1. Bugs de Reconnect e Suas Causas

### Bug 1: `handleClose()` falha silenciosa (commit `98f4fea`)

**Causa:** O `handleClose()` do `BaileysAdapter` chamava `connection.connect().catch(() => { this.reconnectInProgress = false; })`. Quando o `connect()` falhava, o erro era engolido (sem log), `reconnectInProgress` ficava `true` para sempre, e o WhatsApp permanecia offline indefinidamente.

**Sintoma:** Bot ficava offline após Stream Errored/Connection Closed sem reconectar automaticamente.

**Correção:** `.catch()` agora loga o erro e reagenda reconnect com backoff exponencial.

### Bug 2: `isSocketReady()` verifica WebSocket errado (commit `8c5de37`)

**Causa:** O código verificava `sock.socket || sock.ws` e depois `ws.readyState === 1`. No Baileys v7:
- `sock.socket` → `undefined` (não existe)
- `sock.ws` → `WebSocketClient` (wrapper do Baileys, NÃO tem `readyState`)
- `sock.ws.socket` → WebSocket nativo (tem `readyState`)
- `sock.ws.isOpen` → getter boolean correto

**Sintoma:** TODOS os envios falhavam com `readyState !== OPEN` mesmo com o socket funcionando.

**Correção:** Usar `sock.ws.isOpen` (getter boolean) com fallback para `sock.ws.socket.readyState === 1`.

### Bug 3: Race condition em `handleClose()` (commit `057b396`)

**Causa:** `reconnectInProgress` era marcado como `true` DENTRO do `setTimeout`. Se `handleClose()` fosse chamado 2x antes do timer executar, ambos agendavam reconnect simultâneo.

**Sintoma:** Dois reconnects concorrentes, possível duplicação de socket.

**Correção:** `reconnectInProgress = true` movido para ANTES do `setTimeout`.

---

## 2. Arquitetura de Socket/Submódulos

### Estrutura

```
BaileysAdapter (orquestrador)
├── BaileysConnection (conexão, QR, reconnect, health)
│   └── sock (socket Baileys v7)
│       ├── sock.ws (WebSocketClient)
│       │   ├── sock.ws.isOpen (getter boolean)
│       │   └── sock.ws.socket (WebSocket nativo)
│       ├── sock.user (informações do usuário)
│       └── sock.sendMessage()
├── BaileysMessageSender (envio de mensagens, reações, quotes)
│   └── sock (referência ao socket)
├── BaileysMessageNormalizer (normalização de mensagens)
│   └── sock (referência ao socket)
├── BaileysChatManager (gerenciamento de chats)
│   └── sock (referência ao socket)
├── BaileysMemberManager (gerenciamento de membros)
│   └── sock (referência ao socket)
└── BaileysHealth (health check)
    └── sock (referência ao socket)
```

### Fluxo de Reconexão

```
Socket fecha
    ↓
BaileysConnection: connection.update → 'close'
    ↓
BaileysAdapter.handleClose(reason, statusCode)
    ↓
reconnectInProgress = true (ANTES do setTimeout)
    ↓
setTimeout(delay)
    ↓
connection.connect()
    ↓
Novo socket criado
    ↓
BaileysConnection: connection.update → 'open'
    ↓
BaileysAdapter.handleOpen()
    ↓
syncSubmodulesWithNewSocket()
    ├── sender.setSock(newSock)
    ├── normalizer.setSock(newSock)
    ├── chatManager.setSock(newSock)
    ├── memberManager.setSock(newSock)
    └── health.setSock(newSock)
    ↓
reconnectInProgress = false
```

### Regras

- Todos os submódulos devem apontar para a MESMA instância de socket
- `syncSubmodulesWithNewSocket()` deve ser chamado após cada reconnect
- `reconnectInProgress` deve ser marcado como `true` ANTES do `setTimeout`
- `isSocketReady()` deve usar `sock.ws.isOpen` (não `sock.socket` ou `sock.ws.readyState`)

---

## 3. Como os Testes E2E Devem Funcionar

### Princípios

1. **Nunca usar Promise resolvida como PASS** — deve haver evidência real de recebimento
2. **Nunca usar log genérico como PASS** — deve haver correlação entre envio e resposta
3. **Nunca escolher chat aleatório só porque está disponível** — deve usar alvo oficial
4. **Cada teste deve ter:** enviado → recebido → processado → resposta real confirmada

### Fluxo Esperado

```
1. Enviar comando via /test endpoint
   ↓
2. Verificar log: "Enviando $comando para chatId"
   ↓
3. Verificar log: "Processando comando $comando"
   ↓
4. Verificar log: "reply: ... text=resposta"
   ↓
5. Verificar log: "Comando executado com sucesso"
   ↓
6. Verificar ausência de erros: readyState !== OPEN, Connection Closed
```

### Validações Específicas

- **Quote:** `quotedRaw=true`, `replyTo=messageId`, `originalKey=messageId`
- **Reação:** evento de reação no log (não apenas Promise resolvida)
- **Loop:** bot não deve reagir à própria resposta (`Mensagem ignorada (do próprio bot)`)

---

## 4. Alvos Oficiais de Teste por Plataforma

### WhatsApp

| Tipo | Valor | Origem |
|---|---|---|
| Chat de teste | `202658048684056@lid` | `.env` → `WPP_TEST_GROUP_ID` |
| Grupo de produção | `120363410094452673@g.us` | `.env` → `WPP_TEST_GROUP_ID` (legado) |
| Grupo Figurinhas | `120363419033272638@g.us` | Descoberto via `/lab/find-message` |

### Telegram

| Tipo | Valor | Origem |
|---|---|---|
| Chat de teste (grupo) | `tg:-1003470059875` | `.env` → `TELEGRAM_CHAT_ID` |
| Privado SolanoJr | `tg:146078742` | Descoberto nos logs — chatId real do SolanoJr |

### Discord

| Tipo | Valor | Origem |
|---|---|---|
| Canal de comandos | `dc:387787838013571072` | Canal "comandos-bots" |

### Regra de Ouro

**Testes de produção NUNCA devem escolher um chat aleatório só porque está disponível.** Sempre usar o alvo oficial definido na configuração ou documentação.

---

## 5. AutoMod/AntiBot

### Visão Geral

O AutoMod é implementado em `src/services/autoModEngine.ts` e integrado ao BaileysAdapter via `handleAutoMod()`.

### Regras

| Regra | Flag | Ação |
|---|---|---|
| Anti-Estrangeiro | `antiestrangeiro` | ban + remove + delete de TODO não-brasileiro (DDI != 55) |
| Anti-Bot | `remover` | ban + remove + delete se >= 2 sinais (foreign + suspeito) |
| Anti-Link | `autolink` | delete mensagem se domínio suspeito |
| Anti-Spam | `antispam` | delete mensagem se palavra-chave + contexto |
| Cassino Alta Probabilidade | `remover` | ban + remove + delete se confiança >= 60 e >= 3 sinais |

### Configuração por Grupo

- Tabela `group_mod` no SQLite
- Ativada via comandos: `$automod on/off`, `$antispam on/off`, etc.
- Requer admin do grupo ou master

### Proteções

- `isProtectedTarget()` — protege WarriorBlack e SolanoJr
- `audit_only` — modo auditoria (não executa ações destrutivas)
- Bot não reage à própria mensagem (anti-loop)

### Estado Atual

- `group_mod` está **VAZIA** — nenhum grupo tem AutoMod ativo
- `infractions` está **VAZIA** — nenhuma infração registrada
- AutoMod **NÃO detecta figurinhas** — não há lógica para `stickerMessage`
- AutoMod **NÃO captura entrada por link** — não há listener para `groupInvite` ou `members.update`
- AutoMod **Só analisa texto e captions** — `imageMessage.caption`, `videoMessage.caption`, `documentMessage.caption`
- AutoMod **NÃO analisa mídia sem caption** — imagem/vídeo sem texto é ignorado

### Grupo Figurinhas/Stickers

- **JID:** `120363419033272638@g.us`
- **Nome:** Figurinhas
- **Descoberto via:** `/lab/find-message` endpoint
- **Mensagens capturadas:** 0 (não há histórico de mensagens no laboratório)

### Como Ativar AutoMod em um Grupo

1. O bot precisa ser **admin** do grupo
2. Executar comando no grupo: `$automod on` (master) ou `$antispam on` (admin)
3. A configuração é persistida na tabela `group_mod` do SQLite
4. Para ver estado: `$automod` (sem args)

### Análise do Conteúdo da Imagem (Spam Cassino)

A imagem mostra um spam de cassino no grupo Figurinhas/Stickers:

| Sinal | Presente? | AutoMod detectaria? |
|---|---|---|
| Número estrangeiro (+62) | ✅ Sim | ✅ Sim (antiestrangeiro) |
| Link suspeito (kl7.games) | ✅ Sim | ✅ Sim (autolink) |
| Palavras-chave spam | ✅ Sim ("taxa de vitórias", "recolha contínua", "bónus", "777-7777") | ✅ Sim (antispam) |
| Imagem com caption | ✅ Sim | ✅ Sim (caption é extraída) |
| Nome suspeito ("Daniel Taylor") | ❌ Não | ❌ Não (nome não é suspeito) |
| Mensagem interativa | ❌ Não | ❌ Não |

**Conclusão:** O AutoMod **detectaria e agiria** sobre esse spam se estivesse ativo no grupo. Os sinais presentes (foreign + link suspeito + spam keywords) são suficientes para trigger das regras `antiestrangeiro`, `autolink` e `antispam`.

### O que FALTA implementar

1. **Detecção de figurinhas** — `stickerMessage` não é analisado
2. **Captura de entrada por link** — não há listener para eventos de `groupInvite` ou `members.update`
3. **Análise de mídia sem caption** — imagem/vídeo sem texto é ignorado (poderia usar OCR ou hash de imagem)

---

## 6. Testes de Produção — Regra de Ouro

**Testes de produção NUNCA devem escolher um chat aleatório só porque está disponível.**

### Por quê?

1. **Falso positivo:** Um chat pode estar disponível mas não ser o alvo correto
2. **Efeito colateral:** Enviar mensagem para chat errado pode causar spam
3. **Resultado inválido:** Teste pode passar no chat errado e falhar no correto

### Como escolher o alvo correto?

1. **Verificar `.env`** — usar `WPP_TEST_GROUP_ID`, `TELEGRAM_CHAT_ID`, etc.
2. **Verificar documentação** — usar alvos oficiais documentados
3. **Verificar banco de dados** — usar chats com histórico de testes
4. **NUNCA usar `/lab/groups` e pegar o primeiro** — isso é aleatório

### Alvos Oficiais

| Plataforma | Alvo | Como usar |
|---|---|---|
| WhatsApp | `202658048684056@lid` | `chatId` no `/test` |
| Telegram | `tg:-1003470059875` | `chatId` no `/test` |
| Discord | `dc:387787838013571072` | `chatId` no `/test` |

---

## 7. Comandos de Moderação

| Comando | Descrição |
|---|---|
| `$automod on/off` | Liga/desliga TUDO (mestre) |
| `$automod` | Mostra estado atual |
| `$antispam on/off` | Anti-spam/cassino |
| `$antiestrangeiro on/off` | Anti-estrangeiro |
| `$autolink on/off` | Anti-link |
| `$bemvindo on/off` | Boas-vindas |
| `$detectar on/off` | Avisar quando detectar |
| `$remover on/off` | Remover + banir |

---

## 8. Referências

- Código fonte: `src/services/autoModEngine.ts`
- Testes: `tests/unit/baileysReconnect.test.ts`, `tests/unit/autoModEngine.test.ts`
- Configuração: `.env` (não versionado)
- Banco de dados: `data/bot_database.db`
