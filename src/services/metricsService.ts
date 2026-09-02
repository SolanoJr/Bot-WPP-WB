/**
 * Serviço de Métricas Prometheus - Production Ready
 * Expõe métricas do bot para monitoramento em tempo real
 * Integrado com Prometheus + Grafana para observabilidade completa
 */

import express, { Request, Response, Express } from 'express';
import v8 from 'node:v8';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics
} from 'prom-client';
import logger from './loggerService';
import { getWppHealth } from './healthStore';

interface MetricsConfig {
  port?: number;
  path?: string;
}

class MetricsService {
  private app: Express;
  private registry: Registry;
  private metricsPort: number;
  private metricsPath: string;
  private server: any;

  // ========== CONTADORES ==========
  private commandsExecuted: Counter;
  private messagesReceived: Counter;
  private messagesSent: Counter;
  private commandsErrored: Counter;
  private platformConnections: Counter;
  private platformDisconnections: Counter;
  private rateLimitHits: Counter;
  private telegramMessages: Counter;
  private discordMessages: Counter;
  private whatsappMessages: Counter;

  // ========== MEDIDORES ==========
  private activeConnections: Gauge;
  private activePlatforms: Gauge;
  private queueSize: Gauge;
  private memoryUsage: Gauge;
  private uptime: Gauge;
  private lastHeartbeat: Gauge;
  private errorRate: Gauge;

  // ========== HISTOGRAMAS ==========
  private messageProcessingDuration: Histogram;
  private commandExecutionDuration: Histogram;
  private relayResponseTime: Histogram;

  constructor(config: MetricsConfig = {}) {
    this.metricsPort = config.port || 3001;
    this.metricsPath = config.path || '/metrics';
    this.app = express();
    this.registry = new Registry();

    // Coletar métricas padrão do Node.js
    collectDefaultMetrics({ register: this.registry });

    // ========== INICIALIZAR CONTADORES ==========
    this.commandsExecuted = new Counter({
      name: 'bot_commands_executed_total',
      help: 'Total de comandos executados com sucesso',
      labelNames: ['command', 'platform'],
      registers: [this.registry]
    });

    this.messagesReceived = new Counter({
      name: 'bot_messages_received_total',
      help: 'Total de mensagens recebidas',
      labelNames: ['platform'],
      registers: [this.registry]
    });

    this.messagesSent = new Counter({
      name: 'bot_messages_sent_total',
      help: 'Total de mensagens enviadas',
      labelNames: ['platform'],
      registers: [this.registry]
    });

    this.commandsErrored = new Counter({
      name: 'bot_commands_errored_total',
      help: 'Total de comandos com erro',
      labelNames: ['command', 'error_type', 'platform'],
      registers: [this.registry]
    });

    this.platformConnections = new Counter({
      name: 'bot_platform_connections_total',
      help: 'Total de conexões com plataformas',
      labelNames: ['platform'],
      registers: [this.registry]
    });

    this.platformDisconnections = new Counter({
      name: 'bot_platform_disconnections_total',
      help: 'Total de desconexões de plataformas',
      labelNames: ['platform'],
      registers: [this.registry]
    });

    this.rateLimitHits = new Counter({
      name: 'bot_rate_limit_hits_total',
      help: 'Total de vezes que o rate limit foi atingido',
      registers: [this.registry]
    });

    this.telegramMessages = new Counter({
      name: 'bot_telegram_messages_total',
      help: 'Total de mensagens do Telegram',
      labelNames: ['direction'],
      registers: [this.registry]
    });

    this.discordMessages = new Counter({
      name: 'bot_discord_messages_total',
      help: 'Total de mensagens do Discord',
      labelNames: ['direction'],
      registers: [this.registry]
    });

    this.whatsappMessages = new Counter({
      name: 'bot_whatsapp_messages_total',
      help: 'Total de mensagens do WhatsApp',
      labelNames: ['direction'],
      registers: [this.registry]
    });

    // ========== INICIALIZAR MEDIDORES ==========
    this.activeConnections = new Gauge({
      name: 'bot_active_connections',
      help: 'Número de conexões ativas',
      labelNames: ['platform'],
      registers: [this.registry]
    });

    this.activePlatforms = new Gauge({
      name: 'bot_active_platforms',
      help: 'Número de plataformas ativas',
      registers: [this.registry]
    });

    this.queueSize = new Gauge({
      name: 'bot_queue_size',
      help: 'Tamanho da fila de mensagens',
      registers: [this.registry]
    });

    this.memoryUsage = new Gauge({
      name: 'bot_memory_usage_bytes',
      help: 'Uso de memória em bytes',
      registers: [this.registry]
    });

    this.uptime = new Gauge({
      name: 'bot_uptime_seconds',
      help: 'Uptime do bot em segundos',
      registers: [this.registry]
    });

    this.lastHeartbeat = new Gauge({
      name: 'bot_last_heartbeat_timestamp',
      help: 'Timestamp do último heartbeat',
      registers: [this.registry]
    });

    this.errorRate = new Gauge({
      name: 'bot_error_rate',
      help: 'Taxa de erro do bot (0-1)',
      labelNames: ['platform'],
      registers: [this.registry]
    });

    // ========== INICIALIZAR HISTOGRAMAS ==========
    this.messageProcessingDuration = new Histogram({
      name: 'bot_message_processing_duration_ms',
      help: 'Duração do processamento de mensagens em ms',
      labelNames: ['platform'],
      buckets: [10, 50, 100, 500, 1000, 2000, 5000],
      registers: [this.registry]
    });

    this.commandExecutionDuration = new Histogram({
      name: 'bot_command_execution_duration_ms',
      help: 'Duração da execução de comandos em ms',
      labelNames: ['command'],
      buckets: [10, 50, 100, 500, 1000, 2000, 5000, 10000],
      registers: [this.registry]
    });

    this.relayResponseTime = new Histogram({
      name: 'bot_relay_response_time_ms',
      help: 'Tempo de resposta do relay em ms',
      buckets: [10, 50, 100, 500, 1000, 2000, 5000],
      registers: [this.registry]
    });

    this.setupExpress();
  }

