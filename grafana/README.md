# Telemetria — Bot-WPP (Prometheus + Grafana)

O `metricsService` expõe métricas Prometheus em `http://127.0.0.1:3001/metrics`
e healthcheck em `http://127.0.0.1:3001/health`.

## Como ligar (Linux, junto do PM2)

1. Instale Prometheus e Grafana (ou use Docker):
   ```bash
   # Prometheus (scrape a cada 15s do bot)
   prometheus --config.file=grafana/prometheus.example.yml

   # Grafana
   grafana-server
   ```
2. No Grafana: **Connections → Data sources → Add Prometheus** → URL `http://127.0.0.1:9090`.
3. Importe o dashboard `grafana/dashboards/bot-wpp-overview.json`
   (**Dashboards → Import → Upload JSON**).

> O bot já popula as métricas abaixo (via `PlatformManager` + `metricsService`):
> mensagens recebidas/enviadas por plataforma, conexões, comandos executados/errados,
> rate-limit, duração de processamento/comando, memória, uptime, heartbeat.

## Métricas disponíveis (20)

| Métrica | Tipo | Descrição |
|---|---|---|
| `bot_messages_received_total` | Counter | Mensagens recebidas (label `platform`) |
| `bot_messages_sent_total` | Counter | Mensagens enviadas (label `platform`) |
| `bot_whatsapp_messages_total` | Counter | Mensagens WhatsApp (label `direction`) |
| `bot_telegram_messages_total` | Counter | Mensagens Telegram (label `direction`) |
| `bot_discord_messages_total` | Counter | Mensagens Discord (label `direction`) |
| `bot_commands_executed_total` | Counter | Comandos executados (label `command`,`platform`) |
| `bot_commands_errored_total` | Counter | Comandos com erro (label `command`,`error_type`,`platform`) |
| `bot_rate_limit_hits_total` | Counter | Hits de rate-limit |
| `bot_platform_connections_total` | Counter | Conexões de plataforma (label `platform`) |
| `bot_platform_disconnections_total` | Counter | Desconexões de plataforma (label `platform`) |
| `bot_active_connections` | Gauge | Conexões ativas (label `platform`) |
| `bot_active_platforms` | Gauge | Plataformas ativas |
| `bot_queue_size` | Gauge | Tamanho da fila |
| `bot_memory_usage_bytes` | Gauge | Memória heap usada |
| `bot_uptime_seconds` | Gauge | Uptime em segundos |
| `bot_last_heartbeat_timestamp` | Gauge | Timestamp do último heartbeat |
| `bot_error_rate` | Gauge | Taxa de erro 0-1 (label `platform`) |
| `bot_message_processing_duration_ms` | Histogram | Duração processamento msg (label `platform`) |
| `bot_command_execution_duration_ms` | Histogram | Duração execução comando (label `command`) |
| `bot_relay_response_time_ms` | Histogram | Tempo de resposta do relay |

## Notas

- O dashboard `bot-wpp-overview.json` cobre 8 das 20 métricas (versão inicial).
  Para expandir, adicione painéis usando as métricas acima (ex: mensagens por
  plataforma, `bot_error_rate`, `bot_active_platforms`, `bot_last_heartbeat_timestamp`).
- O `loggerService` (Winston) também escreve em `logs/combined.log`, `logs/commands.jsonl`,
  `logs/platforms.jsonl` — complementar ao Prometheus para auditoria estruturada.
