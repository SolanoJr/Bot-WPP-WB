import { askAINews } from './aiService';
import { PlatformManager } from '../platforms/PlatformManager';
import { recordNewsTitles, getRecentNewsTitles, getRecentNewsLinks, NewsRecord } from './databaseService';
import { fetchFreshForTopic, normalizeTitle, NewsItem } from './rssNewsService';
import { logWarning, logInfo } from './loggerService';

/**
 * INC-006 — quantos títulos recentes entram no filtro do prompt.
 * 30 cobre ~uma semana de TOP 5 diários sem pesar o prompt (o probe do
 * laboratorio/probe-news-dedup.js validou o formato do bloco).
 */
const RECENT_TITLES_IN_PROMPT = 30;

/**
 * Notícias — busca via IA, formatação e envio.
 *
 * Separado do comando porque o agendador (`newsScheduler`) precisa das mesmas
 * peças sem passar por um `CommandContext`: o comando chama `fetchNews` +
 * `formatNewsMessage` e responde no chat atual; o scheduler chama
 * `sendNewsToGroup`, que resolve a plataforma pelo `PlatformManager`.
 *
 * Tudo aqui usa hora LOCAL do servidor (America/Fortaleza, -03). O agendamento
 * segue o fuso do dono, não o UTC do host — ver docs/BACKLOG.md.
 */

/** Cap do tema. Acima disso o comando rejeita em vez de truncar em silêncio. */
export const MAX_TOPIC_LEN = 80;
/** Faixa válida de itens por envio. */
export const MIN_ITEMS = 1;
export const MAX_ITEMS = 10;

/** `dd/mm/aaaa HH:MM` em hora LOCAL — usado no cabeçalho da mensagem. */
export function localDateTimeLabel(d: Date = new Date()): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

/**
 * `YYYY-MM-DDTHH:MM:SS` em hora LOCAL (sem `Z`) — formato de `last_sent_at`.
 *
 * Deliberadamente NÃO usa `toISOString()`: às 22:00 local o UTC já é o dia
 * seguinte, e o agendador concluiria que "já enviou hoje" cedo demais.
 */