  private setupExpress(): void {
    this.app.get(this.metricsPath, async (req: Request, res: Response) => {
      try {
        const metrics = await this.registry.metrics();
        res.set('Content-Type', this.registry.contentType);
        res.end(metrics);
      } catch (error) {
        logger.error('[Metrics] Erro ao retornar métricas:', error);
        res.status(500).json({ error: 'Failed to collect metrics' });
      }
    });

    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        // P1.4: Healthcheck usa estado real de conexão, não apenas processo vivo.
        const pm = (globalThis as any).__platformManager;
        const memStats = process.memoryUsage();
        const heapLimit = v8.getHeapStatistics().heap_size_limit;
        const heapPercent = (memStats.heapUsed / heapLimit) * 100;
        const wppHealth = getWppHealth();

        // Status por plataforma
        const platformStatuses: Record<string, any> = {};
        if (pm?.getActivePlatforms && pm?.getAdapter) {
          for (const key of pm.getActivePlatforms()) {
            const adapter = pm.getAdapter(key);
            platformStatuses[key] = {
              connected: adapter?.client?.isReady ?? false,
              platform: adapter?.client?.platform ?? key
            };
          }
        }

        const connectedPlatformsCount = Object.values(platformStatuses)
          .filter((status: any) => status.connected).length;
        const health = {
          status: heapPercent >= 90 ? 'degraded' : wppHealth.wpp === 'connected' ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: {
            heapUsed: Math.round(memStats.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memStats.heapTotal / 1024 / 1024),
            heapLimit: Math.round(heapLimit / 1024 / 1024),
            heapPercent: Math.round(heapPercent * 100) / 100,
            rss: Math.round(memStats.rss / 1024 / 1024)
          },
          wpp: wppHealth,
          platforms: platformStatuses,
          activePlatformsCount: connectedPlatformsCount,
          registeredPlatformsCount: Object.keys(platformStatuses).length
        };

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (error: any) {
        logger.error('[Metrics] Erro no healthcheck:', error);
        res.status(500).json({
          status: 'unhealthy',
          error: error?.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  public start(): Promise<void> {
  return new Promise((resolve) => {
    this.server = this.app.listen(this.metricsPort, '127.0.0.1', () => {
      logger.info(`[Metrics] 📊 Servidor de Métricas iniciado em http://127.0.0.1:${this.metricsPort}${this.metricsPath}`);
      resolve();
    });
  });
  }

  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: any) => {
          if (err) reject(err);
          else {
            logger.info('[Metrics] 📊 Servidor de Métricas parado');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  // ========== MÉTODOS DE RASTREAMENTO ==========

  public incrementCommand(command: string, platform: string): void {
    this.commandsExecuted.inc({ command, platform });
  }

  public incrementMessage(platform: string): void {
    this.messagesReceived.inc({ platform });
  }

  public recordMessageSent(platform: string): void {
    this.messagesSent.inc({ platform });
  }

  public recordCommandError(command: string, errorType: string, platform: string): void {
    this.commandsErrored.inc({ command, error_type: errorType, platform });
  }

  public recordPlatformConnection(platform: string): void {
    this.platformConnections.inc({ platform });
    this.activeConnections.inc({ platform });
    this.activePlatforms.inc();
  }

  public recordPlatformDisconnection(platform: string): void {
    this.platformDisconnections.inc({ platform });
    this.activeConnections.dec({ platform });
    this.activePlatforms.dec();
  }

  public incrementRateLimitHit(): void {
    this.rateLimitHits.inc();
  }

  public recordPlatformMessage(
    platform: 'telegram' | 'discord' | 'whatsapp',
    direction: 'sent' | 'received'
  ): void {
    if (platform === 'telegram') {
      this.telegramMessages.inc({ direction });
    } else if (platform === 'discord') {
      this.discordMessages.inc({ direction });
    } else if (platform === 'whatsapp') {
      this.whatsappMessages.inc({ direction });
    }
  }

  public recordMessageProcessingDuration(platform: string, durationMs: number): void {
    this.messageProcessingDuration.observe({ platform }, durationMs);
  }

  public recordCommandExecutionDuration(command: string, durationMs: number): void {
    this.commandExecutionDuration.observe({ command }, durationMs);
  }

  public recordRelayResponseTime(durationMs: number): void {
    this.relayResponseTime.observe(durationMs);
  }

  // ========== P3.2: TELEMETRIA ADICIONAL ==========

  private gcForcedCounter?: Counter<string>;
  private gcBytesFreedGauge?: Gauge<string>;
  private memoryAlertsCounter?: Counter<string>;

  /**
   * Registra uso de memória (chamado pelo memoryMonitor)
   */
  public recordMemoryUsage(heapUsed: number, heapTotal: number, rss: number): void {
    // Já temos memory_usage_bytes, mas vamos adicionar métricas mais granulares
    this.memoryUsage.set(heapUsed);
  }

  /**
   * Registra execução de GC (garbage collection)
   */
  public recordGarbageCollection(bytesFreed: number): void {
    // Contador de GC forçado pelo memoryMonitor
    if (!this.gcForcedCounter) {
      this.gcForcedCounter = new Counter({
        name: 'gc_forced_total',
        help: 'Total de garbage collections forçadas pelo memoryMonitor',
        registers: [this.registry]
      });
    }
    this.gcForcedCounter.inc();

    // Gauge de bytes liberados na última GC
    if (!this.gcBytesFreedGauge) {
      this.gcBytesFreedGauge = new Gauge({
        name: 'gc_bytes_freed',
        help: 'Bytes liberados na última garbage collection',
        registers: [this.registry]
      });
    }
    this.gcBytesFreedGauge.set(bytesFreed);
  }

  /**
   * Registra alerta de memória (85% ou 92%)
   */
  public recordMemoryAlert(level: 'warning' | 'critical'): void {
    if (!this.memoryAlertsCounter) {
      this.memoryAlertsCounter = new Counter({
        name: 'memory_alerts_total',
        help: 'Total de alertas de memória disparados',
        labelNames: ['level'],
        registers: [this.registry]
      });
    }
    this.memoryAlertsCounter.inc({ level });
  }

  public setQueueSize(size: number): void {
    this.queueSize.set(size);
  }

  public setActiveConnections(platform: string, count: number): void {
    this.activeConnections.set({ platform }, count);
  }

  public setActivePlatforms(count: number): void {
    this.activePlatforms.set(count);
  }

  public updateMemoryUsage(): void {
    const usage = process.memoryUsage();
    this.memoryUsage.set(usage.heapUsed);
  }

  public updateUptime(): void {
    this.uptime.set(process.uptime());
  }

  public recordHeartbeat(): void {
    this.lastHeartbeat.set(Date.now() / 1000);
  }

  public setErrorRate(platform: string, rate: number): void {
    this.errorRate.set({ platform }, Math.min(1, Math.max(0, rate)));
  }

  public startSystemMetricsCollection(intervalMs: number = 60000): NodeJS.Timer {
    return setInterval(() => {
      this.updateMemoryUsage();
      this.updateUptime();
      this.recordHeartbeat();
    }, intervalMs);
  }
}

// ========== EXPORTS PARA COMPATIBILIDADE ==========
const metricsService = new MetricsService();

export default metricsService;
export { MetricsService };

// Aliases para compatibilidade com código existente
export async function startMetricsServer() {
  await metricsService.start();
}

export function incrementCommand(command: string, platform: string) {
  metricsService.incrementCommand(command, platform);
}

export function incrementMessage(platform: string) {
  metricsService.incrementMessage(platform);
}

export function incrementRateLimitHit() {
  metricsService.incrementRateLimitHit();
}
