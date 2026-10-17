import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * askAINews — fallback de providers (Groq → Gemini) do pipeline de notícias.
 *
 * Sem rede: axios é mockado em todos os casos. As env vars são salvas no
 * beforeEach e restauradas no afterEach para não vazar estado entre testes.
 */

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from 'axios';
import { askAINews } from '../../src/services/aiService';

const mockedPost = (axios as unknown as { post: ReturnType<typeof vi.fn> }).post;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

let originalGroq: string | undefined;
let originalGemini: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  originalGroq = process.env.GROQ_API_KEY;
  originalGemini = process.env.GEMINI_API_KEY;
});

afterEach(() => {
  if (originalGroq === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroq;
  if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGemini;
});

describe('askAINews', () => {
  it('1. Groq responde → retorna o conteúdo trimado', async () => {
    process.env.GROQ_API_KEY = 'gsk_teste';
    mockedPost.mockResolvedValueOnce({
      data: { choices: [{ message: { content: '  1. Notícia A — resumo  ' } }] },
    });

    await expect(askAINews('prompt')).resolves.toBe('1. Notícia A — resumo');

    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe(GROQ_URL);
  });

  it('2. Groq falha (500) → tenta o Gemini e retorna o conteúdo dele', async () => {
    process.env.GROQ_API_KEY = 'gsk_teste';
    process.env.GEMINI_API_KEY = 'gemini_teste';
    const err500 = Object.assign(new Error('Request failed with status code 500'), {
      response: { status: 500 },
    });
    mockedPost
      .mockRejectedValueOnce(err500)
      .mockResolvedValueOnce({
        data: { choices: [{ message: { content: '1. Notícia via fallback Gemini' } }] },
      });

    await expect(askAINews('prompt')).resolves.toBe('1. Notícia via fallback Gemini');

    expect(mockedPost).toHaveBeenCalledTimes(2);
    expect(mockedPost.mock.calls[1][0]).toBe(GEMINI_URL);
  });

  it('3. Sem key do Groq → pula o provider sem crash (responde via Gemini)', async () => {
    delete process.env.GROQ_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini_teste';
    mockedPost.mockResolvedValueOnce({
      data: { choices: [{ message: { content: '1. Notícia direto do Gemini' } }] },
    });

    await expect(askAINews('prompt')).resolves.toBe('1. Notícia direto do Gemini');

    // Groq foi pulado: a única chamada HTTP foi no endpoint do Gemini.
    expect(mockedPost).toHaveBeenCalledTimes(1);
    expect(mockedPost.mock.calls[0][0]).toBe(GEMINI_URL);
  });

  it('4. Resposta vazia → tenta o próximo provider', async () => {
    process.env.GROQ_API_KEY = 'gsk_teste';
    process.env.GEMINI_API_KEY = 'gemini_teste';
    mockedPost
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: '' } }] } })
      .mockResolvedValueOnce({
        data: { choices: [{ message: { content: '1. Recuperado pelo Gemini' } }] },
      });

    await expect(askAINews('prompt')).resolves.toBe('1. Recuperado pelo Gemini');

    expect(mockedPost).toHaveBeenCalledTimes(2);
  });
});
