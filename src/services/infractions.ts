// Infrações por (grupo, usuário). 3 strikes = remoção (nunca ban, exceto bot).
import { getDb } from './databaseService';
import logger from './loggerService';

export const MAX_INFRACTIONS = 3;

function norm(groupId: string, userId: string): [string, string] {
  const g = String(groupId || '').replace(/^(wpp:|tg:|dc:)/, '');
  const u = String(userId || '').replace(/^(wpp:|tg:|dc:)/, '').replace(/@lid$/, '@c.us');
  return [g, u];
}

/** Registra uma infração e retorna o total acumulado neste grupo. */
export async function recordInfraction(groupId: string, userId: string): Promise<number> {
  const [g, u] = norm(groupId, userId);
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO infractions (group_id, user_id, count, last_infraction)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(group_id, user_id) DO UPDATE SET
         count = count + 1, last_infraction = ?`,
      g, u, Date.now(), Date.now()
    );
    const row: any = await db.get ? db.get(`SELECT count FROM infractions WHERE group_id = ? AND user_id = ?`, g, u) : null;
    return row?.count || 1;
  } catch (e: any) {
    logger.error('[DB] Falha ao registrar infração', { groupId: g, userId: u, error: e?.message });
    return 1;
  }
}

/** Lê o total de infrações de um usuário num grupo. */
export async function getInfractionCount(groupId: string, userId: string): Promise<number> {
  const [g, u] = norm(groupId, userId);
  try {
    const db = await getDb();
    const row = await db.get(`SELECT count FROM infractions WHERE group_id = ? AND user_id = ?`, g, u);
    return row?.count || 0;
  } catch (e: any) {
    logger.error('[DB] Falha ao ler infração', { groupId: g, userId: u, error: e?.message });
    return 0;
  }
}

/** Zera as infrações de um usuário num grupo. */
export async function resetInfractions(groupId: string, userId: string): Promise<void> {
  const [g, u] = norm(groupId, userId);
  try {
    const db = await getDb();
    await db.run(`DELETE FROM infractions WHERE group_id = ? AND user_id = ?`, g, u);
  } catch (e: any) {
    logger.error('[DB] Falha ao zerar infração', { groupId: g, userId: u, error: e?.message });
  }
}
