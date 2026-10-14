import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// BOT_DATA_DIR precisa estar setado ANTES do import do databaseService —
// o dbPath é calculado no load do módulo. Mesmo padrão do statsCommand.test.ts.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-wpp-backup-'));
process.env.BOT_DATA_DIR = TMP_DIR;

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* Windows pode segurar o handle */ }
});

describe('backupDatabase (VACUUM INTO)', () => {
  it('gera um arquivo não-vazio no destino', async () => {
    const dbService = await import('../../src/services/databaseService');
    const dest = path.join(TMP_DIR, 'backup-test.db');

    await dbService.backupDatabase(dest);

    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.statSync(dest).size).toBeGreaterThan(0);
  });

  it('o destino é um banco SQLite válido (header correto)', async () => {
    const dbService = await import('../../src/services/databaseService');
    const dest = path.join(TMP_DIR, 'backup-test-header.db');

    await dbService.backupDatabase(dest);

    const head = fs.readFileSync(dest).subarray(0, 15).toString('latin1');
    expect(head).toBe('SQLite format 3');
  });

  it('o backup não depende do -wal existir no destino', async () => {
    const dbService = await import('../../src/services/databaseService');
    const dest = path.join(TMP_DIR, 'backup-test-nowal.db');

    await dbService.backupDatabase(dest);

    expect(fs.existsSync(dest + '-wal')).toBe(false);
    expect(fs.existsSync(dest + '-shm')).toBe(false);
  });
});
