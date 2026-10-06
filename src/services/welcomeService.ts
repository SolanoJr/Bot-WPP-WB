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
export const DEFAULT_WELCOME = 'Bem-vindo @novato 👋';

/** Placeholders reconhecidos. */
export const WELCOME_PLACEHOLDERS = ['{nome}', '{numero}', '{grupo}'] as const;

export interface WelcomeContext {
  nome?: string;
  numero?: string;
  grupo?: string;
}

/**
 * Aplica os placeholders ao template.
 * Placeholder sem valor disponível vira string vazia (nunca "undefined").
 */
export function renderWelcome(template: string, ctx: WelcomeContext): string {
  return String(template ?? '')
    .replace(/\{nome\}/gi, ctx.nome ?? '')
    .replace(/\{numero\}/gi, ctx.numero ?? '')
    .replace(/\{grupo\}/gi, ctx.grupo ?? '')
    .replace(/\s+/g, ' ')
    .trim();
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
