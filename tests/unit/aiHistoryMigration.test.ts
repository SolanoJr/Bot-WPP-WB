import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-wpp-ai-history-'));
process.env.BOT_DATA_DIR = TMP_DIR;
process.env.GEMINI_API_KEY = 'test-key';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* SQLite may retain handles briefly on Windows. */ }
});

describe('ai_history migration', () => {
  it('creates the schema required by askAI and persists a Gemini response', async () => {
    const axios = (await import('axios')).default as unknown as { post: ReturnType<typeof vi.fn> };
    axios.post.mockResolvedValue({
      data: { candidates: [{ content: { parts: [{ text: 'Resposta de teste' }] } }] },
    });

    const dbService = await import('../../src/services/databaseService');
    const { askAI } = await import('../../src/services/aiService');
    await dbService.initDatabase();

    await expect(askAI('Pergunta de teste', 'user-test')).resolves.toBe('Resposta de teste');

    const db = await dbService.getDb();
    const row = await db.get(
      'SELECT user_id, prompt, response, timestamp FROM ai_history WHERE user_id = ?',
      ['user-test'],
    );
    expect(row).toMatchObject({
      user_id: 'user-test',
      prompt: 'Pergunta de teste',
      response: 'Resposta de teste',
    });
    expect(row.timestamp).toBeTruthy();
  });
});