export function localStamp(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${HH}:${MM}:${SS}`;
}

/** Título com iniciais maiúsculas (ex.: "mundo geek" → "Mundo Geek"). */
export function titleCase(s: string): string {
  return String(s || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Monta o prompt enviado à IA. Separado para ficar testável.
 *
 * `recentTitles` (INC-006) adiciona o bloco de dedup quando há histórico —
 * formato validado no probe (laboratorio/probe-news-dedup.js): 3/3 temas
 * sem overlap com o bloco, e sem ele o Groq devolveu o título fictício
 * literal. Sem histórico (primeiro envio, banco fora do ar) o prompt é
 * idêntico ao de antes.
 */
export function buildNewsPrompt(topic: string, count: number, recentTitles: string[] = []): string {
  const tema = topic ? `"${topic}"` : 'os principais acontecimentos do dia';
  const filtro = recentTitles.length
    ? `\nNUNCA repita os títulos abaixo — já foram enviados a este grupo antes:\n${recentTitles
        .map((t) => `- ${t}`)
        .join('\n')}`
    : '';
  return `Liste as ${count} notícias mais relevantes de HOJE sobre ${tema}.
Formato da resposta (texto puro, sem markdown, sem negrito, sem itálico):
1. Título curto — 1 frase resumindo
Não inclua cabeçalho, rodapé, fonte ou introdução.
Apenas a lista numerada, uma notícia por linha.
Se não encontrar notícias do dia, use as mais recentes da semana.${filtro}`;
}

/**
 * INC-006 — extrai os títulos da resposta da IA para o histórico de dedup.
 *
 * Sem fallback: se nenhuma linha casar (a IA mudou o formato), devolve [] —
 * dedup falhando em silêncio é melhor que dedup filtrando lixo: um
 * disclaimer viraria "título" e bloquearia notícia legítima no prompt
 * seguinte.
 *
 * Strip em duas fases: (a) markdown das pontas da LINHA antes do regex,
 * para "**1. Título** — resumo" casar; (b) no título capturado, para
 * "1. **Título** — resumo" devolver "Título". Título = primeiro segmento
 * antes do separador; a descrição fica fora do histórico (em-dash interno
 * corta no primeiro — decisão INC-006).
 *
 * `cap` alinha com o count pedido: a IA devolver 5 itens num TOP 3 grava 3 —
 * o header da mensagem e o histórico ficam coerentes entre si.
 */
export function extractTitles(aiResponse: string, cap: number): string[] {
  const titulos = String(aiResponse || '')
    .split('\n')
    // (a) markdown das pontas da linha, antes do regex
    .map((l) => l.replace(/^[*_#\s]+|[*_#]+$/g, '').trim())
    .map((l) => /^\s*(\d+)[.)]\s+(.+?)(?:\s+[—–]\s+|\s+-\s+)/.exec(l)?.[2])
    .filter((t): t is string => Boolean(t))
    // (b) markdown que sobrou dentro do título capturado
    .map((t) => t.replace(/^[*_#\s]+|[*_#\s]+$/g, '').trim())
    .filter(Boolean);
  return titulos.slice(0, Math.max(0, Math.min(Number(cap) || 0, 10)));
}

/**
 * INC-011 — idade legível: "(agora)" / "(há 3h)" / "(ontem)". Frescor
 * visível na mensagem; itens sem pubDate não ganham sufixo.
 */
function ageSuffix(pubDate: Date | null): string {
  if (!pubDate) return '';
  const h = Math.floor((Date.now() - pubDate.getTime()) / 3_600_000);
  if (!Number.isFinite(h) || h < 0) return '';
  if (h < 1) return ' (agora)';
  if (h < 24) return ` (há ${h}h)`;
  return ' (ontem)';
}

/** Timeout duro da curadoria LLM (Refinamento 4). */
const CURATE_TIMEOUT_MS = 5_000;

/**
 * INC-011 — curadoria LLM com timeout DURO de 5s. Recebe manchetes REAIS
 * e só as reformata; nunca gera fato novo. Tudo-ou-nada (condição do
 * arquiteto): resposta só é aceita se tiver exatamente `items.length`
 * linhas E cada linha cobrir ≥2 palavras do título original — senão o
 * conjunto INTEIRO é rejeitado e o caller publica títulos cru.
 */
async function curateTitles(items: NewsItem[]): Promise<string[] | null> {
  const AMP = String.fromCharCode(38); // evita entity-mangling na escrita
  const prompt = [
    `Reescreva cada notícia abaixo em UMA linha curta e fluida, preservando TODOS os fatos exatamente como escritos.`,
    `Não invente nada além do texto dado. Mantenha o nome da fonte no final.`,
    `Formato: "N. Manchete — Fonte" (sem markdown). Responda só com as linhas.`,
    '',
    ...items.map((i, idx) => `${idx + 1}. ${i.title} — ${i.source}`),
  ].join('\n');
  const raced = await Promise.race([
    askAINews(prompt)
      .then((r) =>
        String(r || '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      )
      .catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), CURATE_TIMEOUT_MS)),
  ]);
  // Linhas cruas (mantêm "N." e a fonte). Qualquer desvio — intro,
  // contagem errada, linha a menos — rejeita o conjunto INTEIRO.
  if (!raced || raced.length !== items.length) return null;
  const ok = items.every((it, idx) => {
    const words = normalizeTitle(it.title).split(' ').filter((w) => w.length > 3);
    const line = normalizeTitle(String(raced[idx] || ''));
    const hits = words.filter((w) => line.includes(w)).length;
    return hits >= Math.min(2, words.length);
  });
  return ok ? raced : null;
}

/**
 * Busca as notícias: 1ª via RSS real (INC-011), 2ª via LLM declarado.
 *
 * INC-006 — o dedup mora AQUI, não no scheduler nem no comando: os dois
 * caminhos ($noticias manual e agendador via sendNewsToGroup) passam por
 * esta função (verificado em F0.6). Histórico entra no filtro e a resposta
 * volta para o histórico. Falha de banco degrada (sem filtro / sem gravação)
 * com logWarning — nunca derruba a notícia.
 */
export async function fetchNews(topic: string, count: number): Promise<string> {
  // ── 1ª via: RSS real (INC-011) ─────────────────────────────────────
  try {
    let items = await fetchFreshForTopic(topic, 2); // when:2d (Refinamento 1)
    if (!items.length) items = await fetchFreshForTopic(topic, 7); // fim de semana magro

    const [recentTitles, recentLinks] = await Promise.all([
      getRecentNewsTitles(50).catch(() => [] as string[]), // Ref. 4 — janela estendida
      getRecentNewsLinks(50).catch(() => [] as string[]),
    ]);
    const sentTitles = new Set(recentTitles.map(normalizeTitle));
    const sentLinks = new Set(recentLinks);
    const fresh = items.filter(
      (i) =>
        !sentTitles.has(normalizeTitle(i.title)) &&
        !sentLinks.has(i.guid) &&
        !sentLinks.has(i.link),
    );
    if (fresh.length > 0) {
      const chosen = fresh.slice(0, count);
      await recordNewsTitles(
        chosen.map<NewsRecord>((i) => ({
          title: i.title,
          link: i.guid || i.link,
          pubDate: i.pubDate ? i.pubDate.toISOString() : null,
        })),
        localStamp(),
      ).catch((e: any) => {
        logWarning('[news] falha ao gravar histórico RSS — dedup degradado', {
          err: String(e?.message || e),
        });
      });
      const curated = await curateTitles(chosen).catch(() => null);
      if (curated) return curated.join('\n');
      // Curadoria falhou/estourou → títulos REAIS cru (Refinamento 4)
      return chosen
        .map((i, idx) => `${idx + 1}. ${i.title} — ${i.source}${ageSuffix(i.pubDate)}`)
        .join('\n');
    }
    logInfo(`[news] RSS sem itens inéditos p/ "${topic}" — fallback LLM`);
  } catch (e: any) {
    logWarning('[news] RSS falhou — fallback LLM', { err: String(e?.message || e) });
  }

  // ── 2ª via: fallback LLM (caminho INC-006, agora DECLARADO) ───────
  const recentes = await getRecentNewsTitles(RECENT_TITLES_IN_PROMPT).catch((e: any) => {
    logWarning('[news] histórico indisponível — seguindo sem filtro de dedup', {
      err: String(e?.message || e),
    });
    return [] as string[];
  });
  const body = await askAINews(buildNewsPrompt(topic, count, recentes));
  const titles = extractTitles(body, count);
  if (titles.length) {
    await recordNewsTitles(titles, localStamp()).catch((e: any) => {
      logWarning('[news] falha ao gravar títulos no histórico — dedup degradado', {
        err: String(e?.message || e),
      });
    });
  }
  return `⚠️ _Fonte ao vivo indisponível — resumo gerado por IA:_\n\n${body}`;
}

/** Monta a mensagem final que vai ao grupo. */
export function formatNewsMessage(
  topic: string,
  count: number,
  body: string,
  d: Date = new Date(),
): string {
  const temaLabel = topic ? titleCase(topic) : 'Geral';
  return [
    `🌍 *TOP ${count} NOTÍCIAS* — ${localDateTimeLabel(d)}`,
    `📌 Tema: ${temaLabel}`,
    '',
    String(body || '').trim(),
    '',
    '🤖 _WarriorBlack_',
  ].join('\n');
}

/** Prefixo do `group_id` → plataforma base do adapter. */
const PREFIX_TO_PLATFORM: Record<string, string> = {
  wpp: 'whatsapp',
  tg: 'telegram',
  dc: 'discord',
};

/**
 * Resolve a chave EXATA do adapter a partir do `group_id` prefixado.
 *
 * `PlatformManager.sendMessage` faz match EXATO de chave (sem fallback por
 * prefixo), então `'whatsapp'` não acha um adapter registrado como
 * `'whatsapp:558581344211'` (multi-número). Aqui o prefixo vira a plataforma
 * base e a chave registrada é escolhida: a mais específica primeiro (a que tem
 * sufixo de número), senão a chave simples.
 *
 * Retorna `null` quando não há adapter — o caller decide o que logar.
 */
export function resolveAdapterKey(activePlatforms: string[], groupId: string): string | null {
  const prefix = String(groupId ?? '').split(':')[0].toLowerCase();
  const base = PREFIX_TO_PLATFORM[prefix] || prefix;
  const specific = activePlatforms.find((p) => p.startsWith(`${base}:`));
  if (specific) return specific;
  if (activePlatforms.includes(base)) return base;
  return null;
}

/**
 * Busca + formata + envia pelo `PlatformManager`.
 *
 * Recebe o `group_id` prefixado (como está em `group_news`): a chave do adapter
 * é resolvida aqui, e o próprio adapter remove o prefixo antes de enviar
 * (Baileys `toJid`, Telegram `^tg:`, Discord `^dc:`).
 */
export async function sendNewsToGroup(groupId: string, topic: string, count: number): Promise<void> {
  const pm = PlatformManager.getInstance();
  const active = pm.getActivePlatforms();
  const platform = resolveAdapterKey(active, groupId);
  if (!platform) {
    throw new Error(
      `[news] nenhum adapter para "${groupId}" (ativos: ${active.join(', ') || 'nenhum'})`,
    );
  }
  const body = await fetchNews(topic, count);
  const text = formatNewsMessage(topic, count, body);
  await pm.sendMessage(platform, groupId, text);
}
