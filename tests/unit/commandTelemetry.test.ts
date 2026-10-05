import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';

describe('command usage telemetry', () => {
  it('persiste resultado, alias, contexto e duração para consulta agregada', async () => {
    // Isola este teste do banco local (que pode estar em uso por um bot real).
    process.env.BOT_DATA_DIR = path.join(os.tmpdir(), `bot-wpp-command-telemetry-${Date.now()}`);
    const { getCommandUsageSummary, recordCommandUsageEvent } = await import('../../src/services/databaseService');
    const commandName = `telemetry-test-${Date.now()}`;
    await recordCommandUsageEvent({
      commandName,
      commandAlias: 'teste-alias',
      platform: 'whatsapp',
      botId: 'bot-test',
      chatId: 'wpp:test-group@g.us',
      chatType: 'group',
      userId: 'wpp:test-user@s.whatsapp.net',
      outcome: 'success',
      permissionResult: 'allowed',
      durationMs: 12,
      correlationId: 'test-correlation-id',
    });

    const summary = await getCommandUsageSummary(100);
    const row = summary.find(item => item.command === commandName);
    expect(row).toMatchObject({ command: commandName, total: 1, successes: 1, errors: 0 });
  });
});
