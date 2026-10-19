import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * askAI — INC-002 v2: pipeline multi-provider chat/completions (Groq →
 * Gemini-compat). Smoke de contrato neste arquivo; a cobertura completa
 * (fallback, memória, cota, altKeyEnv, degradação de banco) vive em
 * aiServiceAskAI.test.ts. Sem rede: axios, databaseService e loggerService
 * mockados. Breaker real (threshold 3) — no máx. 1 falha por caso aqui.
 */
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('../../src/services/databaseService', () => ({
  getDb: vi.fn(async () => ({ all: async () => [], run: async () => ({}) })),
}));

vi.mock('../../src/services/loggerService', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
}));

import axios from 'axios';
import { getSarcasticResponse, askAI } from '../../src/services/aiService';

const mockedPost = (axios as unknown as { post: ReturnType<typeof vi.fn> }).post;

let originalGemini: string | undefined;
let originalGroq: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  originalGemini = process.env.GEMINI_API_KEY;
  originalGroq = process.env.GROQ_API_KEY;
  process.env.GEMINI_API_KEY = 'gemini_teste';
});

afterEach(() => {
  if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGemini;
  if (originalGroq === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroq;
});

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

describe('aiService', () => {
  it('retorna resposta sarcástica para interações', () => {
    const response = getSarcasticResponse();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });

  it('resposta sarcástica é uma string válida', async () => {
    const response = getSarcasticResponse();
    expect(response).toBeTruthy();
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
  });
});

describe('askAI (INC-002 — pipeline v2, Groq → Gemini-compat)', () => {
  it('(i) resposta válida do provider → retorna a string (contrato preservado)', async () => {
    // Sem GROQ_API_KEY no env → o pipeline vai direto ao Gemini-compat.
    delete process.env.GROQ_API_KEY;
    mockedPost.mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'Azul, como sempre.' } }] },
    });

    const r = await askAI('qual a cor do céu?', 'user-teste');

    expect(r).toBe('Azul, como sempre.');
    expect(typeof r).toBe('string');
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe(GEMINI_URL);
    const payload = mockedPost.mock.calls[0][1];
    expect(payload.messages[0].role).toBe('system');
    expect(payload.messages[1].content).toBe('Pergunta atual: qual a cor do céu?');
    expect(mockedPost.mock.calls[0][2].headers['Authorization']).toBe('Bearer gemini_teste');
  });

  it('(ii) content vazio no Groq (reasoning-first sem texto) → fallback Gemini responde', async () => {
    process.env.GROQ_API_KEY = 'gsk_teste';
    mockedPost
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: '' } }] } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: 'Recuperado pelo Gemini.' } }] } });

    const r = await askAI('qual a cor do céu?', 'user-teste');

    expect(r).toBe('Recuperado pelo Gemini.');
    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost.mock.calls[0][0]).toBe(GROQ_URL);
    expect(mockedPost.mock.calls[1][0]).toBe(GEMINI_URL);
  });
});
