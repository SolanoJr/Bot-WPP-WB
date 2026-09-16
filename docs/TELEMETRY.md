# TELEMETRIA DO SCREEN SHARE

> Este documento descreve as métricas e eventos disponíveis para diagnóstico do Screen Share.

**Última atualização**: 2026-09-16 12:30 BRT
**Commit**: a ser criado
**Estado**: IMPLEMENTAÇÃO EM ANDAMENTO

---

## 1. EVENTOS DE LOG

### 1.1. Conexão/Desconexão

| Evento | Log | Quando |
|--------|-----|--------|
| Broadcaster conectado | `[room {id}] broadcaster conectado: {nome} · {fonte} (slot {slot})` | WebSocket upgrade bem-sucedido |
| Broadcaster saiu | `[room {id}] broadcaster saiu: {nome} (code={code}, reason={reason})` | WebSocket close |
| Broadcaster error | `[room {id}] broadcaster error: {nome} — {erro}` | WebSocket error |
| Viewer conectado | (sem log dedicado) | WebSocket upgrade bem-sucedido |
| Viewer saiu | `[room {id}] viewer saiu: {nome} (code={code}, reason={reason})` | WebSocket close |
| Viewer error | `[room {id}] viewer error: {nome} — {erro}` | WebSocket error |

### 1.2. Streaming

| Evento | Log | Quando |
|--------|-----|--------|
| Stream iniciada | `[room {id}] stream iniciada por {nome}` | Recebeu mensagem `start` |
| Stream parada | `[room {id}] stream parada por {nome}` | Recebeu mensagem `stop` |
| Codec negociado | `[room {id}] codec de {nome}: {codec}` | Recebeu config do broadcaster |
| Audio configurado | `[room {id}] audio de {nome}: {codec}` | Recebeu audio-config |
| Viewer assistindo | `[room {id}] {nome} assistindo slot {slot}` | Recebeu `watch(slot)` |
| Viewer parou de assistir | `[room {id}] {nome} parou de assistir slot {slot}` | Recebeu `unwatch(slot)` |

### 1.3. Salas

| Evento | Log | Quando |
|--------|-----|--------|
| Sala criada | `[room {id}] criada por {nome}: "{nome_sala}"` | POST /api/rooms/create |
| Sala fechada | `[room {id}] fechada por inatividade` | Sem viewers/broadcasters |
| Broadcast pedido | `[room {id}] {nome} pediu {fonte} à própria aba` | Recebeu `start-broadcast` |
| Parada pedida | `[room {id}] parada pedida por {nome}: {fontes}` | Recebeu `stop-broadcast` |

---

## 2. MÉTRICAS COLETADAS

### 2.1. Servidor (rooms.js)

As métricas são coletadas em `entry.traffic` (por broadcaster) e `room.traffic` (por sala).

| Métrica | Descrição | Onde |
|---------|-----------|------|
| `receivedBytes` | Bytes recebidos do broadcaster | `entry.traffic`, `room.traffic` |
| `transmittedBytes` | Bytes enviados aos viewers | `entry.traffic`, `room.traffic` |
| `droppedBytes` | Bytes descartados (backpressure) | `entry.traffic`, `room.traffic` |
| `viewers` | Número de viewers conectados | `room.__telemetry.viewers` |
| `broadcasters` | Número de broadcasters conectados | `room.__telemetry.broadcasters` |
| `chunksLigados` | Se chunks estão fluindo | `entry.chunksLigados` |

### 2.2. Broadcaster (broadcaster.js)

| Métrica | Descrição | Onde |
|---------|-----------|------|
| `framesEntrada` | Quadros capturados por segundo | `onStats` callback |
| `fps` | Quadros codificados por segundo | `onStats` callback |
| `mbps` | Megabits por segundo enviados | `onStats` callback |
| `viewers` | Número de espectadores | `onStats` callback |
| `seconds` | Duração da sessão em segundos | `onStats` callback |
| `codec` | Codec de vídeo negociado | `onStatus` callback |

### 2.3. Viewer (player.js)

| Métrica | Descrição | Onde |
|---------|-----------|------|
| `framesDrawn` | Quadros renderizados no canvas | `player.framesDrawn` |
| `getLag()` | Latência entre captura e exibição | `player.getLag()` |
| `getJitter()` | Variação da latência | `player.getJitter()` |
| `takeFrameCount()` | Quadros recebidos desde última chamada | `player.takeFrameCount()` |
| `getSizes()` | Resolução do vídeo | `player.getSizes()` |

