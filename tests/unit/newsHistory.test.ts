import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Schema + accessors de `news_history` (INC-006 — dedup de notícias).
 *
 * Mesmo padrão do groupNews.test.ts: driver `sqlite` mockado com um
 * mini-DB em memória — nada toca em banco real. `getDb()` é singleton,
 * então `vi.resetModules()` antes de cada teste garante que o
 * `initDatabase()` rode de novo e o CREATE TABLE seja exercitado.
 */

const state = vi.hoisted(() => ({
  hist: [] as Array<{ id: number; title: string; sent_at: string }>,
  execCalls: [] as string[],
}));

vi.mock('sqlite', () => ({
  open: vi.fn(async () => ({
    exec: vi.fn(async (sql: string) => {
      state.execCalls.push(String(sql));
    }),
    run: vi.fn(async (sql: string, params: any[] = []) => {
      const s = String(sql);
      if (/INSERT INTO news_history/i.test(s)) {
        state.hist.push({
          id: state.hist.length + 1,
          title: String(params[0]),
          sent_at: String(params[1]),
        });
        return { changes: 1 };
      }
      if (/DELETE FROM news_history/i.test(s)) {
        // sent_at <= corte é apagado (string local "YYYY-MM-DDTHH:MM:SS")
        const corte = String(params[0]);
        const antes = state.hist.length;
        state.hist = state.hist.filter((r) => r.sent_at > corte);
        return { changes: antes - state.hist.length };
      }
      // Demais writes do boot (group_news etc.) são no-op aqui.
      return { changes: 0 };
    }),
    get: vi.fn(async () => undefined),
    all: vi.fn(async (sql: string, params: any[] = []) => {
      const s = String(sql);
      if (/FROM news_history/i.test(s) && /ORDER BY sent_at DESC/i.test(s)) {
        const n = Number(params[0]) || 0;
        return [...state.hist]
          .sort((a, b) =>
            a.sent_at === b.sent_at ? b.id - a.id : a.sent_at < b.sent_at ? 1 : -1
          )
          .slice(0, n)
          .map((r) => ({ title: r.title }));
      }
      return [];
    }),
    close: vi.fn(async () => undefined),
  })),
  Database: class {},
}));

vi.mock('../../src/services/loggerService', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logWarning: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  state.hist.length = 0;
  state.execCalls.length = 0;
});

describe('news_history — schema (INC-006)', () => {
  it('cria a tabela e o índice no boot', async () => {
    const { getDb } = await import('../../src/services/databaseService');
    await getDb();

    const ddl = state.execCalls.join('\n');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS news_history');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_news_history_sent');
  });
});

describe('news_history — recordNewsTitles + getRecentNewsTitles', () => {
  it('grava e devolve DESC por sent_at (mais recentes primeiro)', async () => {
    const { recordNewsTitles, getRecentNewsTitles } = await import(
      '../../src/services/databaseService'
    );

    await recordNewsTitles(['A', 'B'], '2026-10-18T20:00:00');
    await recordNewsTitles(['C'], '2026-10-18T21:00:00');

    // sent_at DESC; desempate id DESC → dentro do mesmo envio, o último
    // inserido vem primeiro (B antes de A) — igual ao SQL real.
    expect(await getRecentNewsTitles(10)).toEqual(['C', 'B', 'A']);
  });

  it('Set dedup intra-envio — título repetido/vazio/espacado grava 1x limpo', async () => {
    const { recordNewsTitles, getRecentNewsTitles } = await import(
      '../../src/services/databaseService'
    );

    await recordNewsTitles(['A', 'A', ' B ', ''], '2026-10-18T20:00:00');

    // mesmo sent_at → desempate id DESC: B (2º inserido) antes de A
    expect(await getRecentNewsTitles(10)).toEqual(['B', 'A']);
  });

  it('limit pega os N mais recentes (desempate por id DESC)', async () => {
    const { recordNewsTitles, getRecentNewsTitles } = await import(
      '../../src/services/databaseService'
    );

    await recordNewsTitles(['A', 'B'], '2026-10-18T20:00:00');
    await recordNewsTitles(['C', 'D'], '2026-10-18T21:00:00');

    // t21 primeiro; dentro do mesmo sent_at, id DESC → D antes de C
    expect(await getRecentNewsTitles(2)).toEqual(['D', 'C']);
  });

  it('array vazio → nenhum INSERT', async () => {
    const { recordNewsTitles } = await import('../../src/services/databaseService');
    await recordNewsTitles([], '2026-10-18T20:00:00');
    expect(state.hist).toHaveLength(0);
  });
});

describe('news_history — cleanupOldNewsHistory', () => {
  it('apaga só o que está antes do corte e devolve o count', async () => {
    const { recordNewsTitles, cleanupOldNewsHistory, getRecentNewsTitles } = await import(
      '../../src/services/databaseService'
    );

    await recordNewsTitles(['Antiga 1'], '2026-10-01T00:00:00');
    await recordNewsTitles(['Antiga 2'], '2026-10-10T23:59:59');
    await recordNewsTitles(['Nova'], '2026-10-12T00:00:01');

    const apagadas = await cleanupOldNewsHistory(7, '2026-10-11T00:00:00');

    expect(apagadas).toBe(2);
    expect(await getRecentNewsTitles(10)).toEqual(['Nova']);
  });

  it('nada além do corte → 0 apagadas, tabela intacta', async () => {
    const { recordNewsTitles, cleanupOldNewsHistory, getRecentNewsTitles } = await import(
      '../../src/services/databaseService'
    );

    await recordNewsTitles(['Recente'], '2026-10-17T00:00:00');

    expect(await cleanupOldNewsHistory(7, '2026-10-11T00:00:00')).toBe(0);
    expect(await getRecentNewsTitles(10)).toEqual(['Recente']);
  });
});
