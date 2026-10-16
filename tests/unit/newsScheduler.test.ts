import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * newsScheduler — kill switch, janela de envio, retry e sobreposição.
 *
 * O scheduler tem estado de módulo único (`timer` + flag `running`), então cada
 * teste usa `vi.resetModules()` + re-import para começar do zero.
 *
 * O mock de `listEnabledNewsGroups` segue o shape REAL do accessor
 * (databaseService.ts:1165) — camelCase, sem a coluna `enabled`.
 */

const mocks = vi.hoisted(() => ({
  listEnabledNewsGroups: vi.fn(async () => [] as any[]),
  markNewsSent: vi.fn(async () => undefined),
  sendNewsToGroup: vi.fn(async () => undefined),
  localStamp: vi.fn(() => '2026-10-16T08:00:00'),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}));

vi.mock('../../src/services/databaseService', () => ({
  listEnabledNewsGroups: mocks.listEnabledNewsGroups,
  markNewsSent: mocks.markNewsSent,
}));

vi.mock('../../src/services/newsService', () => ({
  sendNewsToGroup: mocks.sendNewsToGroup,
  localStamp: mocks.localStamp,
  fetchNews: vi.fn(async () => 'corpo'),
  formatNewsMessage: vi.fn(() => 'formatado'),
  resolveAdapterKey: vi.fn(() => 'whatsapp:558581344211'),
}));

vi.mock('../../src/services/loggerService', () => ({
  logInfo: mocks.logInfo,
  logWarning: mocks.logWarning,
}));

/** Shape retornado por `listEnabledNewsGroups()` (databaseService.ts:1165). */
interface Row {
  groupId: string;
  scheduleTime: string;
  topic: string;
  itemCount: number;
  lastSentAt: string | null;
}

const GROUP_A = 'wpp:1111111111111111111@g.us';
const GROUP_B = 'wpp:2222222222222222222@g.us';

function row(over: Partial<Row> = {}): Row {
  return {
    groupId: GROUP_A,
    scheduleTime: '08:00',
    topic: '',
    itemCount: 5,
    lastSentAt: null,
    ...over,
  };
}

async function load() {
  return import('../../src/services/newsScheduler');
}

function setEnv(v: string | undefined): void {
  if (v === undefined) delete process.env.WPP_NEWS_ENABLED;
  else process.env.WPP_NEWS_ENABLED = v;
}

const NOW_D = new Date('2026-10-16T08:00:00');

beforeEach(() => {
  vi.resetModules();
  setEnv(undefined);
  mocks.listEnabledNewsGroups.mockReset().mockResolvedValue([]);
  mocks.markNewsSent.mockReset().mockResolvedValue(undefined);
  mocks.sendNewsToGroup.mockReset().mockResolvedValue(undefined);
  mocks.localStamp.mockReset().mockReturnValue('2026-10-16T08:00:00');
  mocks.logInfo.mockReset();
  mocks.logWarning.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('newsScheduler — kill switch', () => {
  it('WPP_NEWS_ENABLED=false → no-op e não consulta o banco', async () => {
    setEnv('false');
    const mod = await load();
    const stats = await mod.tick(NOW_D);

    expect(stats).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 });
    expect(mocks.listEnabledNewsGroups).not.toHaveBeenCalled();
    expect(mocks.sendNewsToGroup).not.toHaveBeenCalled();
  });
});

describe('newsScheduler — varredura', () => {
  it('sem grupos enabled → checked 0', async () => {
    const mod = await load();
    const stats = await mod.tick(NOW_D);
    expect(stats).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it('agora antes do horário → skipped, sem envio', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([row()]);
    const stats = await mod.tick(new Date('2026-10-16T07:59:00'));

    expect(stats.skipped).toBe(1);
    expect(mocks.sendNewsToGroup).not.toHaveBeenCalled();
  });

  it('agora == horário → envia', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([row()]);
    const stats = await mod.tick(NOW_D);

    expect(stats.sent).toBe(1);
    expect(mocks.sendNewsToGroup).toHaveBeenCalledWith(GROUP_A, '', 5);
    expect(mocks.markNewsSent).toHaveBeenCalledWith(GROUP_A, '2026-10-16T08:00:00');
  });

  it('agora depois do horário → envia', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([row()]);
    const stats = await mod.tick(new Date('2026-10-16T08:01:00'));

    expect(stats.sent).toBe(1);
  });

  it('lastSentAt = hoje → skipped', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([
      row({ lastSentAt: '2026-10-16T07:00:00' }),
    ]);
    const stats = await mod.tick(NOW_D);

    expect(stats.skipped).toBe(1);
    expect(mocks.sendNewsToGroup).not.toHaveBeenCalled();
  });

  it('lastSentAt = ontem → envia (novo dia)', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([
      row({ lastSentAt: '2026-10-15T08:00:00' }),
    ]);
    const stats = await mod.tick(NOW_D);

    expect(stats.sent).toBe(1);
  });

  it('falha no envio → failed e NÃO marca last_sent_at', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([row()]);
    mocks.sendNewsToGroup.mockRejectedValueOnce(new Error('IA fora'));
    const stats = await mod.tick(NOW_D);

    expect(stats.failed).toBe(1);
    expect(mocks.markNewsSent).not.toHaveBeenCalled();
  });

  it('falha → próximo tick tenta de novo', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([row()]);
    mocks.sendNewsToGroup.mockRejectedValueOnce(new Error('IA fora'));

    const s1 = await mod.tick(NOW_D);
    expect(s1.failed).toBe(1);
    expect(mocks.markNewsSent).not.toHaveBeenCalled();

    const s2 = await mod.tick(new Date('2026-10-16T08:01:00'));
    expect(s2.sent).toBe(1);
    expect(mocks.markNewsSent).toHaveBeenCalledTimes(1);
  });

  it('múltiplos grupos, um falha e um vai → stats corretos', async () => {
    const mod = await load();
    mocks.listEnabledNewsGroups.mockResolvedValue([
      row({ groupId: GROUP_A }),
      row({ groupId: GROUP_B }),
    ]);
    mocks.sendNewsToGroup
      .mockRejectedValueOnce(new Error('IA fora'))
      .mockResolvedValueOnce(undefined);

    const stats = await mod.tick(NOW_D);

    expect(stats).toEqual({ checked: 2, sent: 1, skipped: 0, failed: 1 });
  });
});

describe('newsScheduler — sobreposição e ciclo de vida', () => {
  it('overlap: 2ª chamada concorrente retorna zeros', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => { release = res; });
    mocks.listEnabledNewsGroups.mockImplementationOnce(async () => {
      await gate;
      return [];
    });

    const mod = await load();
    const p1 = mod.tick(NOW_D);
    const p2 = await mod.tick(NOW_D);

    expect(p2).toEqual({ checked: 0, sent: 0, skipped: 0, failed: 0 });
    release();
    await p1;
  });

  it('startNewsScheduler() 2x → só 1 timer', async () => {
    vi.useFakeTimers();
    const mod = await load();
    mod.startNewsScheduler();
    mod.startNewsScheduler();

    const before = mocks.listEnabledNewsGroups.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(mocks.listEnabledNewsGroups.mock.calls.length - before).toBe(5);
    mod.stopNewsScheduler();
  });

  it('stopNewsScheduler() limpa o timer', async () => {
    vi.useFakeTimers();
    const mod = await load();
    mod.startNewsScheduler();
    mod.stopNewsScheduler();

    const before = mocks.listEnabledNewsGroups.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(mocks.listEnabledNewsGroups.mock.calls.length).toBe(before);
  });
});
