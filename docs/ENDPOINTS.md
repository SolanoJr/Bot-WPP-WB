# ENDPOINTS.md — Documentação dos Endpoints HTTP

> Documentação de todos os endpoints HTTP do projeto Bot-WPP.

**Última atualização**: 2026-09-16 15:10 BRT
**Commit**: 0a392cd

---

## TestServer (porta 3004)

Servidor de testes e diagnóstico. Acessível apenas localmente (`127.0.0.1:3004`).

### POST /test

Executa um comando diretamente no bot.

**Parâmetros**:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| platform | string | ✅ | `whatsapp`, `telegram`, `discord` |
| command | string | ✅ | Comando com prefixo `$` (ex: `$menu`) |

**Resposta de sucesso (200)**:
```json
{ "ok": true, "platform": "discord", "command": "$menu", "result": "..." }
```

**Resposta de erro (400)**:
```json
{ "error": "Command must start with $" }
```

**Exemplo**:
```bash
curl -X POST http://localhost:3004/test \
  -H "Content-Type: application/json" \
  -d '{"platform":"discord","command":"$menu"}'
```

---

### POST /lab/groups

Lista todos os grupos ativos de uma plataforma.

**Parâmetros**:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| platform | string | ✅ | `whatsapp`, `telegram`, `discord` |

**Resposta de sucesso (200)**:
```json
{ "ok": true, "count": 5, "groups": [{ "id": "...", "name": "..." }] }
```

**Exemplo**:
```bash
curl -X POST http://localhost:3004/lab/groups \
  -H "Content-Type: application/json" \
  -d '{"platform":"whatsapp"}'
```

---

### GET /lab/stats

Retorna estatísticas de uso do testServer.

**Parâmetros**: Nenhum

**Resposta de sucesso (200)**:
```json
{ "ok": true, "stats": { "total_attempts": 10, "total_success": 8 } }
```

**Exemplo**:
```bash
curl http://localhost:3004/lab/stats
```

---

### POST /lab/find-message

Busca um grupo pelo nome e retorna metadados.

**Parâmetros**:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| platform | string | ✅ | `whatsapp` |
| groupName | string | ✅ | Nome parcial do grupo |

**Resposta de sucesso (200)**:
```json
{
  "ok": true,
  "platform": "whatsapp",
  "groupName": "Figurinhas",
  "groupJid": "120363419033272638@g.us",
  "messageCount": 42,
  "chatInfo": { "id": "120363419033272638@g.us", "name": "Figurinhas" }
}
```

**Exemplo**:
```bash
curl -X POST http://localhost:3004/lab/find-message \
  -H "Content-Type: application/json" \
  -d '{"platform":"whatsapp","groupName":"Figurinhas"}'
```

---

### POST /lab/messages

Busca mensagens de um grupo (usa JSONL de capturas).

**Parâmetros**:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| platform | string | ✅ | `whatsapp` |
| groupJid | string | ✅ | JID completo do grupo |
| limit | number | ❌ | Máximo de mensagens (padrão: 200) |

**Resposta de sucesso (200)**:
```json
{ "ok": true, "messages": [{ "key": {...}, "message": {...}, "receivedAt": 1234567890 }], "count": 42, "groupJid": "..." }
```

**Exemplo**:
```bash
curl -X POST http://localhost:3004/lab/messages \
  -H "Content-Type: application/json" \
  -d '{"platform":"whatsapp","groupJid":"120363419033272638@g.us","limit":50}'
```

---

### POST /lab/delete-message

Deleta uma mensagem de grupo (com proteção contra deletar mensagem do bot).

**Parâmetros**:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| platform | string | ✅ | `whatsapp` |
| groupJid | string | ✅ | JID do grupo |
| messageId | string | ✅ | ID da mensagem |
| participant | string | ❌ | JID do participante |
| fromMe | boolean | ❌ | Se a mensagem é do bot |

**Resposta de sucesso (200)**:
```json
{
  "attempted": true,
  "requestSent": true,
  "messageKey": { "id": "...", "remoteJid": "...", "fromMe": false, "participant": "..." },
  "confirmation": "confirmed",
  "reason": "Evento messages.update recebido para ...",
  "sendMessageResult": { "key": {...}, "protocolMessage": {...}, "status": 1 },
  "confirmationEvent": { "type": "messages.update", "data": {...} }
}
```

**Proteções**:
- Bloqueia deleção de mensagem do próprio bot (`fromMe=true`)
- Bloqueia se `remoteJid` não corresponde ao `groupJid`

**Exemplo**:
```bash
curl -X POST http://localhost:3004/lab/delete-message \
  -H "Content-Type: application/json" \
  -d '{"platform":"whatsapp","groupJid":"120363419033272638@g.us","messageId":"3EB0..."}'
```

