/**
 * presentationService — apresentações persistentes (Comunidade 085).
 *
 * Fonte oficial: SQLite. O Telegram é ESPELHO — a apresentação nunca depende
 * da existência da mensagem no Telegram.
 *
 * Fluxo:
 *   entrada no grupo → welcome → (reply ao welcome | $apresentar | sinais)
 *   → PresentationSession coleta mensagens → janela de inatividade
 *   → consolidate() → persiste no SQLite → publica no Telegram (tópico 2)
 *   → avisa o novato
 *
 * Gatilhos (por força):
 *   1. reply à mensagem de welcome  → MUITO FORTE
 *   2. $apresentar                  → MUITO FORTE
 *   3. entrou recente + ≥2 sinais   → contextual
 *   4. sessão já aberta            → continua coletando
 *
 * NUNCA usar uma palavra isolada ("idade") como prova de apresentação.
 */
import { getDb } from './databaseService';
import { isGroupInCommunity } from './welcomeService';
import logger from './loggerService';

/** Comunidade 085 — identificador REAL (linkedParent do metadata do Baileys). */
export const COMMUNITY_085_ID = '120363422234580695@g.us';

/** Destino do espelho no Telegram. */
export const TG_CHAT_ID = '-1003470059875';
export const TG_THREAD_ID = '2';

/** Janela de inatividade para consolidar (padrão: 10 minutos). */
export const DEFAULT_IDLE_MS = 10 * 60 * 1000;

export type PresentationTrigger = 'welcome_reply' | 'notice_reply' | 'command' | 'signals' | 'continuation';
export type PresentationStatus = 'collecting' | 'consolidated' | 'published' | 'failed';

export interface PresentationSession {
  userId: string;
  groupId: string;
  startedAt: number;
  lastActivityAt: number;
  sourceMessageIds: string[];
  collectedTexts: string[];
  collectedMedia: Array<{ type: 'image' | 'other'; messageId: string; mediaType?: string }>;
  trigger: PresentationTrigger;
  status: PresentationStatus;
}

export interface PresentationRecord {
  presentation_id: string;
  platform: string;
  group_id: string;
  user_id: string;
  phone_number: string | null;
  display_name: string | null;
  nome: string | null;
  idade: number | null;
  genero: string | null;
  trabalho: string | null;
  hobbies: string | null;
  bio: string | null;
  orientacao: string | null;
  estado_civil: string | null;
  bairro: string | null;
  rede_social: string | null;
  photo_ref: string | null;
  // 'url': photo_ref é uma URL externa; 'sent': messageId de imagem no grupo;
  // 'profile': foto de perfil do apresentador (futura).
  photo_source: 'sent' | 'profile' | 'url' | null;
  original_text: string | null;
  source_message_ids: string | null;
  tg_chat_id: string | null;
  tg_thread_id: string | null;
  tg_message_id: string | null;
  status: PresentationStatus;
  created_at: number;
  updated_at: number;
}

/** ID estável do usuário: LID ou PN — nunca o nome. */
function stableUserId(jid: string): string {
  return String(jid || '').trim();
}

/** Número legível (apenas dígitos) a partir de JID/PN. */
function numeroDe(jid: string): string {
  return String(jid || '').replace(/@.*$/, '').replace(/\D/g, '');
}

/** Nome de exibição: pushName, ou o número se não houver nome. */
function displayNameOf(name: string | undefined, jid: string): string {
  const n = (name || '').trim();
  return n || numeroDe(jid) || jid;
}

// ─── Sessões em memória (coleta) ──────────────────────────────────────────

const sessions = new Map<string, PresentationSession>();

function sessionKey(groupId: string, userId: string): string {
  return `${groupId}|${userId}`;
}

/** Abre ou retorna a sessão ativa do usuário no grupo. */
export function getOrCreateSession(
  groupId: string,
  userId: string,
  trigger: PresentationTrigger,
  now: number = Date.now(),
): PresentationSession {
  const key = sessionKey(groupId, userId);
  const existing = sessions.get(key);
  if (existing && existing.status === 'collecting') {
    existing.lastActivityAt = now;
    return existing;
  }
  const s: PresentationSession = {
    userId: stableUserId(userId),
    groupId,
    startedAt: now,
    lastActivityAt: now,
    sourceMessageIds: [],
    collectedTexts: [],
    collectedMedia: [],
    trigger,
    status: 'collecting',
  };
  sessions.set(key, s);
  return s;
}

