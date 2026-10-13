/**
 * CircuitBreaker — comportamento REAL (src/services/circuitBreaker.ts)
 * e sua interação com retryApiCall (src/services/retryWithBackoff.ts).
 *
 * Estes testes FIXAM o comportamento ATUAL. Onde o comportamento é
 * questionável — 400 conta como falha do breaker; 429 é absorvido pelo retry
 * antes de chegar ao breaker — o teste documenta o fato, NÃO corrige.
 *
 * `loggerService` é mockado de propósito: o que importa aqui é o ESTADO do
 * breaker e quantas vezes `fn` foi chamada, não o texto dos logs. (O sujeito
 * do teste é o breaker; o logger é ruído.)
 *
 * A configuração usada é a EXATA de produção — src/services/aiService.ts:55-60.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/loggerService', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
}));

import { CircuitBreaker, CircuitState, circuitBreakerManager } from '../../src/services/circuitBreaker';
import { retryApiCall } from '../../src/services/retryWithBackoff';

const PROD_CONFIG = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 90000,
  resetTimeout: 60000,
};

const fail = () => Promise.reject(new Error('boom'));
const ok = () => Promise.resolve('ok');
const never = () => new Promise<never>(() => {});

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status },
  });
}

/** Resolve `p` enquanto avança o relógio falso, sem deixar rejection solta. */
async function settleWithClock<T>(p: Promise<T>, ms = 30000) {
  const settled = p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
  await vi.advanceTimersByTimeAsync(ms);
  return settled;
}

/** Abre o circuito com N falhas consecutivas. */
async function abrir(b: CircuitBreaker, n = PROD_CONFIG.failureThreshold) {
  for (let i = 0; i < n; i++) {
    await b.execute(fail).catch(() => undefined);
  }
}

describe('CircuitBreaker — máquina de estados (config de produção)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('2 falhas NÃO abrem; a 3ª falha abre o circuito', async () => {
    const b = new CircuitBreaker('t-threshold', PROD_CONFIG);

    await b.execute(fail).catch(() => undefined);
    await b.execute(fail).catch(() => undefined);
    expect(b.getStats().state).toBe(CircuitState.CLOSED);
    expect(b.getStats().failures).toBe(2);

    await b.execute(fail).catch(() => undefined);
    expect(b.getStats().state).toBe(CircuitState.OPEN);
    expect(b.getStats().failures).toBe(3);
    // resetTimeout (60000) aplicado a partir do instante da abertura
    expect((b.getStats().nextAttemptTime as number) - Date.now()).toBe(60000);
  });

  it('durante OPEN: execute() lança "Circuit OPEN" e NÃO chama fn', async () => {
    const b = new CircuitBreaker('t-open-blocks', PROD_CONFIG);
    await abrir(b);
    expect(b.getStats().state).toBe(CircuitState.OPEN);

    const fn = vi.fn(ok);
    await expect(b.execute(fn)).rejects.toThrow(/Circuit OPEN/);
    expect(fn).not.toHaveBeenCalled();
    // a requisição bloqueada ainda entra na contagem de totalRequests
    expect(b.getStats().totalRequests).toBe(4);
  });

  it('timeout de 90s conta como falha — mede a execução INTEIRA de fn', async () => {
    const b = new CircuitBreaker('t-timeout', PROD_CONFIG);

    const settled = await settleWithClock(b.execute(never), 90000);

    expect(settled.ok).toBe(false);
    expect((settled as { error: Error }).error.message).toBe('Circuit Breaker timeout');
    expect(b.getStats().failures).toBe(1);
    expect(b.getStats().state).toBe(CircuitState.CLOSED);
  });

  it('após 60s o circuito vai para HALF_OPEN sozinho (timer agendado por open())', async () => {
    const b = new CircuitBreaker('t-halfopen-timer', PROD_CONFIG);
    await abrir(b);
    expect(b.getStats().state).toBe(CircuitState.OPEN);

    await vi.advanceTimersByTimeAsync(59999);
    expect(b.getStats().state).toBe(CircuitState.OPEN);

    await vi.advanceTimersByTimeAsync(1);
    expect(b.getStats().state).toBe(CircuitState.HALF_OPEN);
  });

  it('em HALF_OPEN: 1 falha reabre imediatamente (não espera 3)', async () => {
    const b = new CircuitBreaker('t-halfopen-fail', PROD_CONFIG);
    await abrir(b);
    await vi.advanceTimersByTimeAsync(60000);
    expect(b.getStats().state).toBe(CircuitState.HALF_OPEN);

    await b.execute(fail).catch(() => undefined);

    expect(b.getStats().state).toBe(CircuitState.OPEN);
    // failures acumula entre ciclos enquanto o circuito está aberto;
    // close() zera na transição HALF_OPEN → CLOSED (circuitBreaker.ts:179).
    // Cosmético — nenhum caminho de decisão lê este valor acumulado.
    expect(b.getStats().failures).toBe(4);
  });

  it('em HALF_OPEN: 2 sucessos consecutivos fecham o circuito', async () => {
    const b = new CircuitBreaker('t-halfopen-close', PROD_CONFIG);
    await abrir(b);
    await vi.advanceTimersByTimeAsync(60000);
    expect(b.getStats().state).toBe(CircuitState.HALF_OPEN);

    await b.execute(ok);
    expect(b.getStats().state).toBe(CircuitState.HALF_OPEN); // 1 de 2

    await b.execute(ok);
    expect(b.getStats().state).toBe(CircuitState.CLOSED);
    expect(b.getStats().failures).toBe(0);
  });

  it('OPEN vencido com o timer pendente: execute() faz a transição para HALF_OPEN', async () => {
    const b = new CircuitBreaker('t-halfopen-manual', PROD_CONFIG);
    await abrir(b);
    expect(b.getStats().state).toBe(CircuitState.OPEN);

    // avança o relógio SEM rodar os timers pendentes
    vi.setSystemTime(Date.now() + 61000);

    await expect(b.execute(ok)).resolves.toBe('ok');
    expect(b.getStats().state).toBe(CircuitState.HALF_OPEN); // 1 sucesso, ainda não fechou
  });
});

