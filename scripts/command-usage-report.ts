import {
  closeDatabase,
  getCommandUsageBreakdown,
  getCommandUsageSummary,
} from '../src/services/databaseService';

type Breakdown = 'command' | 'chat' | 'user' | 'platform';

function parseArgs(): { by: Breakdown; limit: number } {
  const byArg = process.argv.find(arg => arg.startsWith('--by='))?.slice(5) || 'command';
  const limitArg = Number.parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.slice(8) || '20', 10);
  const by: Breakdown = ['command', 'chat', 'user', 'platform'].includes(byArg)
    ? byArg as Breakdown
    : 'command';
  return { by, limit: Number.isFinite(limitArg) ? Math.max(1, Math.min(limitArg, 100)) : 20 };
}

async function main(): Promise<void> {
  const { by, limit } = parseArgs();
  if (by === 'command') {
    const rows = await getCommandUsageSummary(limit);
    console.table(rows.map(row => ({
      command: row.command,
      total: row.total,
      sucessos: row.successes,
      erros: row.errors,
      ultimoUso: new Date(row.lastUsedAt).toISOString(),
    })));
    return;
  }

  console.table(await getCommandUsageBreakdown(by, limit));
}

main()
  .catch(error => {
    console.error('[command-usage-report] falhou:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
