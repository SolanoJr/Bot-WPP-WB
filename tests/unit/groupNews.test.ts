import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Schema + accessors de `group_news`.
 *
 * O driver `sqlite` é mockado com um mini-DB em memória: nada toca em banco
 * real. `getDb()` é singleton, então `vi.resetModules()` antes de cada teste
 * garante que o `initDatabase()` rode de novo e o CREATE TABLE seja exercitado.
 */

const state = vi.hoisted(() => ({
  rows: new Map<string, any>(),
  execCalls: [] as string[],
}));

vi.mock('sqlite', () => ({
  open: vi.fn(async () => ({
    exec: vi.fn(async (sql: string) => {
      state.execCalls.push(String(sql));
    }),
    run: vi.fn(async (sql: string, params: any[] = []) => {
      const s = String(sql);

      if (/INSERT OR IGNORE INTO group_news/i.test(s)) {
        const id = String(params[0]);
        if (!state.rows.has(id)) {
          state.rows.set(id, {
            group_id: id,
            enabled: 0,
            schedule_time: '08:00',
            topic: '',
            item_count: 5,
            last_sent_at: null,
          });
        }
        return;
      }

      if (/UPDATE group_news SET/i.test(s)) {
        const id = String(params[params.length - 1]);
        const row = state.rows.get(id);
        if (!row) return;
        const setClause = s.replace(/^[\s\S]*?SET\s+/i, '').replace(/\s+WHERE[\s\S]*$/i, '');
        const cols = setClause.split(',').map((c) => c.trim().split(/\s*=\s*/)[0]);
        cols.forEach((col, i) => { row[col] = params[i]; });
        return;
      }
      // Demais writes do boot (retenção de command_usage_events etc.) são no-op.
    }),
    get: vi.fn(async (sql: string, params: any[] = []) => {
      const s = String(sql);
      if (/FROM group_news/i.test(s) && /group_id\s*=\s*\?/i.test(s)) {
        return state.rows.get(String(params[0]));
      }
      return undefined; // ex.: guard do DDL de group_mod
    }),
    all: vi.fn(async (sql: string) => {
      const s = String(sql);
      if (/FROM group_news/i.test(s) && /enabled\s*=\s*1/i.test(s)) {
        return [...state.rows.values()].filter((r) => r.enabled === 1);
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
  state.rows.clear();
  state.execCalls.length = 0;
});

const GROUP = 'wpp:120363410094452673@g.us';

describe('group_news — schema', () => {
  it('cria a tabela e o índice no boot', async () => {
    const { getDb } = await import('../../src/services/databaseService');
    await getDb();

    const ddl = state.execCalls.join('\n');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS group_news');
    expect(ddl).toContain('CREATE INDEX IF NOT EXISTS idx_group_news_enabled');
  });
});

describe('group_news — accessors', () => {
  it('upsert + get retorna os valores corretos', async () => {
    const { upsertGroupNews, getGroupNews } = await import('../../src/services/databaseService');

    await upsertGroupNews(GROUP, {
      enabled: true, scheduleTime: '09:30', topic: 'mundo geek', itemCount: 3,
    });
    const cfg = await getGroupNews(GROUP);

    expect(cfg).toEqual({
      enabled: true,
      scheduleTime: '09:30',
      topic: 'mundo geek',
      itemCount: 3,
      lastSentAt: null,
    });
  });

  it('get retorna null para grupo nunca configurado', async () => {
    const { getGroupNews } = await import('../../src/services/databaseService');
    expect(await getGroupNews('wpp:nunca-visto@g.us')).toBeNull();
  });

  it('patch parcial não sobrescreve campos ausentes', async () => {
    const { upsertGroupNews, getGroupNews } = await import('../../src/services/databaseService');

    await upsertGroupNews(GROUP, {
      enabled: true, scheduleTime: '07:15', topic: 'tecnologia', itemCount: 8,
    });
    await upsertGroupNews(GROUP, { enabled: false }); // só desliga

    const cfg = await getGroupNews(GROUP);
    expect(cfg).toEqual({
      enabled: false,
      scheduleTime: '07:15',
      topic: 'tecnologia',
      itemCount: 8,
      lastSentAt: null,
    });
  });

  it('markNewsSent atualiza last_sent_at', async () => {
    const { upsertGroupNews, markNewsSent, getGroupNews } = await import('../../src/services/databaseService');

    await upsertGroupNews(GROUP, { enabled: true });
    await markNewsSent(GROUP, '2026-10-16T08:00:00');

    const cfg = await getGroupNews(GROUP);
    expect(cfg?.lastSentAt).toBe('2026-10-16T08:00:00');
  });

  it('listEnabledNewsGroups retorna só os enabled=1', async () => {
    const { upsertGroupNews, listEnabledNewsGroups } = await import('../../src/services/databaseService');

    await upsertGroupNews('wpp:ativo1@g.us', { enabled: true, scheduleTime: '08:00', topic: 'a', itemCount: 5 });
    await upsertGroupNews('wpp:ativo2@g.us', { enabled: true, scheduleTime: '09:00', topic: 'b', itemCount: 2 });
    await upsertGroupNews('wpp:inativo@g.us', { enabled: false });

    const list = await listEnabledNewsGroups();
    expect(list.map((g) => g.groupId).sort()).toEqual(['wpp:ativo1@g.us', 'wpp:ativo2@g.us']);
    expect(list.find((g) => g.groupId === 'wpp:ativo1@g.us')).toEqual({
      groupId: 'wpp:ativo1@g.us',
      scheduleTime: '08:00',
      topic: 'a',
      itemCount: 5,
      lastSentAt: null,
    });
  });

  it('upsert sem patch garante a linha com defaults do schema', async () => {
    const { upsertGroupNews, getGroupNews } = await import('../../src/services/databaseService');

    await upsertGroupNews(GROUP, {});
    const cfg = await getGroupNews(GROUP);

    expect(cfg).toEqual({
      enabled: false,
      scheduleTime: '08:00',
      topic: '',
      itemCount: 5,
      lastSentAt: null,
    });
  });
});
