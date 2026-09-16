# PENDING_TESTS.md — Testes Pendentes do Screen Share

> Lista formal de testes que precisam ser executados para validar completamente o Screen Share.

**Última atualização**: 2026-09-16 13:10 BRT
**Commit base**: 1f53abe

---

## Cenários de Teste

| ID | Teste | Origem → Destino | O que verificar | Status |
|----|-------|------------------|-----------------|--------|
| SS-001 | Discord Web broadcaster | Web → | Captura, codec, bitrate, fps | ✅ Validado |
| SS-002 | Discord Web viewer | → Web | Vídeo, áudio, atraso, estabilidade | ✅ Validado |
| SS-003 | Discord Desktop broadcaster | Desktop → | Captura inicia, transmite | ⏳ Parcial |
| SS-004 | Discord Desktop viewer | → Desktop | Desktop recebe/renderiza vídeo | ⏳ |
| SS-005 | Web → Desktop | Web → Desktop | Desktop recebe do Web | ⏳ |
| SS-006 | Desktop → Web | Desktop → Web | Web recebe do Desktop | ⏳ |
| SS-007 | Desktop → Desktop | Desktop → Desktop | Dois clientes Desktop | ⏳ |
| SS-008 | 2+ espectadores | Broadcaster → 2 viewers | Todos recebem vídeo | ⏳ |
| SS-009 | Viewer entra depois | Broadcaster iniciou → viewer entra | Keyframe inicial, vídeo aparece | ⏳ |
| SS-010 | Reconexão broadcaster | Queda/reentrada | Comportamento após desconexão | ⏳ |
| SS-011 | Reconexão viewer | Queda/reentrada | Comportamento após desconexão | ⏳ |
| SS-012 | Estabilidade 5 min | Qualquer cenário | Transmissão por 5 min sem queda | ⏳ |
| SS-013 | Estabilidade 15 min | Qualquer cenário | Transmissão por 15 min sem queda | ⏳ |
| SS-014 | Queda temporária da rede | Rede volta | Recuperação automática | ⏳ |
| SS-015 | Fechar aba de captura | Broadcaster para | Viewer para de receber | ⏳ |
| SS-016 | Fechar Activity | Viewer para | Broadcaster continua? | ⏳ |
| SS-017 | Reiniciar servidor | Processo PM2 | Recuperação após restart | ⏳ |
| SS-018 | PM2 restart | Processo PM2 | Reconexão automática | ⏳ |

---

## Dados a Coletar por Teste

Para cada teste, anotar:

```
Data/hora:
Cliente usado:
Quem transmitiu:
Quem assistiu:
Vídeo apareceu? (SIM/NÃO/PARCIAL):
Áudio apareceu? (SIM/NÃO):
Atraso aproximado:
Travamentos? (SIM/NÃO, quantos):
Transmissão caiu? (SIM/NÃO, horário):
Mensagem de erro, se houver:
Close code nos logs:
Close reason nos logs:
Viewer registrou watch slot? (SIM/NÃO):
Chunks recebidos pelo servidor (se disponível):
Chunks enviados ao viewer (se disponível):
```

---

## Hipóteses a Testar

### H1: Lag
- Bitrate muito alto
- FPS muito alto
- Encoder sem hardware
- Rede congestionada
- Discord Desktop vs Web
- Backpressure no viewer

### H2: Quedas
- WebSocket close code 1000 (normal) vs 1006 (anormal)
- Track ended (getDisplayMedia)
- Encoder erro
- PM2 restart
- Rede

### H3: Viewer sem imagem
- Sem watch(slot)
- Sem keyframe inicial
- Decoder erro
- Codec incompatível

---

**Responsável**: SolanoJr
**Quando**: Noite/fim de semana (com dois clientes Discord disponíveis)