---

## 3. DIAGNÓSTICOS POSSÍVEIS

### 3.1. Lag Alto

**Sintoma**: Transmissão com atraso perceptível.

**Verificar**:
1. `player.getLatência()` — latência entre captura e exibição
2. `player.getJitter()` — variação da latência
3. `bufferedAmount` do WebSocket — backpressure
4. `entry.traffic.droppedBytes` — frames descartados

**Possíveis causas**:
- Bitrate muito alto
- FPS muito alto
- Encoder sem hardware
- Rede congestionada

### 3.2. Viewer Sem Imagem

**Sintoma**: Viewer conectado mas sem vídeo.

**Verificar**:
1. Logs: `{nome} assistindo slot {slot}` — viewer enviou watch?
2. `viewer.__watching.has(slot)` — viewer está assistindo?
3. `entry.traffic.transmittedBytes` — servidor está enviando?
4. `player.framesDrawn` — viewer está renderizando?
5. Console do navegador: erros de WebCodecs?

**Possíveis causas**:
- Viewer não enviou `watch(slot)`
- Sem keyframe inicial
- Decoder não configurou
- Erro de codec

### 3.3. Queda da Transmissão

**Sintoma**: Transmissão para sem motivo aparente.

**Verificar**:
1. Logs: `broadcaster saiu (code={code}, reason={reason})` — close code
2. Logs: `viewer saiu (code={code}, reason={reason})` — viewer caiu?
3. `track.onended` — getDisplayMedia terminou?
4. `encoder.encodeQueueSize > 2` — backpressure?
5. `pm2 logs` — processo reiniciou?

**Possíveis causas**:
- Broadway perdeu conexão
- WebSocket caiu
- Encoder parou
- getDisplayMedia terminou
- Track ended

### 3.4. Congestionamento

**Sintoma**: Tranca, queda de FPS, imagem picota.

**Verificar**:
1. `entry.traffic.droppedBytes` — bytes descartados
2. `bufferedAmount > MAX_BUFFERED_BYTES` — backpressure ativo
3. `encoder.encodeQueueSize` — fila do encoder
4. `mbps` — bitrate atual vs. configurado

**Possíveis causas**:
- Bitrate muito alto para a rede
- FPS muito alto
- Múltiplos viewers
- Sem hardware encoding

---

## 4. COMO ACESSAR AS MÉTRICAS

### 4.1. Via Logs do PM2

```bash
# Broadcaster
ssh solanojr@100.101.218.16 "pm2 logs discord-screen --lines 100 --nostream | grep 'broadcaster'"

# Viewer
ssh solanojr@100.101.218.16 "pm2 logs discord-screen --lines 100 --nostream | grep 'viewer'"

# Streaming
ssh solanojr@100.101.218.16 "pm2 logs discord-screen --lines 100 --nostream | grep 'stream'"
```

### 4.2. Via Console do Navegador

**Activity (Viewer)**:
```javascript
// Abrir console (F12)
// Métricas do player estão em cada stream
```

**share.html (Broadcaster)**:
```javascript
// Abrir console (F12)
// Métricas estão nos callbacks onStatus e onStats
```

---

## 5. LIMITAÇÕES CONHECIDAS

### 5.1. O Que NÃO Conseguimos Medir

| Métrica | Motivo |
|---------|--------|
| Latência real de rede | Não há medição ativa de RTT entre broadcaster e viewer |
| Perda de pacotes | WebSocket é sobre TCP, perda é transparente |
| CPU/GPU do encoder | Não há API para monitorar |
| Decoder performance | Não há métricas detalhadas |
| Diferença Web vs Desktop | Não há telemetria separada |

### 5.2. O Que PODE Melhorar

| Melhoria | Esforço | Prioridade |
|----------|---------|------------|
| Endpoint `/lab/screen-stats` | Baixo | ALTA |
| Log de `watch(slot)` | Baixo | ALTA |
| Close codes | Baixo | ALTA |
| Métricas do player | Médio | MÉDIA |
| Métricas do broadcaster | Médio | MÉDIA |
| Admin dashboard | Alto | BAIXA |

---

**Última atualização**: 2026-09-16 12:30 BRT
**Commit**: pendente
**Responsável**: Hermes Agent
