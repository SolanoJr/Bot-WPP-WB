/**
 * welcomeService — welcome configurável por grupo (persistido em SQLite).
 *
 * O Relay (`InMemoryRepository`) NÃO é fonte de verdade: reinicia e perde tudo.
 * Aqui a config vive em `group_mod.welcome_message`.
 *
 * Contrato:
 *   NULL/ausente no banco → usa DEFAULT_WELCOME
 *   texto definido        → usa o texto do grupo
 *
 * Placeholders suportados (seguros, sem PII inventada):
 *   {nome}   → display name do novato (ou o número, se não houver nome)
 *   {numero} → número/ID do novato
 *   {grupo}  → nome do grupo
 */

import { getDb } from './databaseService';
import logger from './loggerService';

/** Mensagem padrão do sistema. Simples e sem instrução de apresentação. */
export const DEFAULT_WELCOME = 'Boas-vindas @novato 👋';

/** Placeholders reconhecidos. */
export const WELCOME_PLACEHOLDERS = ['{nome}', '{numero}', '{grupo}', '{handle}'] as const;

export interface WelcomeContext {
  nome?: string;
  numero?: string;
  grupo?: string;
  /** Handle de menção pronto (@numero). Alimenta {handle} e o fallback @novato. */
  handle?: string;
}

/**
 * Aplica os placeholders ao template.
 * Placeholder sem valor disponível vira string vazia (nunca "undefined").
 *
 * INC-012b (design aditivo): o template composto é MULTI-LINHA (default
 * + "\n\n" + texto do admin). A normalização colapsa espaços/tabs por
 * linha mas PRESERVA quebras — e limita a 1 linha em branco entre blocos.
 */
export function renderWelcome(template: string, ctx: WelcomeContext): string {
  // Handle real = explícito ou derivado do numero. Sem numero → '' (guard).
  const handle = ctx.handle ?? (ctx.numero ? `@${ctx.numero}` : '');
  let out = String(template ?? '')
    .replace(/\{nome\}/gi, ctx.nome ?? '')
    .replace(/\{numero\}/gi, ctx.numero ?? '')
    .replace(/\{grupo\}/gi, ctx.grupo ?? '')
    .replace(/\{handle\}/gi, handle);
  // Fallback legacy: customs salvos com "@novato" literal ganham o handle
  // real. Só roda com handle não-vazio — sem numero, "@novato" permanece.
  if (handle) out = out.replace(/@novato/gi, handle);
  return out
    .replace(/[^\S\n]+/g, ' ')   // colapsa espaços/tabs DENTRO da linha
    .replace(/\n{3,}/g, '\n\n')  // no máx. 1 linha em branco
    .trim();
}

/**
 * INC-012b — welcome ADITIVO: o default SEMPRE abre a mensagem; o texto
 * do admin entra ABAIXO (não substitui).
 *
 * Idempotência (customs legados não quebram): se o texto já contém o
 * default ("Boas-vindas"), o fallback "@novato" ou o placeholder
 * "{handle}", é template completo e volta como está — sem prepender
 * de novo. `$setwelcome --full` e `$setwelcome reset` continuam
 * disponíveis para os dois extremos.
 */
export function composeWelcome(text: string): string {
  const t = String(text ?? '').trim();
  if (!t) return DEFAULT_WELCOME;
  const jaTemDefault =
    t.includes('Boas-vindas') ||
    t.includes('@novato') || t.includes('{handle}');
  return jaTemDefault ? t : `${DEFAULT_WELCOME}\n\n${t}`;
}

// ─── Aviso de apresentação (default aditivo — mesmo padrão do welcome) ──────
// O aviso é enviado após o welcome (memberJoinService) quando
// `presentation_enabled=1`. O novato responde ESTA mensagem (quote) com sua
// apresentação — o reply ao aviso também abre a sessão no presentationService
// (trigger `notice_reply`).

export const DEFAULT_PRESENTATION_MESSAGE =
  '📝 Para se apresentar, responda esta mensagem com seu nome, idade e o que você faz. ' +
  'Sua apresentação (e as dos outros membros) fica salva no nosso grupo do Telegram: https://t.me/Fortaleza_085/2';

/**
 * Composição ADITIVA (igual `composeWelcome`): o admin adiciona linhas embaixo
 * sem apagar o default. Texto vazio/igual ao default → default puro.
 */
export function composePresentationMessage(text: string): string {
  const t = String(text ?? '').trim();
  if (!t) return DEFAULT_PRESENTATION_MESSAGE;
  const jaTemDefault = t.includes('Para se apresentar');
  return jaTemDefault ? t : `${DEFAULT_PRESENTATION_MESSAGE}\n\n${t}`;
}

/** Texto custom do aviso de apresentação do grupo (ou null → default). */
export async function getPresentationMessage(groupId: string): Promise<string | null> {
  try {
    const { getDb } = await import('./databaseService.js');
    const db = await getDb();
    const row: any = await db.get(
      `SELECT presentation_message FROM group_mod WHERE group_id = ?`,
      [groupId],
    );
    const v = row?.presentation_message;
    return (typeof v === 'string' && v.trim()) ? v : null;
  } catch (e: any) {
    logger.warn('[welcomeService] getPresentationMessage falhou', { groupId, error: e?.message });
    return null;
  }
}

