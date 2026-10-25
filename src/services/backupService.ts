/**
 * backupService — snapshot diário do SQLite via VACUUM INTO.
 *
 * Contexto (incidente 14/out): copiar só o arquivo .db perde tudo que ainda
 * não sofreu checkpoint do WAL — na ocasião, 6 dias de escrita. O
 * `backupDatabase()` já materializa o WAL corretamente; o que faltava era
 * QUEM chamá-lo: nenhum scheduler existia, e os backups manuais de deploy
 * iam para /tmp, que o reboot apaga.
 *
 * Regras:
 *   - roda no boot e a cada 24h (best-effort: falha loga e não derruba nada);
 *   - arquivo único `.db.gz` (sem -wal/-shm) em BACKUP_DIR (default ./backups);
 *   - rotação KEEP_BACKUPS (default 7) mais recentes por mtime;
 *   - nunca toca no banco de produção além da leitura do VACUUM.
 */
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { backupDatabase } from './databaseService';
import { logInfo, logWarning } from './loggerService';

const gzipAsync = promisify(gzip);

export interface BackupResult {
  file: string;
  bytes: number;
  rotatedOut: string[];
}

export function backupDir(): string {
  return resolve(process.env.BACKUP_DIR || join(process.cwd(), 'backups'));
}

function backupKeep(): number {
  const n = Number.parseInt(process.env.BACKUP_KEEP || '7', 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function stamp(now = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

/**
 * Um snapshot: VACUUM INTO → gzip → remove o cru → rotação.
 * Levanta em caso de falha — o scheduler decide como tratar.
 */
export async function runBackup(now = new Date()): Promise<BackupResult> {
  const dir = backupDir();
  await mkdir(dir, { recursive: true });

  const rawPath = join(dir, `bot-wpp-${stamp(now)}.db`);
  await backupDatabase(rawPath);

  const raw = await readFile(rawPath);
  const gz = await gzipAsync(raw);
  const gzPath = `${rawPath}.gz`;
  await writeFile(gzPath, gz);
  await unlink(rawPath).catch(() => { /* o cru não pode sobrar, mas falhar aqui não invalida o backup */ });

  const rotatedOut = await rotateBackups(dir, backupKeep());

  const info = await stat(gzPath);
  return { file: basename(gzPath), bytes: info.size, rotatedOut };
}

/**
 * Mantém apenas os `keep` backups `.db.gz` mais recentes (mtime).
 * Retorna os nomes removidos.
 */
export async function rotateBackups(dir: string, keep: number): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const gzFiles: { name: string; mtime: number }[] = [];
  for (const name of entries) {
    if (!name.endsWith('.db.gz')) continue;
    try {
      const s = await stat(join(dir, name));
      gzFiles.push({ name, mtime: s.mtimeMs });
    } catch { /* arquivo sumiu entre readdir e stat — ignora */ }
  }
  gzFiles.sort((a, b) => b.mtime - a.mtime);
  const out: string[] = [];
  for (const f of gzFiles.slice(keep)) {
    try {
      await unlink(join(dir, f.name));
      out.push(f.name);
    } catch { /* best-effort */ }
  }
  return out;
}

/**
 * Scheduler: um snapshot imediato no boot + um a cada 24h. O interval leva
 * `.unref()` para não segurar o shutdown do processo.
 */
export function startBackupScheduler(intervalMs = 24 * 60 * 60 * 1000): void {
  const once = async (tag: string) => {
    try {
      const r = await runBackup();
      const kb = Math.round(r.bytes / 1024);
      logInfo(`[backup] ${tag}: ${r.file} (${kb} KB)${r.rotatedOut.length ? ` — rotacionou ${r.rotatedOut.length}` : ''}`);
    } catch (err: any) {
      logWarning('[backup] falhou (banco de produção intacto — VACUUM é leitura)', {
        error: err?.message,
      });
    }
  };
  void once('boot');
  setInterval(() => { void once('diário'); }, intervalMs).unref();
}
