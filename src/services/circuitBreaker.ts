/**
 * 🔌 Circuit Breaker Pattern
 * 
 * Protege o bot contra falhas em cascata ao chamar APIs externas.
 * Estados: CLOSED (normal) → OPEN (falhando) → HALF_OPEN (testando recuperação)
 * 
 * Uso:
 * ```ts
 * const breaker = new CircuitBreaker('telegram-api', { failureThreshold: 5 });
 * const result = await breaker.execute(() => fetch('https://api.telegram.org/...'));
 * ```
 */

import logger from './loggerService';

export enum CircuitState {
  CLOSED = 'CLOSED',       // Normal: requisições passam
  OPEN = 'OPEN',           // Circuito aberto: bloqueia requisições
  HALF_OPEN = 'HALF_OPEN'  // Testando recuperação: permite 1 requisição
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;    // Falhas consecutivas para abrir circuito (default: 5)
  successThreshold?: number;    // Sucessos consecutivos para fechar circuito (default: 2)
  timeout?: number;             // Timeout em ms para considerar falha (default: 10000)
  resetTimeout?: number;        // Tempo em ms para tentar HALF_OPEN após OPEN (default: 60000)
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  nextAttemptTime?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private nextAttemptTime?: number;
  private resetTimer?: NodeJS.Timeout;

  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly timeout: number;
  private readonly resetTimeout: number;

  constructor(name: string, config: CircuitBreakerConfig = {}) {
    this.name = name;
    this.failureThreshold = config.failureThreshold ?? 5;
    this.successThreshold = config.successThreshold ?? 2;
    this.timeout = config.timeout ?? 10000;
    this.resetTimeout = config.resetTimeout ?? 60000;
  }

  /**
   * Executa uma função protegida pelo circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // OPEN: Bloquear requisições até resetTimeout
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < (this.nextAttemptTime || 0)) {
        const error = new Error(`[CircuitBreaker:${this.name}] Circuit OPEN - aguarde ${Math.ceil(((this.nextAttemptTime || 0) - Date.now()) / 1000)}s`);
        logger.warn(`[CircuitBreaker:${this.name}] Requisição bloqueada`, {
          state: this.state,
          nextAttempt: this.nextAttemptTime
        });
        throw error;
      }

      // Transição para HALF_OPEN
      this.state = CircuitState.HALF_OPEN;
      logger.info(`[CircuitBreaker:${this.name}] Transitando para HALF_OPEN (testando recuperação)`);
    }

    // Executar com timeout
    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Executa função com timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Circuit Breaker timeout')), this.timeout)
      )
    ]);
  }

  /**
   * Handler de sucesso
   */
  private onSuccess(): void {
    this.failureCount = 0;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      logger.info(`[CircuitBreaker:${this.name}] Sucesso em HALF_OPEN`, {
        successCount: this.successCount,
        threshold: this.successThreshold
      });

      if (this.successCount >= this.successThreshold) {
        this.close();
      }
    }
  }

  /**
   * Handler de falha
   */
  private onFailure(error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    logger.warn(`[CircuitBreaker:${this.name}] Falha detectada`, {
      error: error?.message,
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      state: this.state
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Voltar para OPEN imediatamente em HALF_OPEN
      this.open();
    } else if (this.failureCount >= this.failureThreshold) {
      this.open();
    }
  }

  /**
   * Abre o circuito (bloqueia requisições)
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.successCount = 0;
    this.nextAttemptTime = Date.now() + this.resetTimeout;

    logger.error(`[CircuitBreaker:${this.name}] 🔴 Circuito ABERTO`, {
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      nextAttempt: new Date(this.nextAttemptTime).toISOString()
    });

    // Agendar tentativa de HALF_OPEN
    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.state = CircuitState.HALF_OPEN;
        logger.info(`[CircuitBreaker:${this.name}] Transitando para HALF_OPEN automaticamente`);
      }
    }, this.resetTimeout);
  }

  /**
   * Fecha o circuito (volta ao normal)
   */
  private close(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;

    logger.info(`[CircuitBreaker:${this.name}] ✅ Circuito FECHADO (recuperado)`, {
      totalRequests: this.totalRequests
    });
  }

  /**
   * Retorna estatísticas do circuit breaker
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureCount,
      successes: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  /**
   * Reseta o circuit breaker (para testes)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }
  }
}

/**
 * Gerenciador global de circuit breakers
 */
class CircuitBreakerManager {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Obtém ou cria um circuit breaker
   */
  get(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  /**
   * Retorna estatísticas de todos os circuit breakers
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reseta todos os circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Singleton
export const circuitBreakerManager = new CircuitBreakerManager();
