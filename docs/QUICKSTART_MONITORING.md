# 🚀 Quick Start: Prometheus + Grafana Monitoring

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- `prom-client` instalado (já está em `package.json`)
- Bot-WPP rodando na porta 3000

## ⚡ Setup em 3 passos

### 1️⃣ Iniciar Stack de Monitoramento

```bash
cd /path/to/bot-wpp
docker-compose up -d
```

Verificar status:
```bash
docker-compose ps
```

### 2️⃣ Acessar Interfaces

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| **Prometheus** | http://localhost:9090 | - |
| **Grafana** | http://localhost:3100 | admin / admin |
| **AlertManager** | http://localhost:9093 | - |
| **Métricas Bot** | http://localhost:3001/metrics | - |
| **Health Check** | http://localhost:3001/health | - |

### 3️⃣ Integrar no Código Bot

Adicione ao seu arquivo principal (ex: `src/core/index.ts` ou `src/whatsapp.ts`):

```typescript
import metricsService from './services/metricsService';

// ✅ Adicionar isto na função de inicialização
async function initializeBot() {
  // Iniciar servidor de métricas
  await metricsService.start();
  
  // Coletar métricas de sistema a cada 60 segundos
  metricsService.startSystemMetricsCollection(60000);
  
  // ... resto do código ...
}
```

## 📊 Primeiros Testes

### Verificar Métricas

```bash
# Terminal 1: Ver métricas em tempo real
curl http://localhost:3001/metrics | head -30

# Terminal 2: Health check
curl http://localhost:3001/health | jq .
```

### Verificar Prometheus

1. Abra http://localhost:9090
2. Clique em **Status** → **Targets**
3. Procure por `bot-wpp` - deve estar `UP` (verde)
4. Vá para **Graph**
5. Digite: `bot_active_platforms`
6. Execute a query

### Verificar Grafana

1. Abra http://localhost:3100
2. Login: `admin` / `admin`
3. Vá para **Dashboards**
4. Procure por "Bot-WPP Overview"
5. Visualize os gráficos

## 🔧 Uso das Métricas no Código

```typescript
import metricsService from './services/metricsService';

// ========== MENSAGENS ==========
// Ao receber mensagem
metricsService.recordMessageReceived('whatsapp');

// Ao enviar mensagem
metricsService.recordMessageSent('whatsapp');


// ========== COMANDOS ==========
// Comando executado com sucesso
metricsService.incrementCommand('help', 'whatsapp');

// Comando com erro
metricsService.recordCommandError('ban', 'timeout_error', 'whatsapp');


// ========== PERFORMANCE ==========
// Registrar duração de processamento
const startTime = Date.now();
// ... processar mensagem ...
const duration = Date.now() - startTime;
metricsService.recordMessageProcessingDuration('whatsapp', duration);

// Registrar duração de comando
const cmdStart = Date.now();
// ... executar comando ...
const cmdDuration = Date.now() - cmdStart;
metricsService.recordCommandExecutionDuration('help', cmdDuration);


// ========== CONEXÕES ==========
// Bot conectou em uma plataforma
metricsService.recordPlatformConnection('whatsapp');

// Bot desconectou de uma plataforma
metricsService.recordPlatformDisconnection('whatsapp');


// ========== FILA ==========
// Atualizar tamanho da fila
metricsService.setQueueSize(currentQueue.length);


// ========== RATE LIMIT ==========
// Bot atingiu rate limit
metricsService.incrementRateLimitHit();
```

## 🚨 Alertas Disponíveis

O Prometheus automaticamente alerta se:

- ❌ **BotDown**: Bot offline por >2 min
- 🔴 **HighErrorRate**: Taxa de erro >10%
- 🔴 **AllPlatformsDisconnected**: Nenhuma plataforma ativa
- ⚠️ **HighMemoryUsage**: Consumo >500MB
- ⚠️ **SlowMessageProcessing**: Latência P95 >1s
- ⚠️ **LargeQueueBacklog**: >100 mensagens na fila

[Veja todos os alertas](../prometheus-rules.yml)

## 📈 Dashboards Disponíveis

### Bot-WPP Overview (Padrão)

- 📊 Taxa de Mensagens (recv/send por segundo)
- 🔌 Conexões Ativas por Plataforma
- ⏱️ Latência de Processamento (P95, P99)
- 📋 Comandos Executados (último 1h)
- ❌ Erros de Comando (último 1h)
- 💾 Uso de Memória (MB)
- ⏰ Uptime (horas)

## 🛠️ Troubleshooting

### Prometheus não vê o Bot

```bash
# Verificar se bot está respondendo
curl http://localhost:3001/metrics

# Se não funcionar, reiniciar metricsService
# Logs do Prometheus
docker logs bot-prometheus | tail -20
```

### Grafana sem dados

1. Verificar Data Source: Configuration → Data Sources → Prometheus
2. URL deve ser: `http://prometheus:9090`
3. Clicar em "Test" para validar

### Alertas não funcionam

1. Verificar AlertManager: http://localhost:9093
2. Verificar config: `alertmanager.yml`
3. Reiniciar: `docker restart bot-alertmanager`

## 🗑️ Limpeza

```bash
# Parar serviços (mantém dados)
docker-compose down

# Parar e remover volumes (deleta dados)
docker-compose down -v

# Limpar específico
docker volume rm bot-wpp_prometheus_data
docker volume rm bot-wpp_grafana_data
```

## 📚 Documentação Completa

- [MONITORING_GUIDE.md](../docs/MONITORING_GUIDE.md) - Guia detalhado
- [prometheus.yml](../prometheus.yml) - Configuração Prometheus
- [prometheus-rules.yml](../prometheus-rules.yml) - Regras de alertas
- [metricsService.ts](../src/services/metricsService.ts) - Código fonte
- [PROJECT_MEMORY.md](../PROJECT_MEMORY.md) - Context geral

## ✅ Checklist Implementação

- [x] Docker-compose com stack completo
- [x] metricsService.ts production-ready
- [x] Prometheus scraping bot
- [x] Grafana dashboards auto-provisioned
- [x] AlertManager configurado
- [x] Regras de alertas definidas
- [x] Documentação criada
- [ ] Integrar no código do bot (manual)
- [ ] Testar em produção (Linux)
- [ ] Configurar notificações (opcional)

## 🚀 Próximos Passos

1. **Integrar no Bot**
   ```bash
   # Adicione os calls de metricsService onde apropriado
   # Revise: docs/MONITORING_GUIDE.md - "Integração no Código"
   ```

2. **Testar Localmente**
   - Enviar mensagens de teste
   - Executar comandos
   - Verificar dados no Grafana

3. **Deploy em Produção**
   ```bash
   scp docker-compose.yml prometheus.yml alertmanager.yml \
     solanojr@100.101.218.16:/home/solanojr/bot-wpp/
   scp -r grafana/ solanojr@100.101.218.16:/home/solanojr/bot-wpp/
   ```

4. **Configurar Notificações** (Slack, Discord, etc)
   - Editar `alertmanager.yml`
   - Adicionar webhook URLs
   - Testar

## 📞 Suporte

Para mais informações:
- Abra `docs/MONITORING_GUIDE.md`
- Consulte `PROJECT_MEMORY.md` - seção "MONITORAMENTO"
- Revise `prometheus-rules.yml` para alertas disponíveis
