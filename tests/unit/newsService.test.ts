import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveAdapterKey,
  buildNewsPrompt,
  extractTitles,
  fetchNews,
} from '../../src/services/newsService';
import { askAINews } from '../../src/services/aiService';
import { recordNewsTitles, getRecentNewsTitles } from '../../src/services/databaseService';
import { logWarning } from '../../src/services/loggerService';

/**
 * newsService — resolveAdapterKey (pura) + INC-006: buildNewsPrompt com
 * filtro de dedup, extractTitles (strip de markdown, sem fallback) e
 * fetchNews (histórico entra no prompt, resposta volta para o histórico,
 * falha de banco degrada sem derrubar a notícia).
 *
 * As funções de lógica são as REAIS; os mocks só isolam os imports de
 * efeito (IA, banco, logger, plataformas).
 */

const dbMocks = vi.hoisted(() => ({
  recordNewsTitles: vi.fn(async () => undefined),
  getRecentNewsTitles: vi.fn(async () => [] as string[]),
}));

vi.mock('../../src/services/aiService', () => ({
  askAI: vi.fn(async () => 'ok'),
  askAINews: vi.fn(async () => 'ok'),
}));

vi.mock('../../src/services/databaseService', () => dbMocks);

vi.mock('../../src/services/loggerService', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logWarning: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/platforms/PlatformManager', () => ({
  PlatformManager: {
    getInstance: vi.fn(() => ({ sendMessage: vi.fn(), getActivePlatforms: () => [] })),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbMocks.getRecentNewsTitles).mockResolvedValue([]);
  vi.mocked(dbMocks.recordNewsTitles).mockClear();
});

const ACTIVE_WHATSAPP_MULTI = ['whatsapp', 'whatsapp:558581344211'];

describe('resolveAdapterKey', () => {
  it('wpp + chave com sufixo → prefere a mais específica', () => {
    expect(resolveAdapterKey(ACTIVE_WHATSAPP_MULTI, 'wpp:123@g.us')).toBe('whatsapp:558581344211');
  });

  it('wpp + só chave simples → chave simples', () => {
    expect(resolveAdapterKey(['whatsapp'], 'wpp:123@g.us')).toBe('whatsapp');
  });

  it('tg → telegram', () => {
    expect(resolveAdapterKey(['telegram'], 'tg:123')).toBe('telegram');
  });

  it('dc → discord', () => {
    expect(resolveAdapterKey(['discord'], 'dc:123')).toBe('discord');
  });

  it('sem adapter da plataforma → null', () => {
    expect(resolveAdapterKey(['telegram'], 'wpp:123')).toBeNull();
  });

  it('prefixo sem mapeamento → fallback direto', () => {
    expect(resolveAdapterKey(['foo'], 'foo:123')).toBe('foo');
  });

  it('prefixo maiúsculo → case-insensitive', () => {
    expect(resolveAdapterKey(['whatsapp'], 'WPP:123')).toBe('whatsapp');
  });

  it('sem adapters ativos → null', () => {
    expect(resolveAdapterKey([], 'wpp:123')).toBeNull();
  });
});

describe('buildNewsPrompt — filtro de dedup (INC-006)', () => {
  it('sem recentTitles → prompt idêntico ao original (sem bloco)', () => {
    const p = buildNewsPrompt('tecnologia', 3);
    expect(p).toContain('Liste as 3 notícias mais relevantes de HOJE sobre "tecnologia"');
    expect(p).not.toContain('NUNCA repita');
    expect(p.endsWith('use as mais recentes da semana.')).toBe(true);
  });

  it('com recentTitles → bloco "NUNCA repita" com os títulos', () => {
    const p = buildNewsPrompt('tecnologia', 3, ['Título A', 'Título B']);
    expect(p).toContain('NUNCA repita os títulos abaixo — já foram enviados a este grupo antes:');
    expect(p).toContain('- Título A');
    expect(p).toContain('- Título B');
  });

  it('array vazio de recentTitles → sem bloco (degradação = prompt original)', () => {
    expect(buildNewsPrompt('games', 5, [])).not.toContain('NUNCA repita');
  });

  it('sem tópico → tema default preservado', () => {
    expect(buildNewsPrompt('', 3)).toContain('os principais acontecimentos do dia');
  });
});

