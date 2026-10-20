import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseGoogleNewsRss,
  fetchFreshForTopic,
  decodeXmlEntities,
  normalizeTitle,
} from '../../src/services/rssNewsService';
import { fetchNews } from '../../src/services/newsService';
import { askAINews } from '../../src/services/aiService';
import { recordNewsTitles, getRecentNewsTitles, getRecentNewsLinks } from '../../src/services/databaseService';
import axios from 'axios';

/**
 * INC-011 — rssNewsService: parser do Google News RSS validado contra o
 * FIXTURE REAL capturado do VPS (tests/fixtures/google-news-anime.xml,
 * 20/10/2026, ~40 itens) + integração do fetchNews (RSS-first, dedup
 * título+guid, curadoria tudo-ou-nada, fallback LLM com disclaimer) e os
 * 2 casos de borda exigidos pelo arquiteto (feed vazio → fallback;
 * feed com 1 item → respeita o count sem inventar linhas).
 *
 * Lógica REAL; mocks só isolam axios (HTTP), banco, IA e logger.
 */

const AMP = String.fromCharCode(38); // "&" — imune a entity-mangling na escrita

const dbMocks = vi.hoisted(() => ({
  recordNewsTitles: vi.fn(async () => undefined),
  getRecentNewsTitles: vi.fn(async () => [] as string[]),
  getRecentNewsLinks: vi.fn(async () => [] as string[]),
}));

vi.mock('axios', () => ({ default: { get: vi.fn(async () => ({ data: '' })) } }));