/** Sessão ativa (se houver) do usuário no grupo. */
export function getActiveSession(groupId: string, userId: string): PresentationSession | undefined {
  const s = sessions.get(sessionKey(groupId, userId));
  return s && s.status === 'collecting' ? s : undefined;
}

/** Registra uma mensagem na sessão. */
export function collectMessage(
  session: PresentationSession,
  messageId: string,
  text?: string,
  media?: { type: 'image' | 'other'; mediaType?: string },
  now: number = Date.now(),
): void {
  if (messageId && !session.sourceMessageIds.includes(messageId)) {
    session.sourceMessageIds.push(messageId);
  }
  if (text && text.trim()) session.collectedTexts.push(text.trim());
  if (media) session.collectedMedia.push({ type: media.type, messageId, mediaType: media.mediaType });
  session.lastActivityAt = now;
}

/** Sessões inativas há mais de `idleMs`. */
export function findStaleSessions(idleMs: number = DEFAULT_IDLE_MS, now: number = Date.now()): PresentationSession[] {
  const out: PresentationSession[] = [];
  for (const s of sessions.values()) {
    if (s.status === 'collecting' && now - s.lastActivityAt >= idleMs) out.push(s);
  }
  return out;
}

/**
 * Coleta uma mensagem para a sessão de apresentação do usuário.
 * Chamada pelo normalizer a cada mensagem recebida.
 */
/** Resultado da coleta quando uma sessão É ABERTA por esta mensagem. */
export interface CollectOpenInfo {
  opened: boolean;
  trigger: 'welcome_reply' | 'notice_reply' | 'signals';
  chatId: string;
  senderId: string;
  messageId: string;
  /** Texto da mensagem que abriu a sessão (para o quote da confirmação). */
  text: string;
}

