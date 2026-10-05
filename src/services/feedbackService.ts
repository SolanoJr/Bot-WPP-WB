/**
 * feedbackService — automação de feedback de saída.
 *
 * INDEPENDENTE do AutoMod. Não modera, não pune, não deleta.
 *
 * Fluxo:
 *   saída de membro (group-participants.update, action=remove)
 *     → recordExitEvent()      [SQLite — FONTE OFICIAL]
 *     → consolidatePending()  [agrupa saídas próximas no tempo]
 *     → sendFeedbackRequest()  [DM no WhatsApp]
 *     → notifyTelegram()      [espelho operacional — NUNCA a fonte]
 *
 * Regras:
 *   - SQLite é a fonte oficial. Telegram é só notificação.
 *   - Somente a PRÓXIMA mensagem privada é interpretada como resposta.
 *   - "não"/"nao" = recusa.
 *   - Expiração: 24h sem resposta.
 *   - Agrupamento: saídas em janela de 10 min viram UM pedido.
 *   - Nunca tratar "saiu do grupo" como "saiu da comunidade" sem evidência.
 */
import { getDb } from './databaseService';
import { isGroupInCommunity, COMMUNITY_085_ID } from './welcomeService';
import logger from './loggerService';

/** Janela de agrupamento: saídas neste intervalo viram um único pedido. */
export const GROUPING_WINDOW_MS = 10 * 60 * 1000;

/** Expiração da solicitação de feedback. */
export const EXPIRY_MS = 24 * 60 * 60 * 1000;

export type FeedbackEventType = 'group_leave' | 'community_leave' | 'multi_group_leave' | 'community_and_groups_leave';

export interface ExitEventInput {
  platform: string;
  userId: string;
  phoneNumber?: string;
  displayName?: string;
  groupId: string;
  groupName?: string;
  communityId?: string;
  communityName?: string;
  eventType: FeedbackEventType;
  leftAt: number;
}

/** Registra um evento de saída no SQLite (fonte oficial). */
export async function recordExitEvent(input: ExitEventInput): Promise<string> {
  const db = await getDb();
  const now = Date.now();

  // Se já existe um evento recente para este usuário, agrupa (não cria novo)
  const recent: any = await db.get(
    `SELECT * FROM feedback_events
     WHERE user_id = ? AND status = 'pending'
     ORDER BY left_at DESC LIMIT 1`,
    [input.userId]
  );
  if (recent && now - recent.left_at <= GROUPING_WINDOW_MS) {
    const groups: string[] = JSON.parse(recent.involved_group_ids || '[]');
    const names: string[] = JSON.parse(recent.involved_group_names || '[]');
    if (!groups.includes(input.groupId)) {
      groups.push(input.groupId);
      names.push(input.groupName || input.groupId);
    }
    const hasCommunity = !!recent.community_id || !!input.communityId;
    const eventType = hasCommunity && groups.length > 1
      ? 'community_and_groups_leave'
      : groups.length > 1
        ? 'multi_group_leave'
        : 'group_leave';
    await db.run(
      `UPDATE feedback_events SET
        involved_group_ids = ?, involved_group_names = ?,
        event_type = ?, updated_at = ?
       WHERE event_id = ?`,
      [JSON.stringify(groups), JSON.stringify(names), eventType, now, recent.event_id]
    );
    return recent.event_id;
  }

  const eventId = `${input.platform}|${input.userId}|${input.groupId}|${input.leftAt}`;
  await db.run(
    `INSERT OR IGNORE INTO feedback_events (
      event_id, platform, user_id, phone_number, display_name,
      community_id, community_name, group_id, group_name,
      involved_group_ids, involved_group_names, event_type, left_at,
      status, awaiting_response, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      eventId, input.platform, input.userId, input.phoneNumber ?? null, input.displayName ?? null,
      input.communityId ?? null, input.communityName ?? null, input.groupId, input.groupName ?? null,
      JSON.stringify([input.groupId]), JSON.stringify([input.groupName ?? input.groupId]),
      input.eventType, input.leftAt,
      'pending', 0, now, now,
    ]
  );
  return eventId;
}

/**
 * Agrupa saídas próximas do MESMO usuário em um único evento.
 *
 * Se o usuário já tem um evento `pending` dentro da janela de agrupamento,
 * adiciona o grupo à lista de grupos envolvidos em vez de criar novo evento.
 */
export async function consolidatePending(userId: string, now: number = Date.now()): Promise<string | null> {
  const db = await getDb();
  const recent: any = await db.get(
    `SELECT * FROM feedback_events
     WHERE user_id = ? AND status = 'pending'
     ORDER BY left_at DESC LIMIT 1`,
    [userId]
  );
  if (!recent) return null;

  const elapsed = now - recent.left_at;
  if (elapsed > GROUPING_WINDOW_MS) return null; // fora da janela — deixa criar novo

  // Adiciona o grupo à lista de envolvidos
  const groups: string[] = JSON.parse(recent.involved_group_ids || '[]');
  const names: string[] = JSON.parse(recent.involved_group_names || '[]');
  if (!groups.includes(recent.group_id)) {
    groups.push(recent.group_id);
    names.push(recent.group_name || recent.group_id);
  }
  const hasCommunity = !!recent.community_id;
  const eventType = hasCommunity && groups.length > 1
    ? 'community_and_groups_leave'
    : groups.length > 1
      ? 'multi_group_leave'
      : 'group_leave';

  await db.run(
    `UPDATE feedback_events SET
      involved_group_ids = ?, involved_group_names = ?,
      event_type = ?,
      updated_at = ?
     WHERE event_id = ?`,
    [JSON.stringify(groups), JSON.stringify(names), eventType, now, recent.event_id]
  );
  return recent.event_id;
}

/** Marca o evento como contatado e aguardando resposta. */
export async function markContacted(eventId: string, now: number = Date.now()): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE feedback_events SET
      status = 'contacted', awaiting_response = 1,
      contacted_at = ?, expires_at = ?, updated_at = ?
     WHERE event_id = ?`,
    [now, now + EXPIRY_MS, now, eventId]
  );
}

