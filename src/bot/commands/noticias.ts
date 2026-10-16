import { ICommand, CommandContext } from './types';
import { getGroupNews, upsertGroupNews } from '../../services/databaseService';
import { fetchNews, formatNewsMessage, MAX_TOPIC_LEN, MAX_ITEMS } from '../../services/newsService';

/**
 * $noticias — notícias por tema (on-demand) + agendamento diário.
 *
 *   $noticias <tema> [N]        → busca N notícias (default 5) — livre
 *   $noticias on [HH:MM] [tema] → ativa o agendamento         — admin/master
 *   $noticias off               → desativa                    — admin/master
 *   $noticias status            → mostra a config             — admin/master
 *
 * `on`/`off`/`status` são reservadas apenas na PRIMEIRA posição: "ondas
 * gravitacionais" é tema, não o comando `on`.
 */

const DEFAULT_SCHEDULE = '08:00';
const DEFAULT_ITEMS = 5;

/** HH:MM válido (00:00–23:59). */
const HHMM_VALID = /^([01]?\d|2[0-3]):[0-5]\d$/;
/** Parece um horário mesmo quando inválido (ex.: 25:99) — para rejeitar claro. */
const HHMM_SHAPE = /^\d{1,2}:\d{2}$/;

const HELP = [
  '📰 *$noticias*',
  '',
  '• `$noticias <tema> [N]` — busca N notícias (default 5)',
  '• `$noticias on [HH:MM] [tema]` — ativa agendamento',
  '• `$noticias off` — desativa',
  '• `$noticias status` — mostra config',
  '',
  '_on/off/status: só admin do grupo ou master._',
].join('\n');

/** Zero-pad do horário: "8:00" → "08:00". */
function normalizeHHMM(t: string): string {
  const [h, m] = t.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

/** on/off/status são restritos; on-demand é livre. */
async function requireAdmin(ctx: CommandContext): Promise<boolean> {
  if (ctx.isMaster || ctx.isAdmin) return true;
  await ctx.reply('⛔ `on`/`off`/`status` são restritos a admin do grupo ou master.');
  return false;
}

async function handleOff(ctx: CommandContext): Promise<void> {
  if (!(await requireAdmin(ctx))) return;
  await upsertGroupNews(ctx.chatId, { enabled: false });
  await ctx.reply('⛔ Agendamento de notícias desativado.');
}

async function handleStatus(ctx: CommandContext): Promise<void> {
  if (!(await requireAdmin(ctx))) return;
  const cfg = await getGroupNews(ctx.chatId);
  const groupName = ctx.groupName || 'este grupo';
  await ctx.reply([
    `📰 *Notícias — ${groupName}*`,
    '',
    `Estado: ${cfg?.enabled ? '✅ Ativo' : '⛔ Desativado'}`,
    `Horário: ${cfg?.scheduleTime || DEFAULT_SCHEDULE}`,
    `Tema: ${cfg?.topic || '(todos os temas)'}`,
    `Itens por envio: ${cfg?.itemCount ?? DEFAULT_ITEMS}`,
    `Último envio: ${cfg?.lastSentAt || 'nunca'}`,
  ].join('\n'));
}

async function handleOn(ctx: CommandContext): Promise<void> {
  if (!(await requireAdmin(ctx))) return;

  const rest = (ctx.args || []).slice(1);
  let scheduleTime = DEFAULT_SCHEDULE;
  let topic = '';

  if (rest.length > 0 && HHMM_VALID.test(rest[0])) {
    scheduleTime = normalizeHHMM(rest[0]);
    topic = rest.slice(1).join(' ').trim();
  } else if (rest.length > 0 && HHMM_SHAPE.test(rest[0])) {
    // Parece hora mas não é (25:99, 09:75) — rejeita em vez de virar tema.
    await ctx.reply(`❌ Horário inválido: \`${rest[0]}\`. Use HH:MM entre 00:00 e 23:59.`);
    return;
  } else {
    topic = rest.join(' ').trim();
  }

  if (topic.length > MAX_TOPIC_LEN) {
    await ctx.reply(`❌ Tema muito longo (${topic.length} caracteres). Máximo: ${MAX_TOPIC_LEN}.`);
    return;
  }

  await upsertGroupNews(ctx.chatId, { enabled: true, scheduleTime, topic });
  await ctx.reply(`✅ Notícias agendadas: ${scheduleTime}${topic ? ` · tema "${topic}"` : ''}`);
}

async function handleOnDemand(ctx: CommandContext, args: string[]): Promise<void> {
  if (args.length === 0) {
    await ctx.reply(HELP);
    return;
  }

  let count = DEFAULT_ITEMS;
  const parts = [...args];
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last)) {
    const n = Number.parseInt(last, 10);
    if (n < 1) {
      await ctx.reply(`❌ A quantidade precisa ser entre 1 e ${MAX_ITEMS}.`);
      return;
    }
    count = Math.min(n, MAX_ITEMS);
    parts.pop();
  }

  const topic = parts.join(' ').trim();
  if (!topic) {
    await ctx.reply(HELP);
    return;
  }
  if (topic.length > MAX_TOPIC_LEN) {
    await ctx.reply(`❌ Tema muito longo (${topic.length} caracteres). Máximo: ${MAX_TOPIC_LEN}.`);
    return;
  }

  await ctx.reply('📰 _Buscando notícias..._');
  const body = await fetchNews(topic, count);
  await ctx.reply(formatNewsMessage(topic, count, body));
}

export const noticiasCommand: ICommand = {
  name: 'noticias',
  description: 'Busca notícias por tema (IA) e agenda envios diários no grupo.',
  async execute(ctx: CommandContext) {
    const args = ctx.args || [];
    const first = (args[0] || '').toLowerCase();

    if (first === 'off') return handleOff(ctx);
    if (first === 'status') return handleStatus(ctx);
    if (first === 'on') return handleOn(ctx);

    return handleOnDemand(ctx, args);
  },
};