export async function handlePresentationCollect(normMsg: any): Promise<CollectOpenInfo | null> {
  try {
    const { getOrCreateSession, getActiveSession, collectMessage, isCommunity085Group } =
      await import('./presentationService.js');
    const { isPresentationEnabled } = await import('./welcomeService.js');

    // CONTRATO: o normMsg do BaileysNormalizer usa `userId`/`id`; o coletor
    // histórico lia `senderId`/`messageId` (e o bug era silencioso — o gate
    // `!senderId` retornava antes de qualquer log). Aceitamos ambos.
    const chatId = normMsg?.chatId || '';
    const senderId = normMsg?.senderId || normMsg?.userId || '';
    const text = normMsg?.text || '';
    const messageId = normMsg?.messageId || normMsg?.id || '';
    const mediaType = normMsg?.mediaType;

    if (!chatId || !senderId || !chatId.includes('@g.us')) return null;
    if (normMsg?.isFromMe) return null; // não coleta mensagens do próprio bot

    // 1. Precisa estar na Comunidade 085
    const inCommunity = await isCommunity085Group(chatId);
    if (!inCommunity) return null;

    // 2. Precisa ter presentation_enabled = 1 no grupo
    const enabled = await isPresentationEnabled(chatId);
    if (!enabled) return null;

    /** Abre a sessão, coleta a mensagem, persiste row 'collecting' e retorna
     *  o contexto para o caller enviar a confirmação imediata no grupo. */
    const openAndCollect = async (trigger: CollectOpenInfo['trigger']): Promise<CollectOpenInfo> => {
      const s = getOrCreateSession(chatId, senderId, trigger);
      collectMessage(s, messageId, text, mediaType ? { type: mediaType === 'image' ? 'image' : 'other', mediaType } : undefined);
      // Persistência NA ABERTURA: a row 'collecting' fica visível na hora (o
      // usuário confere o DB sem esperar 10min). A consolidação re-upserta o
      // mesmo presentation_id com 'consolidated' → 'published'.
      try { await persistPresentation(s, {}, 'collecting'); } catch { /* não bloqueia a coleta */ }
      logger.info('[presentationCollect] sessão aberta', { chatId, senderId, trigger, messageId });
      return { opened: true, trigger, chatId, senderId, messageId, text };
    };

    // 3. Sessão já aberta → continua coletando (sem re-confirmar)
    const active = getActiveSession(chatId, senderId);
    if (active) {
      collectMessage(active, messageId, text, mediaType ? { type: mediaType === 'image' ? 'image' : 'other', mediaType } : undefined);
      return null;
    }

    // 4. Reply à mensagem de welcome → MUITO FORTE
    const quotedText = normMsg?.quotedText || '';
    if (quotedText) {
      const { getWelcomeMessage, DEFAULT_WELCOME } = await import('./welcomeService.js');
      const custom = await getWelcomeMessage(chatId);
      const template = custom ?? DEFAULT_WELCOME;
      // O template traz placeholders (@novato, {nome}) que a mensagem enviada já
      // resolveu — casa pelo trecho fixo do começo (vale p/ default e p/ custom).
      const fixedPrefix = template.split(/[{@]/)[0].trim();
      if (fixedPrefix && quotedText.startsWith(fixedPrefix)) {
        return openAndCollect('welcome_reply');
      }

      // 4b. Reply ao AVISO de apresentação (a msg que o bot manda no join,
      // quando presentation_enabled=1) → MUITO FORTE. O novato responde AO
      // AVISO com a apresentação — mesma semântica do welcome_reply.
      const { getPresentationMessage, composePresentationMessage } = await import('./welcomeService.js');
      const avisoCustom = await getPresentationMessage(chatId);
      const avisoTemplate = composePresentationMessage(avisoCustom ?? '');
      const avisoPrefix = avisoTemplate.split(/[{@]/)[0].trim();
      if (avisoPrefix && quotedText.startsWith(avisoPrefix)) {
        return openAndCollect('notice_reply');
      }
    }

    // 5. Gatilho contextual: ≥2 sinais de apresentação no texto
    const sinais = countPresentationSignals(text);
    if (sinais >= 2) {
      return openAndCollect('signals');
    }
    return null;
  } catch (e: any) {
    // Silencioso — não bloqueia o fluxo principal
    return null;
  }
}

/** Conta sinais de apresentação no texto (idade, trabalho, hobbies, etc.) */
export function countPresentationSignals(text: string): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  let count = 0;
  if (/\b(\d{1,3})\s*anos?\b/.test(t) || /tenho\s+\d+/.test(t)) count++;
  if (/trabalho|estudo|sou\s+\w+/.test(t)) count++;
  if (/gosto\s+de|hobbies?/.test(t)) count++;
  if (/@\w+/.test(t)) count++;
  return count;
}

/** Remove a sessão da memória (após consolidar). */
export function closeSession(groupId: string, userId: string): void {
  sessions.delete(sessionKey(groupId, userId));
}

// ─── Extração de campos (heurística, NUNCA inventa valor) ─────────────────

/**
 * Extrai campos estruturados do texto coletado.
 *
 * Regra: só preenche um campo quando o texto contém um MARCADOR explícito
 * ("tenho 24 anos", "trabalho com TI", "gosto de jogos"). Sem marcador, o campo
 * fica NULL — nunca adivinhado.
 */
export function extractFields(texts: string[]): Partial<PresentationRecord> {
  const full = texts.join('\n');
  const out: Partial<PresentationRecord> = {};

  // Idade: "tenho 24 anos", "24 anos", "idade: 24". INC-021: também "24"
  // isolado entre vírgulas ("Alberto, 24, não faço nada") — padrão informal
  // brasileiro de apresentação. O fallback da vírgula só roda sem "anos" no
  // texto e exige o número cercado de vírgulas (ou fim de linha), para não
  // pegar horários/contagens no meio da frase.
  const idade = full.match(/(?:tenho|idade[:\s]*)\s*(\d{1,3})\s*anos?/i)
    || full.match(/\b(\d{1,3})\s*anos\b/i)
    || full.match(/,\s*(\d{1,3})\s*(?:,|$)/m);
  if (idade) {
    const n = parseInt(idade[1], 10);
    if (n > 0 && n < 130) out.idade = n;
  }

  // Trabalho/estudo: "trabalho com TI", "estudo medicina", "sou programador"
  const trab = full.match(/(?:trabalho\s+(?:com|em|como)|estudo|sou)\s+([a-zà-ú0-9 .,&-]{3,40})/i);
  if (trab) out.trabalho = trab[1].trim().replace(/[.,;]+$/, '');

  // Hobbies: "gosto de X", "hobbies: X"
  const hob = full.match(/(?:gosto\s+de|hobbies?[:\s]*)\s*([a-zà-ú0-9 .,&-]{3,60})/i);
  if (hob) out.hobbies = hob[1].trim().replace(/[.,;]+$/, '');

  // Gênero/orientação: "hetero", "gay", "bi", "homem", "mulher"
  const gen = full.match(/\b(hetero|gay|bi|bissexual|homem|mulher|trans)\b/i);
  if (gen) out.genero = gen[1].toLowerCase();

  // Estado civil: "solteiro", "casado", "namorando"
  const ec = full.match(/\b(solteiro|casado|namorando|divorciado|viúvo)\b/i);
  if (ec) out.estado_civil = ec[1].toLowerCase();

  // Bairro: "bairro X", "moro no X"
  const bai = full.match(/(?:bairro|moro\s+no|moro\s+na)\s+([a-zà-ú0-9 .-]{3,40})/i);
  if (bai) out.bairro = bai[1].trim().replace(/[.,;]+$/, '');

  // Rede social: "@usuario"
  const nick = full.match(/@([a-zA-Z0-9._]{2,30})/);
  if (nick) out.rede_social = `@${nick[1]}`;

  // Nome: primeira linha curta sem marcador, se parecer nome.
  // ("primeira LINHA": mensagens multi-linha trazem o nome no começo —
  //  sem o split, a "linha" era o texto inteiro e o limite de 40 chars
  //  matava o nome em toda mensagem com \n.)
  const firstLine = ((texts[0] || '').split('\n')[0] || '').trim();
  // INC-021: linha única com vírgulas ("Caio Matos, 30 anos, trabalho...")
  // não passava no limite de 40 chars e o nome se perdia (row com nome NULL,
  // template publicado sem quem é). Se o pedaço antes de ", <n> anos" — ou
  // antes da 1ª vírgula — é curto, sem dígitos e sem saudação/verbo comum,
  // ele é o nome. Sem candidato confiável, fica sem nome: nome errado é pior
  // do que nome faltando.
  let nameCandidate: string | null = firstLine || null;
  if (nameCandidate && nameCandidate.includes(',')) {
    const beforeIdade = nameCandidate.split(/,\s*\d{1,3}\s*anos/)[0].trim();
    const firstComma = nameCandidate.split(',')[0].trim();
    const stop = /^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|eai|e ai|eu|sou|tenho|moro|trabalho|curto|gosto|meu|minha)\b/i;
    nameCandidate = [beforeIdade, firstComma].find((s) =>
      s && s.length <= 40 && !s.includes(',') && !/\d/.test(s)
      && s.split(/\s+/).length <= 5 && !stop.test(s)) || null;
  }
  if (nameCandidate && nameCandidate.length <= 40 && !/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|eai|e ai)\b/i.test(nameCandidate)) {
    out.nome = nameCandidate;
  }

  return out;
}

