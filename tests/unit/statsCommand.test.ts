import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-wpp-stats-'));
process.env.BOT_DATA_DIR = TMP_DIR;

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* Windows may retain SQLite handles briefly. */ }
});

describe('$stats', () => {
  it('uses the feedback_events table from the current schema', async () => {
    const dbService = await import('../../src/services/databaseService');
    const { statsCommand } = await import('../../src/bot/commands/stats');
    await dbService.initDatabase();
    const db = await dbService.getDb();
    await db.run(
      `INSERT INTO feedback_events (
        event_id, platform, user_id, group_id, event_type, left_at,
        status, awaiting_response, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-feedback-event', 'whatsapp', 'user-1', 'group-1', 'group_leave', Date.now(), 'responded', 0, Date.now(), Date.now()],
    );

    const reply = vi.fn();
    await expect(statsCommand.execute({ reply } as any)).resolves.toBeUndefined();

    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Eventos de feedback registrados:* 1'));
  });
});
