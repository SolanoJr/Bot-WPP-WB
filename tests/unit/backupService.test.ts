/**
 * backupService — snapshot VACUUM INTO + gzip + rotação.
 *
 * Cobre o P1 da auditoria de 25/out: o backupDatabase() existia desde o
 * incidente WAL de 14/out, mas NENHUM scheduler o chamava. Aqui se prova:
 *   - runBackup gera um único .db.gz válido (cru não sobra);
 *   - o .db dentro do gz tem o conteúdo do banco (não é arquivo vazio);
 *   - rotação mantém só os N mais recentes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-backup-'));

process.env.BOT_DATA_DIR = path.join(TMP_DIR, 'data');
process.env.BACKUP_DIR = path.join(TMP_DIR, 'backups');
process.env.BACKUP_KEEP = '3';

let bs: typeof import('../../src/services/backupService');
let db: typeof import('../../src/services/databaseService');

beforeAll(async () => {
  bs = await import('../../src/services/backupService');
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
});

afterAll(async () => {
  // O singleton do databaseService mantém o handle do sqlite: fechar antes
  // de apagar o tmp. O rmSync é best-effort: no Windows o Defender pode
  // segurar o .gz recém-escrito por instantes (EPERM) — o tmp do sistema
  // é limpo periodicamente, e a limpeza não é o que o teste prova.
  await db.closeDatabase();
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch { /* best-effort */ }
});

describe('backupService — P1 snapshot diário', () => {
  it('runBackup gera um único .db.gz com o conteúdo do banco; cru não sobra', async () => {
    // Dado gravado ANTES do backup tem que estar dentro do snapshot.
    const conn: any = await db.getDb();
    await conn.run(
      `INSERT INTO command_logs (command_name, user_id, group_id) VALUES ('ping', 'tester@lid', 'g@g.us')`,
    );

    const result = await bs.runBackup(new Date('2026-10-25T12:00:00'));

    expect(result.file).toMatch(/^bot-wpp-2026-10-25T120000\.db\.gz$/);
    expect(result.bytes).toBeGreaterThan(0);

    const files = fs.readdirSync(path.join(TMP_DIR, 'backups'));
    expect(files).toEqual([result.file]); // nenhum cru sobrando

    // O .db dentro do gz é um SQLite de verdade com o dado gravado.
    const gz = fs.readFileSync(path.join(TMP_DIR, 'backups', result.file));
    const raw = gunzipSync(gz);
    expect(raw.subarray(0, 15).toString()).toContain('SQLite format 3');

    fs.writeFileSync(path.join(TMP_DIR, 'restored.db'), raw);
    const sqlite3mod = (await import('sqlite3')).default as any;
    const restored = new sqlite3mod.Database(path.join(TMP_DIR, 'restored.db'));
    const rows = await new Promise<any[]>((res, rej) => {
      restored.all(`SELECT command_name FROM command_logs`, (e: any, r: any[]) => e ? rej(e) : res(r));
    });
    expect(rows).toEqual([{ command_name: 'ping' }]);
    await new Promise<void>((res) => restored.close(() => res()));
  });

  it('rotação mantém apenas os N mais recentes (.db.gz por mtime)', async () => {
    const dir = path.join(TMP_DIR, 'backups');
    // 5 backups fake com mtimes crescentes; o real de cima é o mais novo.
    const base = new Date('2026-10-20T00:00:00').getTime();
    for (let i = 0; i < 5; i++) {
      const f = path.join(dir, `fake-${i}.db.gz`);
      fs.writeFileSync(f, 'x');
      fs.utimesSync(f, new Date(base + i * 60_000), new Date(base + i * 60_000));
    }

    const removed = await bs.rotateBackups(dir, 3);

    const remaining = fs.readdirSync(dir).filter((f) => f.endsWith('.db.gz'));
    expect(removed.length).toBe(3);
    expect(remaining.length).toBe(3);
    // Os fake-3 e fake-4 (mais novos dos fakes) sobrevivem; fake-0..2 saem.
    expect(remaining).toContain('fake-3.db.gz');
    expect(remaining).toContain('fake-4.db.gz');
    expect(removed).toContain('fake-0.db.gz');
  });

  it('runBackup falha alto com BACKUP_DIR inválido — o catch do scheduler é necessário', async () => {
    const good = process.env.BACKUP_DIR;
    // BACKUP_DIR apontando PARA DENTRO de um arquivo → mkdir lança ENOTDIR.
    const blocker = path.join(TMP_DIR, 'blocker-file');
    fs.writeFileSync(blocker, 'x');
    process.env.BACKUP_DIR = path.join(blocker, 'nao-existe');
    await expect(bs.runBackup()).rejects.toThrow();
    process.env.BACKUP_DIR = good;
  });
});