---

### POST /lab/adapter

Retorna status do adapter de uma plataforma.

**Parâmetros**:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| platform | string | ✅ | `whatsapp`, `telegram`, `discord` |

**Resposta de sucesso (200)**:
```json
{
  "ok": true,
  "platform": "whatsapp",
  "adapterId": "whatsapp",
  "connected": true,
  "userId": "558581344211:72@s.whatsapp.net",
  "storeAvailable": false
}
```

**Exemplo**:
```bash
curl -X POST http://localhost:3004/lab/adapter \
  -H "Content-Type: application/json" \
  -d '{"platform":"whatsapp"}'
```

---

### POST /lab/history

Busca histórico de mensagens via `fetchMessageHistory` (Baileys).

**Parâmetros**:
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| platform | string | ✅ | `whatsapp` |
| groupJid | string | ✅ | JID do grupo |
| oldestMsgId | string | ❌ | ID da mensagem mais antiga |
| oldestMsgTimestamp | number | ❌ | Timestamp da mensagem mais antiga |
| count | number | ❌ | Quantidade (padrão: 200) |

**Resposta de sucesso (200)**:
```json
{ "ok": true, "messages": [...], "count": 20, "groupJid": "..." }
```

**Exemplo**:
```bash
curl -X POST http://localhost:3004/lab/history \
  -H "Content-Type: application/json" \
  -d '{"platform":"whatsapp","groupJid":"120363419033272638@g.us","count":50}'
```

---

## Screen Share Server (porta 3002)

Servidor do Discord Screen Share. Acessível localmente e via Tailscale Funnel.

### GET /lab/screen-stats

Retorna métricas de telemetria do Screen Share (read-only, não expõe tokens).

**Parâmetros**: Nenhum

**Resposta de sucesso (200)**:
```json
{
  "rooms": [
    {
      "id": "call-387769672319107073",
      "broadcasters": 1,
      "viewers": 2,
      "slots": [0],
      "droppedChunks": 0,
      "watching": [
        { "name": "SolanoJr", "watching": [0] }
      ],
      "traffic": {
        "bytesReceived": 1024000,
        "bytesSent": 2048000,
        "bytesDropped": 0
      }
    }
  ],
  "totalRooms": 1,
  "totalBroadcasters": 1,
  "totalViewers": 2
}
```

**Campos**:
| Campo | Descrição |
|-------|-----------|
| rooms[] | Lista de salas ativas |
| rooms[].id | ID da sala |
| rooms[].broadcasters | Número de transmissores |
| rooms[].viewers | Número de espectadores |
| rooms[].slots | Slots de transmissão ativos |
| rooms[].droppedChunks | Chunks descartados por backpressure |
| rooms[].watching | Quem está assistindo qual slot |
| rooms[].traffic.bytesReceived | Bytes recebidos do broadcaster |
| rooms[].traffic.bytesSent | Bytes enviados aos viewers |
| rooms[].traffic.bytesDropped | Bytes descartados |

**Exemplo**:
```bash
curl http://localhost:3002/lab/screen-stats
```

**Remoto (Tailscale)**:
```bash
curl https://ubuntu.tail8486e7.ts.net/lab/screen-stats
```

---

### GET /api/health

Health check do servidor Screen Share.

**Resposta de sucesso (200)**:
```json
{ "ok": true }
```

---

## Segurança

- **TestServer (3004)**: Apenas `127.0.0.1` (localhost)
- **Screen Share (3002)**: Acesso público via Tailscale Funnel
- **Autenticação**: Nenhum endpoint exige autenticação (são read-only ou teste)
- **Tokens**: Nenhum token/secret é exposto nas respostas

---

## Uso por ambiente

| Endpoint | Produção | Laboratório | Teste |
|----------|----------|-------------|-------|
| POST /test | ❌ | ✅ | ✅ |
| POST /lab/groups | ❌ | ✅ | ❌ |
| GET /lab/stats | ❌ | ✅ | ❌ |
| POST /lab/find-message | ❌ | ✅ | ❌ |
| POST /lab/messages | ❌ | ✅ | ❌ |
| POST /lab/delete-message | ❌ | ✅ | ❌ |
| POST /lab/adapter | ❌ | ✅ | ❌ |
| POST /lab/history | ❌ | ✅ | ❌ |
| GET /lab/screen-stats | ✅ | ✅ | ❌ |
| GET /api/health | ✅ | ✅ | ❌ |

---

**Última atualização**: 2026-09-16 15:10 BRT
**Commit**: 0a392cd
