/**
 * INC-011 — Notícias reais: busca + parse do Google News RSS.
 *
 * Substitui a "lembrança" do LLM por fonte ao vivo. Zero keys, zero custo
 * (feed público), formatação pt-BR. Chamado por newsService.fetchNews()
 * como 1ª via; o LLM vira só curador opcional ou fallback declarado.
 *
 * Formato do feed (validado em tests/fixtures/google-news-*.xml,
 * capturados do próprio VPS em 20/10/2026):
 *  - <item> numa única linha, SEM CDATA nos campos (strip fica como defesa);
 *  - <title> = "Manchete - Fonte" (fonte como sufixo " - ");
 *  - <description> = HTML escapado cujo <a> carrega a MANCHETE PURA
 *    (via principal do título limpo — split de " - " é só fallback);
 *  - <source url="…"> = veículo canônico;
 *  - <guid> = token estável por artigo (dedup secundário melhor que o
 *    <link>, que carrega sufixo "?oc=5" instável);
 *  - <pubDate> = RFC 822 (Date.parse nativo).
 */
import axios from 'axios';
import { logWarning } from './loggerService';

export interface NewsItem {
  /** Manchete pura, sem sufixo de fonte. */
  title: string;
  /** Veículo (do <source>). */
  source: string;
  /** URL de redirect do Google News. */
  link: string;
  /** Token estável do artigo (dedup secundário). */
  guid: string;
  /** Data de publicação (RFC 822 parseada); null se ausente/inválida. */
  pubDate: Date | null;
}

/**
 * Refinamento 2 — tópico → múltiplas queries (merge + dedup no merge).
 * Tópico sem mapeamento vira uma query única com o próprio nome.
 */
export const TOPIC_QUERIES: Record<string, string[]> = {
  'mundo geek': [
    'anime OR mangá OR games OR "cultura pop"',
    'séries OR filmes OR música OR marvel OR dc',
  ],
  tecnologia: ['tecnologia OR IA OR gadgets'],
};

const RSS_BASE = 'https://news.google.com/rss/search';
const RSS_LOCALE = 'hl=pt-BR&gl=BR&ceid=BR:pt-419';
const HTTP_TIMEOUT_MS = 10_000;

/**
 * Entidades vistas no feed real. Construídas com fromCharCode para não
 * serem confundidas com markup na escrita/leitura do código. `AMP`
 * (o "&") DEVE vir por último: senão "<" decodificaria em duas
 * passadas e viraria "<".
 */
const AMP = String.fromCharCode(38); // "&"
const ENTITIES: Array<[RegExp, string]> = [
  [new RegExp(`${AMP}lt;`, 'g'), '<'],
  [new RegExp(`${AMP}gt;`, 'g'), '>'],
  [new RegExp(`${AMP}quot;`, 'g'), '"'],
  [new RegExp(`${AMP}#0?39;`, 'g'), "'"],
  [new RegExp(`${AMP}apos;`, 'g'), "'"],
  [new RegExp(`${AMP}nbsp;`, 'g'), ' '],
  [new RegExp(`${AMP}amp;`, 'g'), AMP],
];

/** Decodifica entidades XML/HTML do feed. */
export function decodeXmlEntities(s: string): string {
  let out = String(s || '');
  for (const [re, rep] of ENTITIES) out = out.replace(re, rep);
  return out;
}

/** Conteúdo da tag, tolerante a atributos e a CDATA (defensivo). */
function tagContent(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  if (!m) return null;
  let s = m[1].trim();
  if (s.startsWith('<![CDATA[') && s.endsWith(']]>')) s = s.slice(9, -3).trim();
  return decodeXmlEntities(s) || null;
}

/** Remove o sufixo " - Fonte" do <title> (fallback da via principal, o <a>). */
function stripSourceSuffix(rawTitle: string, source: string): string {
  const src = String(source || '').trim();
  if (src && rawTitle.toLowerCase().endsWith(` - ${src.toLowerCase()}`)) {
    return rawTitle.slice(0, rawTitle.length - src.length - 3).trim();
  }
  const m = rawTitle.match(/^(.+)\s-\s[^-]{1,60}$/); // último " - " com cauda curta
  return m ? m[1].trim() : rawTitle.trim();
}

/** Parser do feed. Item sem <title> é pulado; nada lança. */
export function parseGoogleNewsRss(xml: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const raw of String(xml || '').split(/<item>/).slice(1)) {
    const end = raw.indexOf('</item>');
    const block = end === -1 ? raw : raw.slice(0, end);
    const rawTitle = tagContent(block, 'title');
    if (!rawTitle) continue;

    const source = tagContent(block, 'source') || '';
    // Via principal do título puro: <a> dentro de <description> (sem sufixo).
    const desc = tagContent(block, 'description') || '';
    const a = desc.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    const title = (a ? a[1] : stripSourceSuffix(rawTitle, source)).replace(/\s+/g, ' ').trim();

    const link = tagContent(block, 'link') || '';
    const guidTag = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
    const guid = (guidTag ? decodeXmlEntities(guidTag[1].trim()) : '') || link;

    const pubRaw = tagContent(block, 'pubDate');
    const ts = pubRaw ? Date.parse(pubRaw) : NaN;
    out.push({
      title,
      source,
      link,
      guid,
      pubDate: Number.isFinite(ts) ? new Date(ts) : null,
    });
  }
  return out;
}

/**
 * Chave de dedup: título normalizado — lowercase, sem acentos, sem
 * pontuação. DÍGITOS MANTIDOS (decisão F2 aprovada): "Jujutsu Kaisen 2"
 * ≠ "Jujutsu Kaisen"; remover números causaria dedup falso.
 */
export function normalizeTitle(t: string): string {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Uma query com janela `when:Nd` (Refinamento 1 — filtro no servidor do Google). */
async function fetchQuery(query: string, whenDays: number): Promise<NewsItem[]> {
  const url = `${RSS_BASE}?q=${encodeURIComponent(`${query} when:${whenDays}d`)}&${RSS_LOCALE}`;
  try {
    const res = await axios.get<string>(url, { timeout: HTTP_TIMEOUT_MS, responseType: 'text' });
    return parseGoogleNewsRss(String(res.data || ''));
  } catch (e: any) {
    logWarning('[rssNews] query falhou', { err: `${query} (${whenDays}d): ${e?.message || e}` });
    return [];
  }
}

/**
 * Busca itens frescos do tópico com merge das queries do TOPIC_QUERIES
 * (Refinamento 2) e dedup intra-batch por título normalizado, ordenados
 * por pubDate desc. O retry 2d→7d (Refinamento 1) mora no caller
 * (newsService.fetchNews) para manter esta função pura e mockável.
 */
export async function fetchFreshForTopic(topic: string, whenDays = 2): Promise<NewsItem[]> {
  const key = String(topic || '').toLowerCase().trim();
  const queries = TOPIC_QUERIES[key] ?? [String(topic || '').trim()];
  const batches = await Promise.all(queries.map((q) => fetchQuery(q, whenDays)));
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  for (const batch of batches) {
    for (const it of batch) {
      const dedupKey = normalizeTitle(it.title) || it.guid;
      if (!dedupKey || seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      items.push(it);
    }
  }
  items.sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
  return items;
}
