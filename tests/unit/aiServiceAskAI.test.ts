import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * INC-002 — askAI v2: pipeline multi-provider (Groq → Gemini-compat).
 *
 * Sem rede: axios, databaseService (memória ai_history) e o circuit breaker
 * são mockados — o breaker real persiste estado entre casos no mesmo
 * processo do vitest e envenenaria a suíte. Env vars salvas/restauradas
 * como no aiServiceNews.test.ts.
 */

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}));
vi.mock('../../src/services/databaseService', () => ({
  getDb: vi.fn(),
}));
vi.mock('../../src/services/circuitBreaker', () => ({
  circuitBreakerManager: {
    get: () => ({ execute: (fn: any) => fn() }),
  },
}));

import axios from 'axios';
import { getDb } from '../../src/services/databaseService';
import { askAI } from '../../src/services/aiService';

const mockedPost = (axios as unknown as { post: ReturnType<typeof vi.fn> }).post;
const mockedGetDb = getDb as unknown as ReturnType<typeof vi.fn>;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

let savedEnv: Record<string, string | undefined> = {};

function saveEnv(name: string) { savedEnv[name] = process.env[name]; }
function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  savedEnv = {};
}

/** getDb mockado: histórico de memória + spy do INSERT. */
function mockDb(history: Array<{ prompt: string; response: string }>) {
  const all = vi.fn().mockResolvedValue(history);
  const run = vi.fn().mockResolvedValue(undefined);
  mockedGetDb.mockResolvedValue({ all, run });
  return { all, run };
}

function groqOk(content = 'Azul.') {
  return { data: { choices: [{ message: { content } }] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  saveEnv('GROQ_API_KEY'); saveEnv('GEMINI_API_KEY'); saveEnv('GOOGLE_API_KEY');
});
afterEach(restoreEnv);

describe('INC-002 — askAI (pipeline multi-provider)', () => {
  it('1. Groq responde → content trimado, system com personalidade+memória, interação gravada', async () => {
    process.env.GROQ_API_KEY = 'gsk_fake';
    const { run } = mockDb([{ prompt: 'pergunta antiga', response: 'resposta antiga' }]);
    mockedPost.mockResolvedValueOnce(groqOk('  Azul.  '));

    const out = await askAI('qual a cor do céu?', 'user1');
    expect(out).toBe('Azul.');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe(GROQ_URL);

    const body = mockedPost.mock.calls[0][1];
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('Bot-WPP');
    expect(body.messages[0].content).toContain('Contexto da conversa anterior:');
    expect(body.messages[0].content).toContain('Usuário: pergunta antiga');
    expect(body.messages[1].content).toBe('Pergunta atual: qual a cor do céu?');
    expect(run).toHaveBeenCalledWith(
      'INSERT INTO ai_history (user_id, prompt, response) VALUES (?, ?, ?)',
      ['user1', 'qual a cor do céu?', 'Azul.'],
    );
  });

  it('2. Groq 500 → fallback Gemini responde', async () => {
    process.env.GROQ_API_KEY = 'gsk_fake';
    process.env.GEMINI_API_KEY = 'gemini_fake';
    const { run } = mockDb([]);
    mockedPost
      .mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Via fallback' } }] } });

    await expect(askAI('teste', 'user1')).resolves.toBe('Via fallback');
    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost.mock.calls[1][0]).toBe(GEMINI_URL);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('3. Content vazio do Groq (200 sem content) → cai para o Gemini', async () => {
    process.env.GROQ_API_KEY = 'gsk_fake';
    process.env.GEMINI_API_KEY = 'gemini_fake';
    mockDb([]);
    mockedPost
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: '' } }] } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Recuperado' } }] } });

    await expect(askAI('teste', 'user1')).resolves.toBe('Recuperado');
    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost.mock.calls[1][0]).toBe(GEMINI_URL);
  });

  it('4. Key do Groq ausente → pula direto para o Gemini', async () => {
    delete process.env.GROQ_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini_fake';
    mockDb([]);
    mockedPost.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Direto do Gemini' } }] } });

    await expect(askAI('teste', 'user1')).resolves.toBe('Direto do Gemini');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe(GEMINI_URL);
  });

  it('5. GOOGLE_API_KEY (env alternativa) autentica o Gemini quando GEMINI_API_KEY falta', async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_API_KEY = 'google_fake';
    mockDb([]);
    mockedPost.mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Com alt key' } }] } });

    await expect(askAI('teste', 'user1')).resolves.toBe('Com alt key');
    const headers = mockedPost.mock.calls[0][2].headers;
    expect(headers['Authorization']).toBe('Bearer google_fake');
  });

  it('6. Todos falham (500/500) → retorna mensagem amigável, NÃO lança, não grava', async () => {
    process.env.GROQ_API_KEY = 'gsk_fake';
    process.env.GEMINI_API_KEY = 'gemini_fake';
    const { run } = mockDb([]);
    mockedPost
      .mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }))
      .mockRejectedValueOnce(Object.assign(new Error('500'), { response: { status: 500 } }));

    const out = await askAI('teste', 'user1');
    expect(out).toContain('⚠️');
    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(run).not.toHaveBeenCalled();
  });

  it('7. Todos em 429/quota → mensagem de cota diária', async () => {
    process.env.GROQ_API_KEY = 'gsk_fake';
    process.env.GEMINI_API_KEY = 'gemini_fake';
    mockDb([]);
    const err429 = Object.assign(new Error('429'), {
      response: { status: 429, data: { error: { message: 'Rate limit reached quota exceeded' } } },
    });
    mockedPost.mockRejectedValue(err429);

    const out = await askAI('teste', 'user1');
    expect(out).toContain('cota diária');
  });

  it('8. Banco fora (memória indisponível) → degrada sem contexto e responde', async () => {
    process.env.GROQ_API_KEY = 'gsk_fake';
    mockedGetDb.mockRejectedValue(new Error('db down'));
    mockedPost.mockResolvedValueOnce(groqOk('Sem memória, mas respondendo'));

    await expect(askAI('teste', 'user1')).resolves.toBe('Sem memória, mas respondendo');
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });
});
