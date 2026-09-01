/**
 * 🧠 Memory Monitor - Monitoramento e Gerenciamento de Memória
 * 
 * Monitora uso de heap e força GC quando necessário para evitar OOM.
 * Emite alertas e métricas para Prometheus.
 */

import logger from './loggerService';
import metricsService from './metricsService';

interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  heapUsedPercent: number;
  rss: number;
  external: number;
}

export class MemoryMonitor {
  private alertThreshold = 85; // % heap usage para alertar
  private criticalThreshold = 92; // % heap usage crítico
  private gcThreshold = 88; // % heap usage para forçar GC
  private lastAlertTime = 0;
  private alertCooldown = 300000; // 5 min entre alertas
  private monitorInterval: NodeJS.Timeout | null = null;
  private isGcExposed = typeof global.gc === 'function';

  constructor() {
    if (!this.isGcExposed) {
      logger.warn('[MemoryMonitor] GC não exposto. Rode com --expose-gc para habilitar GC forçado.');
    }
  }

  /**
   * Inicia o monitoramento contínuo de memória
   */
  start(intervalMs: number = 60000): void {
    if (this.monitorInterval) {
      logger.warn('[MemoryMonitor] Já está rodando');
      return;
    }

    logger.info(`[MemoryMonitor] ✅ Iniciado (check a cada ${intervalMs / 1000}s)`);

    this.monitorInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);

    // Check imediato
    this.checkMemory();
  }

  /**
   * Para o monitoramento
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      logger.info('[MemoryMonitor] Parado');
    }
  }

  /**
   * Coleta estatísticas de memória
   */
  getStats(): MemoryStats {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      heapUsedPercent: (usage.heapUsed / usage.heapTotal) * 100,
      rss: usage.rss,
      external: usage.external,
    };
  }

  /**
   * Verifica memória e toma ações se necessário
   */
  private checkMemory(): void {
    const stats = this.getStats();
    const { heapUsedPercent, heapUsed, heapTotal, rss } = stats;

    // Exportar métricas para Prometheus
    try {
      metricsService.recordMemoryUsage(heapUsed, heapTotal, rss);
    } catch (err) {
      // Ignorar erro de métrica
    }

    // Log silencioso (só em debug mode)
    if (process.env.DEBUG_MEMORY === '1') {
      logger.debug('[MemoryMonitor] Check', {
        heapUsedMB: (heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (heapTotal / 1024 / 1024).toFixed(2),
        heapUsedPercent: heapUsedPercent.toFixed(2),
        rssMB: (rss / 1024 / 1024).toFixed(2),
      });
    }

    // CRÍTICO: > 92%
    if (heapUsedPercent >= this.criticalThreshold) {
      this.handleCriticalMemory(stats);
      return;
    }

    // FORÇAR GC: > 88%
    if (heapUsedPercent >= this.gcThreshold) {
      this.forceGarbageCollection(stats);
      return;
    }

    // ALERTA: > 85%
    if (heapUsedPercent >= this.alertThreshold) {
      this.emitAlert(stats, 'warning');
    }
  }

  /**
   * Força garbage collection (se --expose-gc)
   */
  private forceGarbageCollection(stats: MemoryStats): void {
    if (!this.isGcExposed) return;

    const before = stats.heapUsed;
    
    try {
      global.gc!();
      
      const after = process.memoryUsage().heapUsed;
      const freed = before - after;
      const freedMB = (freed / 1024 / 1024).toFixed(2);

      logger.info(`[MemoryMonitor] 🧹 GC forçado: liberou ${freedMB} MB`, {
        heapBeforeMB: (before / 1024 / 1024).toFixed(2),
        heapAfterMB: (after / 1024 / 1024).toFixed(2),
        freedMB,
      });

      metricsService.recordGarbageCollection(freed);
    } catch (err: any) {
      logger.error('[MemoryMonitor] Erro ao forçar GC:', err?.message);
    }
  }

  /**
   * Emite alerta de memória alta
   */
  private emitAlert(stats: MemoryStats, level: 'warning' | 'critical'): void {
    const now = Date.now();
    
    // Cooldown entre alertas
    if (now - this.lastAlertTime < this.alertCooldown) {
      return;
    }

    this.lastAlertTime = now;

    const message = `${level === 'critical' ? '🚨' : '⚠️'} Heap ${level === 'critical' ? 'CRÍTICO' : 'ALTO'}: ${stats.heapUsedPercent.toFixed(2)}%`;
    
    if (level === 'critical') {
      logger.error(message, {
        heapUsedMB: (stats.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (stats.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: (stats.rss / 1024 / 1024).toFixed(2),
      });
    } else {
      logger.warn(message, {
        heapUsedMB: (stats.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (stats.heapTotal / 1024 / 1024).toFixed(2),
      });
    }

    metricsService.recordMemoryAlert(level);
  }

  /**
   * Trata memória crítica (> 92%)
   */
  private handleCriticalMemory(stats: MemoryStats): void {
    this.emitAlert(stats, 'critical');
    
    // Forçar GC primeiro
    if (this.isGcExposed) {
      this.forceGarbageCollection(stats);
      
      // Re-check após GC
      const afterGC = this.getStats();
      if (afterGC.heapUsedPercent >= this.criticalThreshold) {
        logger.error('[MemoryMonitor] 💀 Heap continua crítico após GC. Considere restart.');
      }
    } else {
      logger.error('[MemoryMonitor] 💀 Heap crítico mas GC não disponível. Restart recomendado.');
    }
  }

  /**
   * Retorna snapshot de memória para debug
   */
  getSnapshot(): {
    stats: MemoryStats;
    isHealthy: boolean;
    needsGC: boolean;
    isCritical: boolean;
  } {
    const stats = this.getStats();
    return {
      stats,
      isHealthy: stats.heapUsedPercent < this.alertThreshold,
      needsGC: stats.heapUsedPercent >= this.gcThreshold,
      isCritical: stats.heapUsedPercent >= this.criticalThreshold,
    };
  }
}

// Singleton
export const memoryMonitor = new MemoryMonitor();