describe('CircuitBreaker × retryApiCall — o que o retry absorve antes do breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('1 chamada do breaker com 429 = 4 tentativas HTTP, mas apenas 1 falha do breaker', async () => {
    const b = new CircuitBreaker('t-retry-429', PROD_CONFIG);
    const attempt = vi.fn().mockRejectedValue(httpError(429));

    const settled = await settleWithClock(b.execute(() => retryApiCall(attempt)));

    expect(settled.ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(4); // 1 tentativa + maxRetries(3)
    expect(b.getStats().failures).toBe(1); // o retry absorve as 3 primeiras
    expect(b.getStats().state).toBe(CircuitState.CLOSED);
  });

  it('3 chamadas do breaker com 429 abrem o circuito (12 tentativas HTTP)', async () => {
    const b = new CircuitBreaker('t-retry-429-open', PROD_CONFIG);
    const attempt = vi.fn().mockRejectedValue(httpError(429));

    for (let i = 0; i < 3; i++) {
      await settleWithClock(b.execute(() => retryApiCall(attempt)));
    }

    expect(attempt).toHaveBeenCalledTimes(12);
    expect(b.getStats().state).toBe(CircuitState.OPEN);
  });

  it('400 NÃO é retentado, mas CONTA como falha do breaker', async () => {
    const b = new CircuitBreaker('t-retry-400', PROD_CONFIG);
    const attempt = vi.fn().mockRejectedValue(httpError(400));

    await settleWithClock(b.execute(() => retryApiCall(attempt)));
    expect(attempt).toHaveBeenCalledTimes(1); // 400 não está na lista de retryable
    expect(b.getStats().failures).toBe(1); // ...mas o breaker conta assim mesmo

    // consequência: 3 prompts malformados abrem o circuito e bloqueiam
    // chamadas legítimas por 60s
    for (let i = 0; i < 2; i++) {
      await settleWithClock(b.execute(() => retryApiCall(attempt)));
    }
    expect(b.getStats().state).toBe(CircuitState.OPEN);
  });

  it('erro de rede (ECONNRESET) é retentado igual ao 429', async () => {
    const b = new CircuitBreaker('t-retry-econnreset', PROD_CONFIG);
    const attempt = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));

    await settleWithClock(b.execute(() => retryApiCall(attempt)));

    expect(attempt).toHaveBeenCalledTimes(4);
    expect(b.getStats().failures).toBe(1);
  });
});

describe('circuitBreakerManager — singleton por nome', () => {
  afterEach(() => {
    circuitBreakerManager.resetAll();
  });

  it('get() devolve a MESMA instância para o mesmo nome', () => {
    const a = circuitBreakerManager.get('t-singleton', PROD_CONFIG);
    const b = circuitBreakerManager.get('t-singleton', PROD_CONFIG);
    expect(a).toBe(b);
  });

  it('a config só vale na PRIMEIRA criação — get() posterior ignora config nova', async () => {
    const a = circuitBreakerManager.get('t-singleton-cfg', PROD_CONFIG);
    const b = circuitBreakerManager.get('t-singleton-cfg', { failureThreshold: 99 });
    expect(b).toBe(a);

    // prova comportamental: ainda abre em 3 falhas, não em 99
    for (let i = 0; i < 3; i++) {
      await a.execute(fail).catch(() => undefined);
    }
    expect(a.getStats().state).toBe(CircuitState.OPEN);
  });
});