describe('extractTitles (INC-006)', () => {
  it('lista numerada com travessão', () => {
    const corpo = '1. Windows 11 — atualização de segurança\n2. Avatar 3 — estreia em dezembro';
    expect(extractTitles(corpo, 3)).toEqual(['Windows 11', 'Avatar 3']);
  });

  it('negrito na linha inteira: "**1. Windows 11 — notícia**" → título limpo', () => {
    expect(extractTitles('**1. Windows 11 — notícia**', 3)).toEqual(['Windows 11']);
  });

  it('negrito no título capturado: "1. **Windows 11** — notícia" → título limpo', () => {
    expect(extractTitles('1. **Windows 11** — notícia', 3)).toEqual(['Windows 11']);
  });

  it('parágrafo sem numeração → [] (sem fallback de fragmento)', () => {
    const corpo = 'Não é possível fornecer notícias de hoje.\nTente novamente mais tarde.';
    expect(extractTitles(corpo, 3)).toEqual([]);
  });

  it('disclaimer + 1 item válido → extrai só o que casa', () => {
    const corpo = 'Desculpe, mas:\n1. Windows 11 — atualização lançada hoje';
    expect(extractTitles(corpo, 3)).toEqual(['Windows 11']);
  });

  it('cap respeitado: 5 linhas com cap 3 → 3 títulos', () => {
    const corpo = [
      '1. Um — resumo',
      '2. Dois — resumo',
      '3. Três — resumo',
      '4. Quatro — resumo',
      '5. Cinco — resumo',
    ].join('\n');
    expect(extractTitles(corpo, 3)).toEqual(['Um', 'Dois', 'Três']);
  });

  it('em-dash interno: título = primeiro segmento antes do separador', () => {
    expect(extractTitles('1. Apple lança iPhone — 17ª geração — análise', 3)).toEqual([
      'Apple lança iPhone',
    ]);
  });

  it('hífen simples como separador também casa', () => {
    expect(extractTitles('1. Xbox Game Pass - novos jogos de outubro', 3)).toEqual([
      'Xbox Game Pass',
    ]);
  });

  it('resposta vazia → []', () => {
    expect(extractTitles('', 3)).toEqual([]);
  });
});

describe('fetchNews — dedup ponta a ponta (INC-006)', () => {
  it('histórico entra no prompt; títulos extraídos voltam para o histórico', async () => {
    vi.mocked(dbMocks.getRecentNewsTitles).mockResolvedValue(['Título antigo A']);
    vi.mocked(askAINews).mockResolvedValue('1. Título novo X — resumo\n2. Título novo Y — resumo');

    const body = await fetchNews('tecnologia', 2);

    expect(body).toBe('1. Título novo X — resumo\n2. Título novo Y — resumo');
    expect(vi.mocked(askAINews)).toHaveBeenCalledTimes(1);
    const prompt = vi.mocked(askAINews).mock.calls[0][0];
    expect(prompt).toContain('NUNCA repita');
    expect(prompt).toContain('- Título antigo A');
    expect(vi.mocked(dbMocks.getRecentNewsTitles)).toHaveBeenCalledWith(30);
    expect(vi.mocked(recordNewsTitles)).toHaveBeenCalledWith(
      ['Título novo X', 'Título novo Y'],
      expect.any(String)
    );
  });

  it('sem histórico → prompt sem bloco, gravação normal', async () => {
    vi.mocked(dbMocks.getRecentNewsTitles).mockResolvedValue([]);
    vi.mocked(askAINews).mockResolvedValue('1. Título — resumo');

    await fetchNews('games', 1);

    const prompt = vi.mocked(askAINews).mock.calls[0][0];
    expect(prompt).not.toContain('NUNCA repita');
    expect(vi.mocked(recordNewsTitles)).toHaveBeenCalledWith(['Título'], expect.any(String));
  });

  it('resposta fora do formato → grava nada, notícia segue', async () => {
    vi.mocked(askAINews).mockResolvedValue('Desculpe, não encontrei notícias de hoje.');

    const body = await fetchNews('anime', 3);

    expect(body).toBe('Desculpe, não encontrei notícias de hoje.');
    expect(vi.mocked(recordNewsTitles)).not.toHaveBeenCalled();
  });

  it('banco fora do ar no get → degrada sem filtro com logWarning, não derruba', async () => {
    vi.mocked(dbMocks.getRecentNewsTitles).mockRejectedValue(new Error('boom'));
    vi.mocked(askAINews).mockResolvedValue('1. Título — resumo');

    const body = await fetchNews('tecnologia', 3);

    expect(body).toBe('1. Título — resumo');
    expect(vi.mocked(logWarning)).toHaveBeenCalledWith(
      expect.stringContaining('histórico indisponível'),
      expect.anything()
    );
    const prompt = vi.mocked(askAINews).mock.calls[0][0];
    expect(prompt).not.toContain('NUNCA repita');
  });

  it('banco fora do ar no record → gravação falha em silêncio, notícia segue', async () => {
    vi.mocked(dbMocks.recordNewsTitles).mockRejectedValue(new Error('boom'));
    vi.mocked(askAINews).mockResolvedValue('1. Título — resumo');

    const body = await fetchNews('tecnologia', 3);

    expect(body).toBe('1. Título — resumo');
    expect(vi.mocked(logWarning)).toHaveBeenCalledWith(
      expect.stringContaining('falha ao gravar títulos'),
      expect.anything()
    );
  });
});
