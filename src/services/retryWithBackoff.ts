/**
 * 🔄 Retry with Exponential Backoff
 * 
 * Reexecuta operações falhadas com delays crescentes exponencialmente.
 * Útil para APIs instáveis, rate limiting, timeouts temporários.
 * 
 * Uso:
 * ```ts
 * const result = await retryWithBackoff(
 *   () => fetch('https://api.example.com'),
 *   { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }
 * );
 * ```
 */

import logger from './loggerService';

export interface RetryConfig {
  maxRetries?: number;        // Máximo de tentativas (default: 3)
  baseDelay?: number;         // Delay inicial em ms (default: 1000)
  maxDelay?: number;          // Delay máximo em ms (default: 30000)
  factor?: number;            // Fator de crescimento exponencial (default: 2)
  jitter?: boolean;           // Adicionar jitter (aleatoriedade) ao delay (default: true)
  retryableErrors?: string[]; // Lista de códigos/mensagens de erro retryable (default: todas)
  onRetry?: (attempt: number, error: any, nextDelay: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: any;
  attempts: number;
  totalDelay: number;
}

/**
 * Executa uma função com retry exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    factor = 2,
    jitter = true,
    retryableErrors = [],
    onRetry
  } = config;

  let lastError: any;
  let totalDelay = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 0) {
        logger.info('[Retry] Operação bem-sucedida após retry', {
          attempt,
          totalDelay: `${totalDelay}ms`
        });
      }
      
      return result;
    } catch (error: any) {
      lastError = error;

      // Última tentativa: não fazer retry
      if (attempt === maxRetries) {
        logger.error('[Retry] Todas as tentativas falharam', {
          attempts: attempt + 1,
          totalDelay: `${totalDelay}ms`,
          error: error?.message
        });
        throw error;
      }

      // Verificar se erro é retryable
      if (retryableErrors.length > 0 && !isRetryableError(error, retryableErrors)) {
        logger.warn('[Retry] Erro não-retryable, abortando', {
          error: error?.message,
          code: error?.code
        });
        throw error;
      }

      // Calcular delay com backoff exponencial
      const delay = calculateDelay(attempt, baseDelay, maxDelay, factor, jitter);
      totalDelay += delay;

      logger.warn('[Retry] Tentativa falhou, aguardando antes de retry', {
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        nextDelay: `${delay}ms`,
        error: error?.message,
        code: error?.code
      });

      // Callback customizado
      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }

      // Aguardar antes do próximo retry
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Calcula o delay com backoff exponencial
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  factor: number,
  jitter: boolean
): number {
  // Backoff exponencial: baseDelay * (factor ^ attempt)
  let delay = Math.min(baseDelay * Math.pow(factor, attempt), maxDelay);

  // Jitter: adiciona aleatoriedade (±25%)
  if (jitter) {
    const jitterRange = delay * 0.25;
    delay += (Math.random() * 2 - 1) * jitterRange;
    delay = Math.max(delay, baseDelay); // Não pode ser menor que baseDelay
  }

  return Math.floor(delay);
}

/**
 * Verifica se um erro é retryable
 */
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  const errorMsg = String(error?.message || '').toLowerCase();
  const errorCode = String(error?.code || '').toLowerCase();

  return retryableErrors.some(pattern => {
    const p = pattern.toLowerCase();
    return errorMsg.includes(p) || errorCode.includes(p);
  });
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry com config padrão para APIs externas (rate limiting, network errors)
 */
export async function retryApiCall<T>(fn: () => Promise<T>): Promise<T> {
  return retryWithBackoff(fn, {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    factor: 2,
    jitter: true,
    retryableErrors: [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNREFUSED',
      'rate limit',
      'too many requests',
      '429',
      '503',
      '502',
      '504'
    ]
  });
}

/**
 * Retry com config padrão para operações de banco de dados
 */
export async function retryDbOperation<T>(fn: () => Promise<T>): Promise<T> {
  return retryWithBackoff(fn, {
    maxRetries: 5,
    baseDelay: 100,
    maxDelay: 2000,
    factor: 2,
    jitter: true,
    retryableErrors: [
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
      'database is locked'
    ]
  });
}

/**
 * Classe helper para retry declarativo
 */
export class RetryableOperation<T> {
  private fn: () => Promise<T>;
  private config: RetryConfig;

  constructor(fn: () => Promise<T>, config: RetryConfig = {}) {
    this.fn = fn;
    this.config = config;
  }

  /**
   * Executa a operação com retry
   */
  async execute(): Promise<T> {
    return retryWithBackoff(this.fn, this.config);
  }

  /**
   * Executa a operação e retorna resultado detalhado
   */
  async executeWithDetails(): Promise<RetryResult<T>> {
    let attempts = 0;
    let totalDelay = 0;
    const startTime = Date.now();

    try {
      const result = await retryWithBackoff(this.fn, {
        ...this.config,
        onRetry: (attempt, error, delay) => {
          attempts = attempt;
          totalDelay += delay;
          this.config.onRetry?.(attempt, error, delay);
        }
      });

      return {
        success: true,
        result,
        attempts: attempts + 1,
        totalDelay: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error,
        attempts: attempts + 1,
        totalDelay: Date.now() - startTime
      };
    }
  }
}
