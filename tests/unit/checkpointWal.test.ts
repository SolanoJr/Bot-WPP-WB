import { describe, expect, it, vi } from 'vitest';

/**
 * Mock do driver `sqlite` (o databaseService abre via `open()`).
 * `exec` é o único método que importa aqui: o init do schema e o checkpoint
 * passam por ele. Nada toca em banco real.
 */
const execMock = vi.fn().mockResolvedValue(undefined);

vi.mock('sqlite', () => ({
  open: vi.fn(async () => ({
    exec: execMock,
    run: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    all: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  })),
  Database: class {},
}));

function execCalls(): string[] {
  return execMock.mock.calls.map((c) => String(c[0]));
}

describe('checkpoint do WAL', () => {
  it('checkpointWal() emite PRAGMA wal_checkpoint(PASSIVE)', async () => {
    const { checkpointWal } = await import('../../src/services/databaseService');

    execMock.mockClear();
    await checkpointWal();

    expect(execCalls()).toContain('PRAGMA wal_checkpoint(PASSIVE);');
  });

  it('initDatabase() configura journal_size_limit e mantém wal_autocheckpoint', async () => {
    const { checkpointWal } = await import('../../src/services/databaseService');

    // getDb() é singleton preguiçoso: a primeira chamada dispara o init.
    await checkpointWal();

    const calls = execCalls();
    expect(calls.some((s) => s.includes('journal_size_limit=4194304'))).toBe(true);
    expect(calls.some((s) => s.includes('wal_autocheckpoint=1000'))).toBe(true);
  });

  it('não usa TRUNCATE (evita lock com o bot rodando)', async () => {
    const { checkpointWal } = await import('../../src/services/databaseService');

    execMock.mockClear();
    await checkpointWal();

    expect(execCalls().some((s) => s.includes('TRUNCATE'))).toBe(false);
  });
});
