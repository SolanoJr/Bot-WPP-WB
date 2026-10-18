import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * askAI — endpoint NATIVO do Gemini (INC-002: gemini-3.8-flash +
 * thinkingBudget=0). Sem rede: axios, databaseService (SQLite) e
 * loggerService mockados. Padrão do irmão aiServiceNews.test.ts.
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

beforeEach(() => {
  vi.clearAllMocks();
  originalGemini = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'gemini_teste';
});

afterEach(() => {
  if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGemini;
});

const NATIVE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

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

describe('askAI (INC-002 — nativo, 3.8-flash + thinking off)', () => {
  it('(i) 200 + parts[0].text preenchido → retorna a string (contrato preservado)', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { candidates: [{ content: { parts: [{ text: 'Azul, como sempre.' }] } }] },
    });

    const r = await askAI('qual a cor do céu?', 'user-teste');

    expect(r).toBe('Azul, como sempre.');
    expect(typeof r).toBe('string');
    // Pinos do INC-002: modelo vigente + thinking off no payload nativo
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe(`${NATIVE_URL}?key=gemini_teste`);
    const payload = mockedPost.mock.calls[0][1];
    expect(payload.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('(ii) 200 + parts=[] (reasoning-first sem texto) → "não gerou uma resposta válida"', async () => {
    mockedPost.mockResolvedValueOnce({
      data: { candidates: [{ content: { parts: [] } }] },
    });

    const r = await askAI('qual a cor do céu?', 'user-teste');

    expect(typeof r).toBe('string');
    expect(r).toContain('não gerou uma resposta válida');
  });
});