/** Registra a resposta do feedback. */
export async function recordResponse(eventId: string, response: string, now: number = Date.now()): Promise<void> {
  const db = await getDb();
  const normalized = response.trim().toLowerCase();
  const isRefusal = ['não', 'nao', 'n', 'no', 'não quero', 'nao quero'].includes(normalized);

  await db.run(
    `UPDATE feedback_events SET
      status = ?, awaiting_response = 0,
      response = ?, responded_at = ?, updated_at = ?
     WHERE event_id = ?`,
    [isRefusal ? 'refused' : 'responded', response, now, now, eventId]
  );
}

/** Eventos pendentes de contato (para o timer). */
export async function listPendingContact(): Promise<any[]> {
  const db = await getDb();
  return await db.all(
    `SELECT * FROM feedback_events WHERE status = 'pending' ORDER BY left_at ASC`
  );
}

/** Eventos aguardando resposta que expiraram. */
export async function listExpired(now: number = Date.now()): Promise<any[]> {
  const db = await getDb();
  return await db.all(
    `SELECT * FROM feedback_events
     WHERE status = 'contacted' AND awaiting_response = 1 AND expires_at < ?`,
    [now]
  );
}

/** Marca eventos expirados. */
export async function markExpired(eventIds: string[], now: number = Date.now()): Promise<void> {
  if (!eventIds.length) return;
  const db = await getDb();
  const placeholders = eventIds.map(() => '?').join(',');
  await db.run(
    `UPDATE feedback_events SET status = 'expired', awaiting_response = 0, updated_at = ?
     WHERE event_id IN (${placeholders})`,
    [now, ...eventIds]
  );
}

