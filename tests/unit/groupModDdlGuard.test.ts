import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guard do DDL de group_mod. O `sqlite` é mockado: nada toca em banco real.
 * `getDb()` é singleton, então `vi.resetModules()` antes de cada teste garante
 * que o initDatabase() rode de novo e o guard seja exercitado.
 */

const LEGACY_DDL = `CREATE TABLE group_mod (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL UNIQUE,
  antispam BOOLEAN DEFAULT 1,
  antiestrangeiro BOOLEAN DEFAULT 1,
  autolink BOOLEAN DEFAULT 1,
  remover BOOLEAN DEFAULT 1
)`;

const NEW_DDL = `CREATE TABLE group_mod (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL UNIQUE,
  antispam BOOLEAN DEFAULT 0,
  antiestrangeiro BOOLEAN DEFAULT 0,
  autolink BOOLEAN DEFAULT 0,
  remover BOOLEAN DEFAULT 0
)`;

const state = vi.hoisted(() => ({ groupModSql: null as string | null }));
const loggerSpy = vi.hoisted(() => ({ logWarning: vi.fn() }));

vi.mock('sqlite', () => ({
  open: vi.fn(async () => ({
    exec: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes("name='group_mod'")) {
        return state.groupModSql ? { sql: state.groupModSql } : undefined;
      }
      return undefined;
    }),
    all: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Database: class {},
}));

vi.mock('../../src/services/loggerService', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logWarning: loggerSpy.logWarning,
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

const GUARD_MSG = 'DEFAULT 1 legado no DDL';

beforeEach(() => {
  vi.resetModules();
  loggerSpy.logWarning.mockClear();
});

describe('guard do DDL de group_mod', () => {
  it('dispara o warning quando o DDL tem DEFAULT 1 legado', async () => {
    state.groupModSql = LEGACY_DDL;

    const { getDb } = await import('../../src/services/databaseService');
    await getDb();

    expect(loggerSpy.logWarning).toHaveBeenCalledWith(expect.stringContaining(GUARD_MSG));
  });

  it('não dispara quando o DDL já tem DEFAULT 0', async () => {
    state.groupModSql = NEW_DDL;

    const { getDb } = await import('../../src/services/databaseService');
    await getDb();

    expect(loggerSpy.logWarning).not.toHaveBeenCalledWith(expect.stringContaining(GUARD_MSG));
  });

  it('não dispara nem quebra quando a tabela não existe', async () => {
    state.groupModSql = null;

    const { getDb } = await import('../../src/services/databaseService');

    await expect(getDb()).resolves.toBeDefined();
    expect(loggerSpy.logWarning).not.toHaveBeenCalledWith(expect.stringContaining(GUARD_MSG));
  });
});