// ─── Persistência ──────────────────────────────────────────────────────────

function toRecord(s: PresentationSession, meta: {
  phoneNumber?: string; displayName?: string; groupId?: string; platform?: string;
}, status: PresentationStatus = 'consolidated'): PresentationRecord {
  const fields = extractFields(s.collectedTexts);
  const now = Date.now();
  return {
    presentation_id: `${s.groupId}|${s.userId}`,
    platform: meta.platform || 'whatsapp',
    group_id: s.groupId,
    user_id: s.userId,
    phone_number: meta.phoneNumber || null,
    display_name: meta.displayName || displayNameOf(undefined, s.userId),
    nome: fields.nome ?? null,
    idade: fields.idade ?? null,
    genero: fields.genero ?? null,
    trabalho: fields.trabalho ?? null,
    hobbies: fields.hobbies ?? null,
    bio: null,
    orientacao: null,
    estado_civil: fields.estado_civil ?? null,
    bairro: fields.bairro ?? null,
    rede_social: fields.rede_social ?? null,
    photo_ref: s.collectedMedia.find(m => m.type === 'image')?.messageId || null,
    photo_source: s.collectedMedia.some(m => m.type === 'image') ? 'sent' : null,
    original_text: s.collectedTexts.join('\n') || null,
    source_message_ids: JSON.stringify(s.sourceMessageIds),
    tg_chat_id: null,
    tg_thread_id: null,
    tg_message_id: null,
    status,
    created_at: s.startedAt,
    updated_at: now,
  };
}

