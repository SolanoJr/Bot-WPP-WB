import { askAI } from './aiService';
import { PlatformManager } from '../platforms/PlatformManager';

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

/** Monta o prompt enviado à IA. Separado para ficar testável. */
export function buildNewsPrompt(topic: string, count: number): string {
  const tema = topic ? `"${topic}"` : 'os principais acontecimentos do dia';
  return `Liste as ${count} notícias mais relevantes de HOJE sobre ${tema}.
Formato da resposta (texto puro, sem markdown, sem negrito, sem itálico):
1. Título curto — 1 frase resumindo
Não inclua cabeçalho, rodapé, fonte ou introdução.
Apenas a lista numerada, uma notícia por linha.
Se não encontrar notícias do dia, use as mais recentes da semana.`;
}

/** Busca as notícias na IA. Retorna o texto cru (a lista numerada). */
export async function fetchNews(topic: string, count: number): Promise<string> {
  return askAI(buildNewsPrompt(topic, count));
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