/**
 * Define (ou limpa) o aviso de apresentação do grupo.
 * @param text  texto novo; `null` restaura o padrão
 */
export async function setPresentationMessage(groupId: string, text: string | null): Promise<void> {
  const { ensureGroupModRow } = await import('./databaseService.js');
  const key = await ensureGroupModRow(groupId);
  const db = await getDb();
  await db.run(`UPDATE group_mod SET presentation_message = ? WHERE group_id = ?`, [text, key]);
}

/** Texto efetivo do aviso: o do grupo, ou o padrão (renderizado com o ctx). */
export async function resolvePresentationMessage(
  groupId: string,
  ctx: WelcomeContext,
): Promise<{ text: string; isDefault: boolean }> {
  const custom = await getPresentationMessage(groupId);
  const template = composePresentationMessage(custom ?? '');
  return { text: renderWelcome(template, ctx), isDefault: custom === null };
}

/**
 * Lê o welcome configurado do grupo.
 * @returns o texto configurado, ou null se o grupo usa o padrão.
 */
export async function getWelcomeMessage(groupId: string): Promise<string | null> {
  try {
    const db = await getDb();
    const row: any = await db.get(
      `SELECT welcome_message FROM group_mod WHERE group_id = ? LIMIT 1`,
      [groupId]
    );
    const v = row?.welcome_message;
    return (typeof v === 'string' && v.trim()) ? v : null;
  } catch (e: any) {
    logger.warn('[welcomeService] getWelcomeMessage falhou', { groupId, error: e?.message });
    return null;
  }
}

/**
 * Define (ou limpa) o welcome do grupo.
 * @param text  texto novo; `null` restaura o padrão
 */
export async function setWelcomeMessage(groupId: string, text: string | null): Promise<void> {
  const { ensureGroupModRow } = await import('./databaseService.js');
  const key = await ensureGroupModRow(groupId);
  const db = await getDb();
  await db.run(`UPDATE group_mod SET welcome_message = ? WHERE group_id = ?`, [text, key]);
}

/**
 * Texto efetivo de boas-vindas: o do grupo, ou o padrão.
 */
export async function resolveWelcome(groupId: string, ctx: WelcomeContext): Promise<{ text: string; isDefault: boolean }> {
  const custom = await getWelcomeMessage(groupId);
  const template = custom ?? DEFAULT_WELCOME;
  return { text: renderWelcome(template, ctx), isDefault: custom === null };
}

// ─── Comunidade (grupos filhos) ───────────────────────────────────────────

/** Registra/atualiza a relação grupo → comunidade (vinda do `linkedParent` do metadata). */
export async function upsertCommunityGroup(
  groupId: string,
  communityId: string,
  groupName?: string,
): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO community_groups (group_id, community_id, group_name, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(group_id) DO UPDATE SET
         community_id = excluded.community_id,
         group_name = excluded.group_name,
         updated_at = excluded.updated_at`,
      [groupId, communityId, groupName ?? null, Date.now()]
    );
  } catch (e: any) {
    logger.warn('[welcomeService] upsertCommunityGroup falhou', { groupId, error: e?.message });
  }
}

/** O grupo pertence a esta comunidade? (consulta a relação real persistida) */
export async function isGroupInCommunity(groupId: string, communityId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const row: any = await db.get(
      `SELECT community_id FROM community_groups WHERE group_id = ? LIMIT 1`,
      [groupId]
    );
    return row?.community_id === communityId;
  } catch {
    return false;
  }
}

/** Lista os grupos conhecidos de uma comunidade. */
export async function listCommunityGroups(communityId: string): Promise<Array<{ group_id: string; group_name: string | null }>> {
  try {
    const db = await getDb();
    return await db.all(
      `SELECT group_id, group_name FROM community_groups WHERE community_id = ? ORDER BY group_name`,
      [communityId]
    );
  } catch {
    return [];
  }
}

// ─── Apresentações: config por grupo ────────────────────────────────────────

/** Lê se as apresentações estão ativas no grupo. Default: false (0). */
export async function isPresentationEnabled(groupId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const row: any = await db.get(
      `SELECT presentation_enabled FROM group_mod WHERE group_id = ? LIMIT 1`,
      [groupId]
    );
    return row?.presentation_enabled === 1;
  } catch (e: any) {
    logger.warn('[welcomeService] isPresentationEnabled falhou', { groupId, error: e?.message });
    return false;
  }
}

/** Define se as apresentações estão ativas no grupo. */
export async function setPresentationEnabled(groupId: string, enabled: boolean): Promise<void> {
  const { ensureGroupModRow } = await import('./databaseService.js');
  const key = await ensureGroupModRow(groupId);
  const db = await getDb();
  await db.run(`UPDATE group_mod SET presentation_enabled = ? WHERE group_id = ?`, [enabled ? 1 : 0, key]);
}

/** Status legível para o comando $apresentacao status. */
export async function getPresentationStatus(groupId: string): Promise<{ enabled: boolean; inCommunity: boolean }> {
  const enabled = await isPresentationEnabled(groupId);
  const inCommunity = await isGroupInCommunity(groupId, COMMUNITY_085_ID);
  return { enabled, inCommunity };
}

export const COMMUNITY_085_ID = '120363422234580695@g.us';