vi.mock('../../src/services/aiService', () => ({
  askAI: vi.fn(async () => 'ok'),
  askAINews: vi.fn(async () => ''),
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

const axiosGet = vi.mocked(axios.get);

/** Feed REAL congelado (Refinamento 3): regressão se o Google mudar o formato. */
const FIXTURE_ANIME = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/google-news-anime.xml'),
  'utf8',
);

/** Feed sintético de 2 itens com entidades construídas na mão (determinístico). */
function miniFeed(hoursAgo: number): string {
  const pub = new Date(Date.now() - hoursAgo * 3_600_000).toUTCString();
  const item = (t: string, src: string, guid: string) =>
    `<item><title>${t} - ${src}</title>` +
    `<link>https://news.google.com/rss/articles/${guid}?oc=5</link>` +
    `<guid isPermaLink="false">${guid}</guid>` +
    `<pubDate>${pub}</pubDate>` +
    `<description>${AMP}lt;a href="x"${AMP}gt;${t}${AMP}lt;/a${AMP}gt;${AMP}nbsp;${AMP}nbsp;${AMP}lt;font${AMP}gt;${src}${AMP}lt;/font${AMP}gt;</description>` +
    `<source url="https://${src.toLowerCase().replace(/\s/g, '')}.com">${src}</source></item>`;
  return (
    `<?xml version="1.0"?><rss version="2.0"><channel>` +
    item('Título Alpha Teste', 'Portal Um', 'AAAGUID') +
    item('Título Beta Outro', 'Portal Dois', 'BBBGUID') +
    `</channel></rss>`
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbMocks.getRecentNewsTitles).mockResolvedValue([]);
  vi.mocked(dbMocks.getRecentNewsLinks).mockResolvedValue([]);
  vi.mocked(dbMocks.recordNewsTitles).mockClear();
  vi.mocked(askAINews).mockResolvedValue('');
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Parser × fixture real ────────────────────────────────────────────

describe('parseGoogleNewsRss — feed real (fixture do VPS)', () => {
  it('extrai ≥20 itens com título/fonte/guid/pubDate válidos', () => {
    const items = parseGoogleNewsRss(FIXTURE_ANIME);
    expect(items.length).toBeGreaterThanOrEqual(20);
    // 1º item do fixture: manchete pura vem do <a> da description.
    expect(items[0].title).toBe('Continuação do anime de Yona of the Dawn anuncia seu estúdio');
    expect(items[0].source).toBe('Crunchyroll');
    expect(items[0].guid).toBeTruthy();
    for (const it of items) {
      expect(it.title.trim().length).toBeGreaterThan(5);
      expect(it.pubDate).toBeInstanceOf(Date);
      expect(Number.isNaN(it.pubDate!.getTime())).toBe(false);
    }
  });

  it('títulos NÃO carregam o sufixo " - Fonte" (strip funciona)', () => {
    const items = parseGoogleNewsRss(FIXTURE_ANIME);
    for (const it of items) {
      expect(it.title.endsWith(` - ${it.source}`)).toBe(false);
    }
  });

  it('entidades decodificam; "&" não degrada em duas passadas', () => {
    expect(decodeXmlEntities(`${AMP}quot;`)).toBe('"');
    expect(decodeXmlEntities(`${AMP}lt;a${AMP}gt;`)).toBe('<a>');
    // "<" (entity do "&") NÃO pode virar "<" em segunda passada:
    expect(decodeXmlEntities(`${AMP}amp;lt;`)).toBe(`${AMP}lt;`);
  });

  it('sem <description>: cai no split do sufixo " - Fonte"', () => {
    const xml =
      `<?xml version="1.0"?><rss><channel>` +
      `<item><title>Manchete sem description - Portal X</title>` +
      `<link>https://g.com/a?oc=5</link><guid isPermaLink="false">GX</guid>` +
      `<pubDate>Tue, 20 Oct 2026 14:29:00 GMT</pubDate>` +
      `<source url="https://px.com">Portal X</source></item>` +
      `</channel></rss>`;
    const [item] = parseGoogleNewsRss(xml);
    expect(item.title).toBe('Manchete sem description');
    expect(item.source).toBe('Portal X');
  });
});

// ─── fetchFreshForTopic: merge de queries + retry ─────────────────────

describe('fetchFreshForTopic — merge e dedup intra-batch (Refinamento 2)', () => {
  it('"mundo geek" faz 2 queries e funde sem duplicar o mesmo artigo', async () => {
    const single = parseGoogleNewsRss(FIXTURE_ANIME);
    vi.mocked(axiosGet).mockImplementation(async () => ({ data: FIXTURE_ANIME }));

    const items = await fetchFreshForTopic('mundo geek');

    expect(axiosGet).toHaveBeenCalledTimes(2); // TOPIC_QUERIES['mundo geek'].length
    const urls = axiosGet.mock.calls.map((c) => decodeURIComponent(String(c[0])));
    expect(urls[0]).toContain('when:2d');
    expect(urls[1]).toContain('when:2d');
    // mesma resposta nas 2 queries → merge deduplica:
    expect(items.length).toBe(single.length);
  });
});

// ─── fetchNews: integração RSS-first (o coração do INC-011) ───────────

describe('fetchNews — via RSS', () => {
  it('retry when:7d quando o 2d vem vazio (Refinamento 1)', async () => {
    let call = 0;
    vi.mocked(axiosGet).mockImplementation(async () => {
      call += 1;
      return { data: call === 1 ? '' : miniFeed(2) }; // 2d vazio, 7d com itens
    });

    const body = await fetchNews('assunto x', 5);

    expect(call).toBe(2);
    expect(decodeURIComponent(String(axiosGet.mock.calls[1][0]))).toContain('when:7d');
    expect(body).toContain('Título Alpha Teste');
  });

  it('grava NewsRecord com link (guid) + pubDate; retorna linhas N. título — fonte', async () => {
    vi.mocked(axiosGet).mockResolvedValue({ data: miniFeed(3) } as any);

    const body = await fetchNews('tecnologia', 5);

    expect(body).toContain('1. Título Alpha Teste — Portal Um');
    expect(body).toContain('2. Título Beta Outro — Portal Dois');
    expect(body).toContain('(há 3h)');
    expect(vi.mocked(recordNewsTitles)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Título Alpha Teste', link: 'AAAGUID' }),
        expect.objectContaining({ title: 'Título Beta Outro', link: 'BBBGUID' }),
      ]),
      expect.any(String),
    );
    const records = vi.mocked(recordNewsTitles).mock.calls[0][0] as any[];
    expect(records[0].pubDate).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO, não NULL
  });

  it('dedup por título: item já enviado fica de fora', async () => {
    vi.mocked(axiosGet).mockResolvedValue({ data: miniFeed(2) } as any);
    vi.mocked(dbMocks.getRecentNewsTitles).mockResolvedValue(['TÍTULO ALPHA TESTE!!!']);

    const body = await fetchNews('tecnologia', 5);

    expect(body).not.toContain('Título Alpha Teste');
    expect(body).toContain('Título Beta Outro');
  });

  it('dedup por guid (link): artigo já enviado fica de fora', async () => {
    vi.mocked(axiosGet).mockResolvedValue({ data: miniFeed(2) } as any);
    vi.mocked(dbMocks.getRecentNewsLinks).mockResolvedValue(['AAAGUID']);

    const body = await fetchNews('tecnologia', 5);

    expect(body).not.toContain('Título Alpha Teste');
    expect(body).toContain('Título Beta Outro');
  });

  it('curadoria aceita resposta fiel e a usa no corpo', async () => {
    vi.mocked(axiosGet).mockResolvedValue({ data: miniFeed(2) } as any);
    vi.mocked(askAINews).mockResolvedValue(
      '1. Título Alpha Teste reescrito — Portal Um\n2. Título Beta Outro reescrito — Portal Dois'
    );

    const body = await fetchNews('tecnologia', 2);

    expect(body).toBe('1. Título Alpha Teste reescrito — Portal Um\n2. Título Beta Outro reescrito — Portal Dois');
  });

  it('curadoria que inventa 1 linha rejeita o CONJUNTO (tudo-ou-nada) e publica cru', async () => {
    vi.mocked(axiosGet).mockResolvedValue({ data: miniFeed(2) } as any);
    vi.mocked(askAINews).mockResolvedValue(
      '1. Título Alpha Teste reescrito — Portal Um\n2. Fato inventado sem relação nenhuma aqui'
    );

    const body = await fetchNews('tecnologia', 2);

    // NÃO mistura: nem a linha fiel sobrevive, ambos saem cru:
    expect(body).toBe('1. Título Alpha Teste — Portal Um (há 2h)\n2. Título Beta Outro — Portal Dois (há 2h)');
  });

  it('curadoria lenta (>5s) degrada para títulos cru (timeout duro)', async () => {
    vi.useFakeTimers();
    vi.mocked(axiosGet).mockResolvedValue({ data: miniFeed(2) } as any);
    vi.mocked(askAINews).mockImplementation(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('nunca chega'), 60_000)),
    );

    const p = fetchNews('tecnologia', 2);
    await vi.advanceTimersByTimeAsync(5_100); // estoura o CURATE_TIMEOUT_MS
    const body = await p;

    expect(body).toContain('1. Título Alpha Teste — Portal Um');
    expect(body).not.toContain('nunca chega');
  });
});

// ─── Casos de borda exigidos pelo arquiteto ───────────────────────────

describe('fetchNews — borda (condições do arquiteto)', () => {
  it('feed vazio (0 itens) → fallback LLM com disclaimer', async () => {
    vi.mocked(axiosGet).mockResolvedValue({ data: '' } as any);
    vi.mocked(askAINews).mockResolvedValue('1. Título LLM — resumo');

    const body = await fetchNews('tecnologia', 5);

    expect(body).toBe(
      '⚠️ _Fonte ao vivo indisponível — resumo gerado por IA:_\n\n1. Título LLM — resumo'
    );
    expect(vi.mocked(recordNewsTitles)).toHaveBeenCalledWith(['Título LLM'], expect.any(String));
  });

  it('feed com 1 item e count=5 → entrega 1, não inventa nem falha', async () => {
    const one = miniFeed(1).replace(/<item><title>Título Beta Outro[\s\S]*?<\/item>/, '');
    vi.mocked(axiosGet).mockResolvedValue({ data: one } as any);

    const body = await fetchNews('tecnologia', 5);

    expect(body).toBe('1. Título Alpha Teste — Portal Um (há 1h)');
    expect(body).not.toContain('2.');
  });
});
