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
/** Expiração da solicitação de feedback (INC-016 B: 24h → 7 dias sem resposta). */
export const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * INC-020 — notificador da RESPOSTA do feedback. Quando o removido responde
 * no PV, o dono vê a resposta no Telegram privado (TELEGRAM_ALERT_CHAT_ID).
 * O normalizer chama o notifier registrado logo após recordResponse; o
 * multiPlatform registra a entrega via telegramAdapter. Fire-and-forget:
 * falha de notificação nunca bloqueia o fluxo do removido.
 */
export type FeedbackResponseNotifier = (
  ev: any,
  response: string,
  refused: boolean,
) => Promise<void> | void;
let responseNotifier: FeedbackResponseNotifier | null = null;
export function setResponseNotifier(fn: FeedbackResponseNotifier | null): void {
  responseNotifier = fn;
}
export function getResponseNotifier(): FeedbackResponseNotifier | null {
  return responseNotifier;
}

/**
 * INC-021 — texto da notificação 📩 ao dono. Função pura (testável): mostra
 * quem respondeu (nome + número), de onde saiu (grupo + comunidade) e a
 * resposta. O LID sozinho não identifica ninguém para o dono.
 */
export function formatResponseNotification(ev: any, response: string, refused: boolean): string {
  const short = response.length > 400 ? response.slice(0, 400) + '…' : response;
  const who = ev?.display_name || 'sem nome';
  const number = ev?.phone_number || ev?.user_id || '—';
  const group = ev?.group_name || ev?.group_id || '—';
  const community = ev?.community_name || ev?.community_id || '—';
  return [
    '📩 Feedback respondido',
    // INC-024: com leaves de Telegram/Discord a plataforma do evento virou
    // informação essencial (o número só diz algo para WhatsApp).
    `📱 Plataforma: ${ev?.platform || '—'}`,
    `👤 ${who} (${number})`,
    `📍 Grupo: ${group}`,
    `🏘 Comunidade: ${community}`,
    `💬 Resposta (${refused ? 'recusou' : 'respondeu'}):\n${short}`,
  ].join('\n');
}

/**
 * INC-016 A — gate do toggle: o grupo ativou `$feedback on`?
 * Fail-closed: sem linha em group_mod (ou banco fora) → false → NÃO
 * registra saída. Antes o leave gravava pending em qualquer grupo,
 * acumulando 52 eventos órfãos de grupos com feedback desligado.
 */
export async function isFeedbackEnabledForGroup(groupId: string): Promise<boolean> {
  try {
    const { getGroupMod } = await import('./databaseService.js');
    const config = await getGroupMod(groupId);
    return (config as any)?.feedback === true;
  } catch (e: any) {
    // Gate silencioso: DB fora → todos os eventos caíam em policy=0 sem uma
    // linha no log. O irmão isPresentationEnabled loga; aqui não podia ser menos.
    logger.warn('[feedbackService] isFeedbackEnabledForGroup falhou', { groupId, error: e?.message });
    return false;
  }
}

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

  // INC-021: o evento de remove do WhatsApp raramente traz nome (metadata
  // pós-remove já vem sem o participante). Quem se apresentou tem nome salvo
  // em presentations — usa esse em vez de deixar display_name NULL (a 📩 ao
  // dono mostrava número no lugar do nome). Sem apresentação, mantém o que
  // veio (a 📩 cai no fallback de número, já desenhado).
  let displayName = input.displayName;
  if (!displayName) {
    try {
      const pres: any = await db.get(
        `SELECT nome, display_name FROM presentations
         WHERE user_id = ? AND nome IS NOT NULL AND TRIM(nome) <> ''
         ORDER BY updated_at DESC LIMIT 1`,
        [input.userId]
      );
      if (pres?.nome) displayName = pres.nome;
    } catch { /* tabela/linha indisponível — segue sem nome */ }
  }

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
      eventId, input.platform, input.userId, input.phoneNumber ?? null, displayName ?? null,
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

/**
 * INC-016 B — último contato de feedback do usuário (para o cooldown
 * anti-spam de 30 dias do worker).
 */
export async function getLastContactAt(userId: string): Promise<number | null> {
  const db = await getDb();
  const row: any = await db.get(
    `SELECT MAX(contacted_at) as last FROM feedback_events
     WHERE user_id = ? AND status IN ('contacted','responded','refused')`,
    [userId]
  );
  return row?.last ?? null;
}

/**
 * INC-016 B — pedido de feedback em aberto do usuário (usado pelo listener
 * de resposta no BaileysMessageNormalizer: a próxima mensagem em PV dele é
 * a resposta do feedback).
 */
export async function getAwaitingFeedback(userId: string, now: number = Date.now()): Promise<any | null> {
  const db = await getDb();
  const row = await db.get(
    `SELECT event_id, expires_at, event_type, group_name, community_name, involved_group_names
     FROM feedback_events
     WHERE user_id = ? AND status = 'contacted' AND awaiting_response = 1 AND expires_at > ?
     ORDER BY contacted_at DESC LIMIT 1`,
    [userId, now]
  );
  return row || null;
}

/**
 * INC-016 B — registra uma tentativa de envio que falhou (cap de 3 → o
 * worker expira o evento em vez de retentar para sempre).
 */
export async function markAttemptFailed(eventId: string, now: number = Date.now()): Promise<number> {
  const db = await getDb();
  await db.run(
    `UPDATE feedback_events SET attempts = attempts + 1, updated_at = ? WHERE event_id = ?`,
    [now, eventId]
  );
  const row: any = await db.get(`SELECT attempts FROM feedback_events WHERE event_id = ?`, [eventId]);
  return row?.attempts ?? 0;
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
  const community = event.communityName;

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
