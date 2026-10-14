import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cache negativo de group_mod. Driver `sqlite` mockado: nada toca em banco real.
 * `vi.resetModules()` a cada teste garante um Map de cache limpo, e os mocks
 * vêm de `vi.hoisted` para sobreviverem ao reset.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(async (_sql?: unknown) => undefined as any),
  run: vi.fn(async () => undefined),
  exec: vi.fn(async () => undefined),
  all: vi.fn(async () => [] as any[]),
  close: vi.fn(async () => undefined),
}));

vi.mock('sqlite', () => ({
  open: vi.fn(async () => ({
    exec: mocks.exec,
    run: mocks.run,
    get: mocks.get,
    all: mocks.all,
    close: mocks.close,
  })),
  Database: class {},
}));

// Grupo sem linha em group_mod — o caso quente (evaluate() "nada ligado").
const GID = '120363419241913965@g.us';

beforeEach(() => {
  vi.resetModules();
  mocks.get.mockClear();
  mocks.run.mockClear();
  mocks.exec.mockClear();
});

describe('cache negativo de group_mod', () => {
  it('primeira consulta vai ao banco; a segunda não', async () => {
    const { getGroupMod } = await import('../../src/services/databaseService');

    await getGroupMod(GID);
    const firstHits = mocks.get.mock.calls.length;
    expect(firstHits).toBeGreaterThan(0);

    mocks.get.mockClear();
    const result = await getGroupMod(GID);

    expect(result).toEqual({}); // continua "nada ligado"
    expect(mocks.get.mock.calls.length).toBe(0);
  });

  it('ensureGroupModRow invalida o cache negativo', async () => {
    const { getGroupMod, ensureGroupModRow } = await import('../../src/services/databaseService');

    await getGroupMod(GID); // popula o negativo
    mocks.get.mockClear();

    await ensureGroupModRow(GID); // INSERT -> invalida

    mocks.get.mockClear();
    await getGroupMod(GID); // deve voltar ao banco
    expect(mocks.get.mock.calls.length).toBeGreaterThan(0);
  });

  it('invalidateGroupModCache() força nova consulta', async () => {
    const { getGroupMod, invalidateGroupModCache } = await import('../../src/services/databaseService');

    await getGroupMod(GID);
    mocks.get.mockClear();

    invalidateGroupModCache();
    await getGroupMod(GID);

    expect(mocks.get.mock.calls.length).toBeGreaterThan(0);
  });

  it('o cache expira após o TTL de 30s', async () => {
    const { getGroupMod } = await import('../../src/services/databaseService');

    await getGroupMod(GID);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(31_000);
      mocks.get.mockClear();
      await getGroupMod(GID);
      expect(mocks.get.mock.calls.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('grupos diferentes têm entradas independentes', async () => {
    const { getGroupMod } = await import('../../src/services/databaseService');

    await getGroupMod(GID);
    mocks.get.mockClear();

    await getGroupMod('120363420338153750@g.us');

    expect(mocks.get.mock.calls.length).toBeGreaterThan(0);
  });
});