/** Persiste a apresentação no SQLite (fonte oficial). */
export async function persistPresentation(
  s: PresentationSession,
  meta: { phoneNumber?: string; displayName?: string; platform?: string },
  status: PresentationStatus = 'consolidated',
): Promise<PresentationRecord> {
  const rec = toRecord(s, meta, status);
  const db = await getDb();
  await db.run(
    `INSERT INTO presentations (
      presentation_id, platform, group_id, user_id, phone_number, display_name,
      nome, idade, genero, trabalho, hobbies, bio, orientacao, estado_civil,
      bairro, rede_social, photo_ref, photo_source, original_text,
      source_message_ids, tg_chat_id, tg_thread_id, tg_message_id, status,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(platform, group_id, user_id) DO UPDATE SET
      phone_number = excluded.phone_number,
      display_name = excluded.display_name,
      nome = excluded.nome,
      idade = excluded.idade,
      genero = excluded.genero,
      trabalho = excluded.trabalho,
      hobbies = excluded.hobbies,
      bio = excluded.bio,
      orientacao = excluded.orientacao,
      estado_civil = excluded.estado_civil,
      bairro = excluded.bairro,
      rede_social = excluded.rede_social,
      photo_ref = excluded.photo_ref,
      photo_source = excluded.photo_source,
      original_text = excluded.original_text,
      source_message_ids = excluded.source_message_ids,
      tg_chat_id = excluded.tg_chat_id,
      tg_thread_id = excluded.tg_thread_id,
      tg_message_id = excluded.tg_message_id,
      status = excluded.status,
      updated_at = excluded.updated_at`,
    [
      rec.presentation_id, rec.platform, rec.group_id, rec.user_id, rec.phone_number, rec.display_name,
      rec.nome, rec.idade, rec.genero, rec.trabalho, rec.hobbies, rec.bio, rec.orientacao, rec.estado_civil,
      rec.bairro, rec.rede_social, rec.photo_ref, rec.photo_source, rec.original_text,
      rec.source_message_ids, rec.tg_chat_id, rec.tg_thread_id, rec.tg_message_id, rec.status,
      rec.created_at, rec.updated_at,
    ]
  );
  // Encerra a sessão em memória apenas na CONSOLIDAÇÃO real. O persist de
  // abertura (status 'collecting', 23/10) só espelha o estado no SQLite —
  // a sessão precisa continuar viva para as mensagens seguintes.
  if (status === 'consolidated') {
    s.status = 'consolidated';
  }
  return rec;
}

/** Marca como publicada no Telegram (com chat/thread/message id). */
export async function markPublished(
  presentationId: string,
  tgChatId: string,
  tgThreadId: string,
  tgMessageId: string,
): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE presentations SET tg_chat_id=?, tg_thread_id=?, tg_message_id=?, status='published', updated_at=? WHERE presentation_id=?`,
    [tgChatId, tgThreadId, tgMessageId, Date.now(), presentationId]
  );
}

/** Marca como falha (Telegram indisponível) — a apresentação NÃO se perde. */
export async function markFailed(presentationId: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE presentations SET status='failed', updated_at=? WHERE presentation_id=?`,
    [Date.now(), presentationId]
  );
}

/** Apresentações pendentes de publicação (retry). */
export async function listPending(): Promise<PresentationRecord[]> {
  const db = await getDb();
  return await db.all(
    `SELECT * FROM presentations WHERE status IN ('consolidated','failed') ORDER BY created_at`
  );
}

/** Busca por usuário+grupo (para evitar duplicata). */
export async function findByUser(groupId: string, userId: string): Promise<PresentationRecord | null> {
  const db = await getDb();
  const row = await db.get(
    `SELECT * FROM presentations WHERE group_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1`,
    [groupId, userId]
  );
  return row || null;
}

// ─── Comunidade 085 ────────────────────────────────────────────────────────

/** O grupo pertence à Comunidade 085? (relação real persistida) */
export async function isCommunity085Group(groupId: string): Promise<boolean> {
  return isGroupInCommunity(groupId, COMMUNITY_085_ID);
}

// ─── Consolidação (chamada pelo timer de inatividade) ─────────────────────

/**
 * Consolida sessões inativas: persiste no SQLite e retorna as que precisam
 * ser publicadas no Telegram.
 */
export async function consolidateStale(
  idleMs: number = DEFAULT_IDLE_MS,
  now: number = Date.now(),
): Promise<Array<{ record: PresentationRecord; session: PresentationSession }>> {
  const stale = findStaleSessions(idleMs, now);
  const out: Array<{ record: PresentationRecord; session: PresentationSession }> = [];
  for (const s of stale) {
    try {
      const rec = await persistPresentation(s, {});
      closeSession(s.groupId, s.userId);
      out.push({ record: rec, session: s });
    } catch (e: any) {
      logger.warn('[presentationService] consolidate falhou', {
        groupId: s.groupId, userId: s.userId, error: e?.message,
      });
    }
  }
  return out;
}

/** Estatísticas (para diagnóstico). */
export function stats(): { activeSessions: number; totalSessions: number } {
  return { activeSessions: sessions.size, totalSessions: sessions.size };
}