/** Consulta: todos os feedbacks (para comandos administrativos). */
export async function listFeedback(opts: { groupId?: string; limit?: number; offset?: number } = {}): Promise<any[]> {
  const db = await getDb();
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = opts.offset ?? 0;
  if (opts.groupId) {
    return await db.all(
      `SELECT * FROM feedback_events WHERE group_id = ? ORDER BY left_at DESC LIMIT ? OFFSET ?`,
      [opts.groupId, limit, offset]
    );
  }
  return await db.all(
    `SELECT * FROM feedback_events ORDER BY left_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
}

/** Estatísticas (para `$feedback estatisticas`). */
export async function stats(): Promise<{
  total: number;
  pending: number;
  contacted: number;
  responded: number;
  refused: number;
  expired: number;
}> {
  const db = await getDb();
  const rows: any[] = await db.all(`SELECT status FROM feedback_events`);
  const out = { total: rows.length, pending: 0, contacted: 0, responded: 0, refused: 0, expired: 0 };
  for (const r of rows) {
    if (r.status === 'pending') out.pending++;
    else if (r.status === 'contacted') out.contacted++;
    else if (r.status === 'responded') out.responded++;
    else if (r.status === 'refused') out.refused++;
    else if (r.status === 'expired') out.expired++;
  }
  return out;
}

/** Verifica se o grupo pertence à Comunidade 085. */
export async function isCommunityGroup(groupId: string): Promise<boolean> {
  return isGroupInCommunity(groupId, COMMUNITY_085_ID);
}

/** Formata a mensagem de pedido de feedback conforme o tipo de evento. */
export function formatFeedbackRequest(event: {
  eventType: string;
  groupName?: string | null;
  communityName?: string | null;
  involvedGroupNames?: string | null;
}): string {
  const groups: string[] = JSON.parse(event.involvedGroupNames || '[]');
  const community = event.communidade_name || event.communityName;

  let onde: string;
  switch (event.eventType) {
    case 'community_leave':
      onde = `da comunidade ${community || 'Fortaleza 085'}`;
      break;
    case 'multi_group_leave':
      onde = `dos grupos ${groups.join(' e ')}`;
      break;
    case 'community_and_groups_leave':
      onde = `da comunidade ${community || 'Fortaleza 085'} e dos grupos ${groups.join(' e ')}`;
      break;
    default:
      onde = `do grupo ${event.groupName || groups[0] || 'desconhecido'}`;
  }

  return [
    `Olá! Aqui é o WarriorBlack, bot do grupo/comunidade.`,
    ``,
    `Vi que você saiu ${onde}.`,
    ``,
    `Seu feedback é anônimo e ajuda a melhorar a comunidade.`,
    `Se possível, digite na próxima mensagem todo o feedback ou explique o motivo de ter saído.`,
    `Se não quiser responder, basta digitar "não".`,
  ].join('\n');
}

/** Formata a notificação para o Telegram (espelho operacional). */
export function formatTelegramNotification(event: {
  displayName?: string | null;
  phoneNumber?: string | null;
  communityName?: string | null;
  groupName?: string | null;
  involvedGroupNames?: string | null;
  leftAt: number;
  status: string;
  response?: string | null;
}): string {
  const groups: string[] = JSON.parse(event.involvedGroupNames || '[]');
  const when = new Date(event.leftAt).toLocaleString('pt-BR');

  if (event.status === 'responded' || event.status === 'refused') {
    const label = event.status === 'refused' ? 'Recusa' : 'Feedback';
    return [
      `📥 Novo ${label.toLowerCase()}`,
      ``,
      `👤 ${event.displayName || 'Sem nome'}`,
      `📱 ${event.phoneNumber || 'Sem telefone'}`,
      `🏘️ ${event.communityName || 'Sem comunidade'}`,
      `👥 ${groups.join(', ') || event.groupName || 'Sem grupo'}`,
      ``,
      `💬 ${event.response || '(recusou)'}`,
      ``,
      `🕐 ${when}`,
    ].join('\n');
  }

  return [
    `📤 Nova solicitação de feedback`,
    ``,
    `👤 ${event.displayName || 'Sem nome'}`,
    `📱 ${event.phoneNumber || 'Sem telefone'}`,
    `🏘️ ${event.communityName || 'Sem comunidade'}`,
    `👥 ${groups.join(', ') || event.groupName || 'Sem grupo'}`,
    `🕐 ${when}`,
    `⏳ Aguardando resposta`,
  ].join('\n');
}
