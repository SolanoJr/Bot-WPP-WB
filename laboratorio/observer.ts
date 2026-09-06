/**
 * laboratorio/observer.ts
 *
 * Observador experimental silencioso para investigação de mensagens anômalas.
 *
 * FASE 1-12: Auditoria, captura de evento bruto, classificação, correlação entrada→mensagem,
 * detecção sem ação, fallback para tipos desconhecidos, logs isolados.
 *
 * REGRAS ABSOLUTAS:
 * - NÃO remove participantes
 * - NÃO bane
 * - NÃO faz kick
 * - NÃO apaga mensagens reais
 * - NÃO altera o AutoMod de produção
 * - NÃO faz deploy em produção
 *
 * Ativação: WPP_OBSERVATION_MODE=1 + WPP_OBSERVATION_GROUPS=<jid1>,<jid2>
 */

import { randomUUID } from 'node:crypto';
import { PlatformMessage } from '../src/platforms/base/PlatformTypes';
import { isForeignNumber } from '../src/services/autoModEngine';
import { isProtectedTarget } from '../src/services/permissions';
import logger from '../src/services/loggerService';
import fs from 'fs';
import path from 'path';

// ─── Configuração ────────────────────────────────────────────────────────────

const OBSERVATION_MODE = process.env.WPP_OBSERVATION_MODE === '1';
const OBSERVATION_GROUPS = (process.env.WPP_OBSERVATION_GROUPS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Grupos autorizados para investigação (configurados via env)
const ALLOWED_OBSERVATION_GROUPS = new Set(
  OBSERVATION_MODE ? [...OBSERVATION_GROUPS] : []
);

// Logger dedicado para observação — não polui log de produção
const obsLog = logger.child({
  component: 'OBSERVATION',
  mode: OBSERVATION_MODE ? 'ACTIVE' : 'INACTIVE',
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface RawBaileysEvent {
  rawMsg: any;
  groupJid: string;
  serverTimestamp: number;
  eventType: 'messages.upsert' | 'messages.update' | 'group-participants.update';
}

export interface NormalizedObservation {
  platformMsg: PlatformMessage;
  survivingFields: string[];
  lostFields: string[];
  lossReason: string;
}

export interface FullObservation {
  observationId: string;
  observedAt: Date;
  rawEvent: RawBaileysEvent;
  correlationId: string;
  detectedType: MessageTypeClassification;
  phases: {
    raw: Record<string, any>;
    normalized: NormalizedObservation;
  };
  detection: {
    detected: boolean;
    reason: string;
    signals: string[];
  };
  joinCorrelation?: {
    participant: string;
    joinTimestamp: number;
    firstMessageTimestamp: number;
    intervalMs: number;
    messagesAfterJoin: number;
  };
  comparison?: {
    baseline?: FullObservation;
    differsIn: string[];
  };
}

export type MessageTypeClassification =
  | { type: 'image'; subtype?: string }
  | { type: 'document'; subtype?: string }
  | { type: 'sticker'; subtype?: string }
  | { type: 'template'; subtype?: string }
  | { type: 'interactive'; subtype?: string }
  | { type: 'native_flow'; subtype?: string }
  | { type: 'button'; subtype?: string }
  | { type: 'link_preview'; subtype?: string }
  | { type: 'context'; subtype?: string }
  | { type: 'catalog'; subtype?: string }
  | { type: 'forwarded'; subtype?: string }
  | { type: 'mentioned'; subtype?: string }
  | { type: 'unknown'; subtype: string }
  | { type: 'text'; subtype?: string }
  | { type: 'multi'; subtypes: string[] };

// ─── Mapeador de tipos de mensagem ──────────────────────────────────────────

const KNOWN_MESSAGE_TYPES = new Set<string>([
  'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage',
  'audioMessage', 'documentMessage', 'stickerMessage', 'buttonsMessage',
  'listMessage', 'listResponseMessage', 'interactiveMessage', 'templateMessage',
  'locationMessage', 'contactMessage', 'liveLocationMessage', 'orderMessage',
  'productMessage', 'messageShare', 'reactionMessage', 'deletedMessage',
  'pillMessage', 'appMessage',
]);

export function classifyMessagePayload(rawMsg: any): MessageTypeClassification {
  const m = rawMsg?.message || {};
  const keys = Object.keys(m).filter(k => typeof m[k] === 'object' && m[k] !== null);

  if (keys.length === 0) {
    if (typeof m.conversation === 'string' && m.conversation.trim()) {
      return { type: 'text', subtype: 'conversation' };
    }
    return { type: 'unknown', subtype: 'empty-message' };
  }

  const knownKeys = keys.filter(k => KNOWN_MESSAGE_TYPES.has(k));

  if (knownKeys.length === 0) {
    return { type: 'unknown', subtype: `unknown-fields:${keys.join(',')}` };
  }

  if (knownKeys.length === 1) {
    const k = knownKeys[0];
    return { type: k as any, subtype: extractSubtype(m[k]) };
  }

  return {
    type: 'multi',
    subtypes: knownKeys.map(k => `${k}:${extractSubtype(m[k])}`),
  };
}

function extractSubtype(obj: any): string {
  if (!obj || typeof obj !== 'object') return 'unknown';
  const t = obj['messageType'] || obj['type'] || obj['phone'] || obj['mimeType'] || '';
  if (typeof t === 'string' && t.trim()) return t.trim();
  return 'unknown';
}

// ─── Captura detalhada do payload bruto ─────────────────────────────────────

/**
 * FASE 3: Captura detalhada do payload bruto recebido pelo Baileys.
 *
 * Extrai TODOS os campos relevantes para diagnóstico, sem expor
 * tokens, credenciais, cookies, sessão ou dados secretos.
 */
export interface DetailedObservationPayload {
  /** Identificador único desta observação */
  observationId: string;
  /** Timestamp de quando a observação foi criada */
  observedAt: string;
  /** Correlation ID */
  correlationId: string;
  /** Evento Baileys: messages.upsert | messages.update | group-participants.update */
  eventType: string;
  /** JID do grupo */
  groupJid: string;
  /** JID do remetente */
  senderJid: string;
  /** Se a mensagem é do próprio bot */
  fromMe: boolean;
  /** PushName (nome mostrado no WhatsApp) */
  pushName: string;
  /** Timestamp do servidor (ms) */
  serverTimestamp: number;
  /** messageId (key.id) */
  messageId: string;
  /** remoteJid */
  remoteJid: string;
  /** participant (remetente no grupo) */
  participant: string;
  /** messageStubType (se houver) */
  messageStubType: number | undefined;
  /** messageStubParameters (se houver) */
  messageStubParameters: any[];
  /** Chaves no msg.message */
  messageKeys: string[];
  /** Chaves no msg.key */
  keyKeys: string[];
  /** Tipo classificado da mensagem */
  messageType: MessageTypeClassification;
  /** Campos sensíveis filtrados */
  safePayload: Record<string, any>;
  /** Tipo de conteúdo principal */
  contentType: string;
  /** Tamanho aproximado do payload (para detectar mensagens gigantes) */
  payloadSize: number;
  /** Campos adicionais detectados */
  extraFields: string[];
  /** Se é mensagem de grupo */
  isGroup: boolean;
  /** Correlação com entrada de membro */
  joinCorrelation?: {
    participant: string;
    joinTimestamp: number;
    firstMessageTimestamp: number;
    intervalMs: number;
    messagesAfterJoin: number;
  };
  /** Sinais de suspeita */
  signals: string[];
  /** Detecção resumida */
  detected: boolean;
  /** Reason da detecção */
  reason: string;
}

export function captureDetailedPayload(event: {
  rawMsg: any;
  groupJid: string;
  senderJid: string;
  fromMe: boolean;
  pushName: string;
  messageTimestamp: number | undefined;
  eventType: string;
}): DetailedObservationPayload {
  const rawMsg = event.rawMsg;
  const m = rawMsg?.message || {};
  const key = rawMsg?.key || {};

  const messageId = key.id || '';
  const remoteJid = key.remoteJid || '';
  const participant = key.participant || '';
  const messageStubType = rawMsg.messageStubType;
  const messageStubParameters = rawMsg.messageStubParameters || [];

  const messageKeys = Object.keys(m).sort();
  const keyKeys = Object.keys(key).sort();

  const isGroup = remoteJid.endsWith('@g.us') || participant.endsWith('@g.us');

  // Conteúdo principal: qual campo tem o texto?
  let contentType = 'none';
  if (typeof m.conversation === 'string' && m.conversation.trim()) contentType = 'conversation';
  else if (m.extendedTextMessage) contentType = 'extendedTextMessage';
  else if (m.imageMessage) contentType = 'imageMessage';
  else if (m.videoMessage) contentType = 'videoMessage';
  else if (m.audioMessage) contentType = 'audioMessage';
  else if (m.documentMessage) contentType = 'documentMessage';
  else if (m.stickerMessage) contentType = 'stickerMessage';
  else if (m.buttonsMessage) contentType = 'buttonsMessage';
  else if (m.listMessage) contentType = 'listMessage';
  else if (m.listResponseMessage) contentType = 'listResponseMessage';
  else if (m.interactiveMessage) contentType = 'interactiveMessage';
  else if (m.templateMessage) contentType = 'templateMessage';
  else if (m.locationMessage) contentType = 'locationMessage';
  else if (m.contactMessage) contentType = 'contactMessage';
  else if (m.groupInviteMessage) contentType = 'groupInviteMessage';
  else if (m.poll) contentType = 'poll';
  else if (m.productMessage) contentType = 'productMessage';
  else if (m.orderMessage) contentType = 'orderMessage';
  else if (Object.keys(m).length > 0) contentType = 'other';

  // Extrairos marcadores do conteúdo para diagnóstico (sem expor dados sensíveis)
  const extraFields: string[] = [];

  if (m.extendedTextMessage) {
    const etm = m.extendedTextMessage as any;
    if (etm.linkPreview) extraFields.push('extendedTextMessage.linkPreview');
    if (etm.contextInfo) {
      if (etm.contextInfo.mentionedJidList?.length) extraFields.push('extendedTextMessage.contextInfo.mentionedJidList');
      if (etm.contextInfo.quotedMessage) extraFields.push('extendedTextMessage.contextInfo.quotedMessage');
      if (etm.contextInfo.externalAdherence) extraFields.push('extendedTextMessage.contextInfo.externalAdherence');
    }
    if (etm.contextInfo?.broadcast && etm.contextInfo.broadcast?.alive) extraFields.push('broadcast');
    if (etm.contextInfo?.isForwarded) extraFields.push('isForwarded');
  }

  if (m.buttonsMessage) extraFields.push('buttonsMessage');
  if (m.templateMessage) extraFields.push('templateMessage');
  if (m.interactiveMessage) extraFields.push('interactiveMessage');
  if (m.productMessage) extraFields.push('productMessage');
  if (m.orderMessage) extraFields.push('orderMessage');
  if (m.listMessage) extraFields.push('listMessage');

  if (rawMsg.pushName) extraFields.push('pushName (remote)');

  // Tipo classificado
  const messageType = classifyMessagePayload(rawMsg);

  // Sinais de suspeita
  const signals: string[] = [];
  const senderName = event.pushName || (rawMsg?.ack?.notify || '');

  // Sinal 1: tipo incomum
  if (messageType.type === 'unknown') signals.push('TIPO_DESCONHECIDO');

  // Sinal 2: foreign
  if (isForeignNumber(event.senderJid)) signals.push('FOREIGN_NUMBER');

  // Sinal 3: nome suspeito
  if (!event.pushName || event.pushName.trim() === '') signals.push('NOME_VAZIO');
  else if (/^(bot|robô|assistant|auto|spammer|spam|🤖)/i.test(event.pushName)) signals.push('NOME_SUSPEITO');

  // Sinal 4: link preview suspeito
  const linkPreview = m.extendedTextMessage?.linkPreview;
  if (linkPreview) {
    const url = linkPreview['canonical-url'] || linkPreview['matchedText'] || '';
    if (url) {
      signals.push(`LINK_PREVIEW:${extractDomain(url)}`);
      if (isSuspiciousDomain(extractDomain(url))) signals.push('LINK_SUSPEITOSO');
    }
  }

  // Sinal 5: forwarded / mentions
  const cinfo = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || {};
  if (cinfo.forwarded) signals.push('ENCAMINHADO');
  if (cinfo.mentionedJidList && cinfo.mentionedJidList.length > 0) signals.push('MENCOES');

  // Sinal 6: sem texto
  if (!platformMsgText(m)) signals.push('SEM_TEXTO');

  // Sinal 7: stub
  if (messageStubType) signals.push(`STUB_TYPE:${messageStubType}`);

  const payloadSize = JSON.stringify(rawMsg).length;

  const observationId = `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const correlationId = randomUUID();

  const detected = signals.length > 0;

  return {
    observationId,
    observedAt: new Date().toISOString(),
    correlationId,
    eventType: event.eventType,
    groupJid: event.groupJid,
    senderJid: event.senderJid,
    fromMe: event.fromMe,
    pushName: event.pushName,
    serverTimestamp: event.messageTimestamp ? Number(event.messageTimestamp) * 1000 : Date.now(),
    messageId,
    remoteJid,
    participant,
    messageStubType,
    messageStubParameters,
    messageKeys,
    keyKeys,
    messageType,
    safePayload: filterSensitiveFields(rawMsg),
    contentType,
    payloadSize,
    extraFields,
    isGroup,
    signals,
    detected,
    reason: detected ? `Sinais: ${signals.join(', ')}` : 'sem sinais de suspeita',
  };
}

// ─── Mapeamento de perda de informação ──────────────────────────────────────

export function mapInformationLoss(
  rawMsg: any,
  platformMsg: PlatformMessage,
): NormalizedObservation {
  const lost = new Set<string>();
  const m = rawMsg.message || {};

  // Tipos de mensagem sem texto extraível → filtrados por !body.trim()
  const textTypes = ['conversation', 'extendedTextMessage', 'imageMessage',
    'videoMessage', 'buttonsMessage', 'listResponseMessage', 'templateButtonReplyMessage'];
  for (const k of Object.keys(m)) {
    if (textTypes.includes(k)) continue;
    if (k === 'extendedTextMessage' && m.extendedTextMessage?.text) continue;
    if (k === 'imageMessage' && m.imageMessage?.caption) continue;
    if (k === 'videoMessage' && m.videoMessage?.caption) continue;
    if (k === 'audioMessage') continue;
    if (k === 'stickerMessage') { lost.add(`message.${k} (sticker sem texto)`); continue; }
    if (k === 'documentMessage') { lost.add(`message.${k} (documento)`); continue; }
    if (k === 'buttonsMessage') {
      // Botões mapeados para texto mas sem estrutura
      lost.add(`message.${k}.buttons (estrutura de botões)`);
      continue;
    }
    if (k === 'listMessage') { lost.add(`message.${k} (lista)`); continue; }
    if (k === 'listResponseMessage' && m.listResponseMessage?.title) continue;
    if (k === 'interactiveMessage') { lost.add(`message.${k} (estrutura interativa)`); continue; }
    if (k === 'templateMessage') { lost.add(`message.${k} (template)`); continue; }
    if (k === 'locationMessage') { lost.add(`message.${k} (localização)`); continue; }
    if (k === 'orderMessage') { lost.add(`message.${k} (pedido)`); continue; }
    if (k === 'productMessage') { lost.add(`message.${k} (produto)`); continue; }
    if (k === 'liveLocationMessage') { lost.add(`message.${k} (localização ao vivo)`); continue; }
    if (k === 'pillMessage') { lost.add(`message.${k} (pill)`); continue; }
    if (k === 'appMessage') { lost.add(`message.${k} (app-specific)`); continue; }
    if (k === 'messageShare') { lost.add(`message.${k} (compartilhamento)`); continue; }
    if (k === 'reactionMessage') { lost.add(`message.${k} (reação)`); continue; }
    if (k === 'deletedMessage') { lost.add(`message.${k} (deletada)`); continue; }
    lost.add(`message.${k} (tipo desconhecido)`);
  }

  // Campos específicos que podem ser perdidos
  if (m.extendedTextMessage?.linkPreview && !platformMsg.text.includes('[linkPreview]')) {
    lost.add('message.extendedTextMessage.linkPreview (metadados completos)');
  }

  if (m.extendedTextMessage?.contextInfo?.quotedMessage && !platformMsg.quotedText && !platformMsg.replyToMessageId) {
    lost.add('message.contextInfo.quotedMessage (mensagem citada)');
  }

  const mentioned = m.extendedTextMessage?.contextInfo?.mentionedJidList || [];
  if (mentioned.length > 0 && (!platformMsg.mentions || platformMsg.mentions.length === 0)) {
    lost.add('message.contextInfo.mentionedJidList (mentions)');
  }

  if (rawMsg.messageStubType || (rawMsg.messageStubParameters && rawMsg.messageStubParameters.length > 0)) {
    lost.add('messageStubType/messageStubParameters (filtrado por hasStub)');
  }

  if (!platformMsg.text || !platformMsg.text.trim()) {
    lost.add('body vazio → filtrado em dispatchMessage()');
  }

  const surviving = new Set([
    'id', 'chatId', 'userId', 'text', 'timestamp', 'isFromMe', 'isCommand',
    'mentions', 'replyToMessageId', 'quotedFromMe', 'quotedParticipant', 'quotedText',
    'hasMedia', 'correlationId', 'raw',
  ]);

  return {
    platformMsg,
    survivingFields: [...surviving],
    lostFields: [...Array.from(lost)],
    lossReason: loseReason(Array.from(lost)),
  };
}

function loseReason(lost: string[]): string {
  if (lost.length === 0) return 'sem perda detectada';
  const reasons: string[] = [];
  for (const l of lost) {
    if (l.includes('messageStubType') || l.includes('messageStubParameters')) {
      reasons.push(`${l} — filtro hasStub: mensagem de sistema/stub ignorada`);
    } else if (l.includes('body vazio')) {
      reasons.push(`${l} — mensagem sem texto extraível, ignorada em dispatchMessage()`);
    } else if (l.includes('linkPreview')) {
      reasons.push(`${l} — metadados de link preview não mapeados`);
    } else if (l.includes('buttons')) {
      reasons.push(`${l} — estrutura de botões não preservada na normalização`);
    } else if (l.includes('interactiveMessage')) {
      reasons.push(`${l} — mensagem interativa não mapeada para PlatformMessage`);
    } else if (l.includes('quotedMessage')) {
      reasons.push(`${l} — mensagem citada não capturada`);
    } else if (l.includes('mentionedJidList')) {
      reasons.push(`${l} — menções não mapeadas`);
    } else if (l.startsWith('message.')) {
      reasons.push(`${l} — tipo de mensagem sem texto extraível, filtrado`);
    } else {
      reasons.push(`${l} — campo não mapeado na normalização`);
    }
  }
  return reasons.join('; ');
}

// ─── Detecção experimental sem ação ─────────────────────────────────────────

export function detectSuspiciousMessage(
  rawMsg: any,
  classification: MessageTypeClassification,
  senderJid: string,
  senderName: string,
  groupJid: string,
): { detected: boolean; reason: string; signals: string[] } {
  const signals: string[] = [];
  const m = rawMsg.message || {};

  // Sinal 1: tipo de mensagem incomum
  if (classification.type === 'unknown') {
    signals.push('TIPO_DESCONHECIDO');
  } else if (classification.type === 'interactive') {
    signals.push('INTERACTIVE_MESSAGE');
  } else if (classification.type === 'multi') {
    signals.push('MULTI_TIPO');
  } else if (classification.type === 'sticker') {
    signals.push('STICKER');
  } else if (classification.type === 'document') {
    signals.push('DOCUMENTO');
  } else if (classification.type === 'image') {
    signals.push(m.imageMessage?.caption ? 'IMAGE_COM_CAPTION' : 'IMAGE_SEM_CAPTION');
  }

  // Sinal 2: número estrangeiro
  if (isForeignNumber(senderJid)) {
    signals.push('FOREIGN_NUMBER');
  }

  // Sinal 3: nome suspeito
  if (!senderName || senderName.trim() === '') {
    signals.push('NOME_VAZIO');
  } else if (/^(bot|robô|assistant|auto|spammer|spam|🤖)/i.test(senderName)) {
    signals.push('NOME_SUSPEITO');
  }

  // Sinal 4: botão
  if (classification.type === 'button' || classification.type === 'multi' &&
      classification.subtypes.some(s => s.startsWith('buttonsMessage'))) {
    signals.push('BOTAO');
  }

  // Sinal 5: link preview
  const linkPreview = m.extendedTextMessage?.linkPreview;
  if (linkPreview) {
    const url = linkPreview['canonical-url'] || linkPreview['matchedText'] || '';
    if (url) {
      signals.push(`LINK_PREVIEW:${extractDomain(url)}`);
      if (isSuspiciousDomain(extractDomain(url))) {
        signals.push('LINK_SUSPEITOSO');
      }
    }
  }

  // Sinal 6: encaminhado / menções
  const cinfo = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || {};
  if (cinfo.forwarded) signals.push('ENCAMINHADO');
  if (cinfo.mentionedJidList && cinfo.mentionedJidList.length > 0) signals.push('MENCOES');

  // Sinal 7: sem texto
  if (!platformMsgText(m)) {
    signals.push('SEM_TEXTO');
  }

  // Sinal 8: stub type
  if (rawMsg.messageStubType) {
    signals.push(`STUB_TYPE:${rawMsg.messageStubType}`);
  }

  const detected = signals.length > 0;

  return {
    detected,
    reason: detected ? `Sinais: ${signals.join(', ')}` : 'sem sinais de suspeita',
    signals,
  };
}

function platformMsgText(m: any): string {
  return m.conversation || m.extendedTextMessage?.text || m.extendedTextMessage?.caption ||
    m.imageMessage?.caption || m.videoMessage?.caption || m.buttonsMessage?.contentText ||
    m.listResponseMessage?.title || m.templateButtonReplyMessage?.selectedDisplayText || '';
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return url.split('/')[0]; }
}

const SUSPICIOUS_DOMAINS = new Set([
  'wtf', 'bet', 'game', 'win', 'xyz', 'top', 'click',
  'casino', 'bonus', 'aposta', 'vareja', 'sport', 'jackpot',
  'slots', 'poker', 'bing', 'lucky', 'vip', 'gratuito',
]);

function isSuspiciousDomain(host: string): boolean {
  const name = host.split('.')[0].toLowerCase();
  return SUSPICIOUS_DOMAINS.has(name);
}

// ─── Correlação entrada → primeira mensagem ─────────────────────────────────

const joinEvents = new Map<string, { participant: string; timestamp: number; groupId: string }>();
const messageCountsAfterJoin = new Map<string, number>();

export function recordJoinEvent(
  participant: string,
  groupId: string,
  timestamp: number,
): void {
  const key = `${groupId}:${participant}`;
  joinEvents.set(key, { participant, timestamp, groupId });
  messageCountsAfterJoin.set(key, 0);
  obsLog.info(`[OBSERVATION][JOIN] ${participant} entrou em ${groupId} às ${new Date(timestamp).toISOString()}`);
}

export function recordMessageAfterJoin(
  senderJid: string,
  groupId: string,
  messageTimestamp: number,
): { intervalMs: number; count: number } | null {
  for (const [key, join] of joinEvents.entries()) {
    const [joinGroup, joinParticipant] = key.split(':');
    if (joinGroup === groupId && joinParticipant === senderJid) {
      const intervalMs = messageTimestamp - join.timestamp;
      const count = (messageCountsAfterJoin.get(key) || 0) + 1;
      messageCountsAfterJoin.set(key, count);
      obsLog.info(`[OBSERVATION][CORRELATION] ${senderJid}→${groupId}: entrada=${new Date(join.timestamp).toISOString()}, msg=${new Date(messageTimestamp).toISOString()}, intervalo=${intervalMs}ms, msgs=${count}`);
      return { intervalMs, count };
    }
  }
  return null;
}

export function getJoinEventsForGroup(groupId: string): Array<{ participant: string; timestamp: number }> {
  const results: Array<{ participant: string; timestamp: number }> = [];
  for (const [key, join] of joinEvents.entries()) {
    const [joinGroup] = key.split(':');
    if (joinGroup === groupId) {
      results.push({ participant: join.participant, timestamp: join.timestamp });
    }
  }
  return results;
}

// ─── Teste controlado ────────────────────────────────────────────────────────

export function compareMessages(
  baseline: FullObservation,
  suspect: FullObservation,
): { differsIn: string[]; summary: string } {
  const differs: string[] = [];

  if (baseline.detectedType.type !== suspect.detectedType.type) {
    differs.push(`tipo: ${baseline.detectedType.type} vs ${suspect.detectedType.type}`);
  }
  if (baseline.phases.normalized.lostFields.join(',') !== suspect.phases.normalized.lostFields.join(',')) {
    differs.push('campos perdidos diferem');
  }
  if (baseline.detection.signals.join(',') !== suspect.detection.signals.join(',')) {
    differs.push('sinais de detecção diferem');
  }

  return {
    differsIn: differs,
    summary: differs.length > 0
      ? `Diferem em: ${differs.join(', ')}`
      : 'Estruturalmente similares nos campos observados',
  };
}

// ─── Fallback para tipos desconhecidos ──────────────────────────────────────

export function handleUnknownMessage(
  rawMsg: any,
  groupJid: string,
  observationId: string,
): void {
  obsLog.warn(`[OBSERVATION][UNKNOWN_MESSAGE_TYPE] observationId=${observationId} group=${groupJid} msgKey=${rawMsg?.key?.id} keys=${Object.keys(rawMsg?.message || {}).join(',')}`);
}

// ─── Logging isolado ─────────────────────────────────────────────────────────

const LOG_DIR = path.join(process.cwd(), 'laboratorio');
const LOG_FILE = path.join(LOG_DIR, 'observation.log');

function ensureLogFile(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf-8');
}

export function logObservation(obs: DetailedObservationPayload): void {
  ensureLogFile();
  const entry = {
    observationId: obs.observationId,
    observedAt: obs.observedAt,
    correlationId: obs.correlationId,
    eventType: obs.eventType,
    groupJid: obs.groupJid,
    senderJid: obs.senderJid,
    fromMe: obs.fromMe,
    pushName: obs.pushName,
    messageId: obs.messageId,
    messageType: obs.messageType,
    contentType: obs.contentType,
    contentTypeDetail: obs.contentType,
    isGroup: obs.isGroup,
    payloadSize: obs.payloadSize,
    messageKeys: obs.messageKeys.join(','),
    keyKeys: obs.keyKeys.join(','),
    detection: {
      detected: obs.detected,
      reason: obs.reason,
      signals: obs.signals,
    },
    joinCorrelation: obs.joinCorrelation,
    extraFields: obs.extraFields,
    messageStubType: obs.messageStubType,
    safePayloadKeys: Object.keys(obs.safePayload).join(','),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf-8');
  obsLog.debug(`[OBSERVATION] registrada: ${obs.observationId}`);
}

function filterSensitiveFields(raw: any): Record<string, any> {
  const safe: any = {};
  const blacklist = ['cookie', 'token', 'session', 'credentials', 'key', 'secret'];
  for (const [k, v] of Object.entries(raw)) {
    if (blacklist.some(b => k.toLowerCase().includes(b))) {
      safe[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      safe[k] = filterSensitiveFields(v);
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

// ─── Hook de observação ─────────────────────────────────────────────────────

interface ObserverHookEvent {
  rawMsg: any;
  groupJid: string;
  senderJid: string;
  fromMe: boolean;
  pushName: string;
  messageTimestamp: number | undefined;
  eventType: string;
}

let observerHook: ((event: ObserverHookEvent) => void) | null = null;

export function setObserverHook(hook: (event: ObserverHookEvent) => void): void {
  observerHook = hook;
  obsLog.info('[OBSERVATION] hook registrado');
}

export function callObserverHook(event: ObserverHookEvent): void {
  if (observerHook) {
    try {
      observerHook(event);
    } catch (err: any) {
      obsLog.error(`[OBSERVATION] erro no hook: ${err?.message}`);
    }
  }
}

// ─── Pipeline padrão de observação ──────────────────────────────────────────

/**
 * Pipeline padrão que implementa todo o fluxo de observação:
 * 1. Captura detalhada do payload bruto (FASE 3)
 * 2. Classificação do tipo de mensagem (FASE 4)
 * 3. Detecção experimental sem ação (FASE 4)
 * 4. Correlação com entrada de membro (FASE 6)
 * 5. Registro no log isolado (FASE 9)
 *
 * NÃO toma nenhuma ação destrutiva.
 */
function defaultObserverPipeline(event: ObserverHookEvent): void {
  // FASE 3: Captura detalhada
  const detail = captureDetailedPayload(event);

  // FASE 4: Detecção experimental
  const detection = detectSuspiciousMessage(
    event.rawMsg,
    detail.messageType,
    event.senderJid,
    event.pushName,
    event.groupJid,
  );

  // FASE 6: Correlação com entrada (se houver join recente)
  const joinCorrelation = recordMessageAfterJoin(
    event.senderJid,
    event.groupJid,
    detail.serverTimestamp,
  );

  // Montar observação completa para log
  const obs = {
    ...detail,
    signals: detection.signals,
    detected: detection.detected,
    reason: detection.reason,
    joinCorrelation: joinCorrelation ? {
      participant: event.senderJid,
      joinTimestamp: 0,
      firstMessageTimestamp: detail.serverTimestamp,
      intervalMs: joinCorrelation.intervalMs,
      messagesAfterJoin: joinCorrelation.count,
    } : undefined,
  };

  // FASE 9: Log no arquivo isolado (sempre)
  logObservation(obs);

  // Console.debug somente para detecções (não polui produção com mensagens normais)
  if (obs.detected) {
    console.debug(
      `[OBSERVATION] ${obs.observationId} ` +
      `group=${obs.groupJid} sender=${obs.senderJid} ` +
      `detected=${obs.detected} signals=${obs.signals.join(',')} ` +
      `contentType=${obs.contentType} messageType=${obs.messageType.type}`
    );
  }
}

/**
 * Inicializa o módulo de observação.
 * Registra o pipeline padrão se nenhum hook customizado foi configurado.
 */
export function initializeObservation(): void {
  if (!OBSERVATION_MODE) {
    obsLog.info('[OBSERVATION] modo desativado (WPP_OBSERVATION_MODE != 1)');
    return;
  }
  if (ALLOWED_OBSERVATION_GROUPS.size === 0) {
    obsLog.warn('[OBSERVATION] nenhum grupo autorizado. Configure WPP_OBSERVATION_GROUPS.');
    return;
  }
  obsLog.info(`[OBSERVATION] inicializado. Grupos: ${[...ALLOWED_OBSERVATION_GROUPS].join(', ')}`);
  if (!observerHook) {
    setObserverHook(defaultObserverPipeline);
  }
}

// ─── Ações experimentais de laboratório (FASE 5-6) ──────────────────────────

/**
 * FASE 5: Exclusão experimental de mensagem no grupo autorizado.
 *
 * REGRAS:
 * - SOMENTE grupos em WPP_OBSERVATION_GROUPS
 * - NÃO remove usuário
 * - NÃO bane
 * - NÃO responde no grupo
 * - Verifica isProtectedTarget antes
 * - Usa API existente de sendMessage com delete
 *
 * @param adapter Adapter com sendMessage()

 * @returns { success, error, messageId, groupId, correlationId }
 */
export async function deleteTestMessage(
  adapter: any,
  groupJid: string,
  messageId: string,
  senderJid: string,
): Promise<{ success: boolean; error?: string; messageId: string; groupId: string; correlationId: string }> {
  // 1. Verificar grupo autorizado
  if (!ALLOWED_OBSERVATION_GROUPS.has(groupJid)) {
    return {
      success: false,
      error: `GRUPO_NAO_AUTORIZADO: ${groupJid}`,
      messageId,
      groupId: groupJid,
      correlationId: randomUUID(),
    };
  }

  // 2. Verificar isProtectedTarget (bot/dono NÃO podem ser alvo)
  if (isProtectedTarget(senderJid)) {
    return {
      success: false,
      error: `ALVO_PROTEGIDO: ${senderJid}`,
      messageId,
      groupId: groupJid,
      correlationId: randomUUID(),
    };
  }

  // 3. Verificar que o adapter tem sendMessage
  if (!adapter || typeof adapter.sendMessage !== 'function') {
    return {
      success: false,
      error: 'ADAPTER_INVALIDO: sem sendMessage',
      messageId,
      groupId: groupJid,
      correlationId: randomUUID(),
    };
  }

  const correlationId = randomUUID();

  try {
    // 4. Usar API existente do Baileys para apagar mensagem
    // sendMessage(jid, '', { delete: { id, fromMe, participant } })
    await adapter.sendMessage(groupJid, '', {
      delete: {
        id: messageId,
        fromMe: false, // mensagem de TERCEIRO
        participant: senderJid,
      },
    });

    obsLog.info(`[OBSERVATION][DELETE_TEST] sucesso: msg=${messageId} grupo=${groupJid} remetente=${senderJid} correlationId=${correlationId}`);

    return {
      success: true,
      messageId,
      groupId: groupJid,
      correlationId,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    obsLog.error(`[OBSERVATION][DELETE_TEST] falha: msg=${messageId} grupo=${groupJid} remetente=${senderJid} error=${errorMsg} correlationId=${correlationId}`);

    return {
      success: false,
      error: errorMsg,
      messageId,
      groupId: groupJid,
      correlationId,
    };
  }
}

/**
 * FASE 6: Remoção experimental de participante no grupo "Teste".
 *
 * REGRAS:
 * - SOMENTE grupo "Teste" (configurado separadamente)
 * - NÃO bane — apenas remove do grupo
 * - Verifica isProtectedTarget antes
 * - Usa API existente do Baileys
 *
 * @param adapter BaileysAdapter com removeParticipant()
 * @param testGroupJid JID do grupo "Teste"
 * @param targetJid JID do participante a remover
 * @returns { success, error, targetJid, groupId, correlationId }
 */
export async function removeTestParticipant(
  adapter: any,
  testGroupJid: string,
  targetJid: string,
): Promise<{ success: boolean; error?: string; targetJid: string; groupId: string; correlationId: string }> {
  // Verifica se grupo de teste está configurado
  const TEST_GROUP_CONFIGURED = process.env.WPP_TEST_GROUP_ID === testGroupJid;

  if (!TEST_GROUP_CONFIGURED) {
    return {
      success: false,
      error: `GRUPO_NAO_AUTORIZADO_PARA_REMOVAL: ${testGroupJid}`,
      targetJid,
      groupId: testGroupJid,
      correlationId: randomUUID(),
    };
  }

  // 2. Verificar isProtectedTarget (bot/dono NÃO podem ser alvo)
  if (isProtectedTarget(targetJid)) {
    return {
      success: false,
      error: `ALVO_PROTEGIDO: ${targetJid}`,
      targetJid,
      groupId: testGroupJid,
      correlationId: randomUUID(),
    };
  }

  // 3. Verificar que o adapter tem removeParticipant
  if (!adapter || typeof adapter.removeParticipant !== 'function') {
    return {
      success: false,
      error: 'ADAPTER_INVALIDO: sem removeParticipant',
      targetJid,
      groupId: testGroupJid,
      correlationId: randomUUID(),
    };
  }

  const correlationId = randomUUID();

  try {
    // 4. Usar API existente do Baileys para remover participante
    await adapter.removeParticipant(testGroupJid, targetJid);

    obsLog.info(`[OBSERVATION][REMOVE_TEST] sucesso: alvo=${targetJid} grupo=${testGroupJid} correlationId=${correlationId}`);

    return {
      success: true,
      targetJid,
      groupId: testGroupJid,
      correlationId,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    obsLog.error(`[OBSERVATION][REMOVE_TEST] falha: alvo=${targetJid} grupo=${testGroupJid} error=${errorMsg} correlationId=${correlationId}`);

    return {
      success: false,
      error: errorMsg,
      targetJid,
      groupId: testGroupJid,
      correlationId,
    };
  }
}

/**
 * Verifica se um JID pertence aos grupos autorizados para observação.
 */
export function isObservationGroup(groupJid: string): boolean {
  return ALLOWED_OBSERVATION_GROUPS.has(groupJid);
}

/**
 * Retorna lista de grupos autorizados para observação.
 */
export function getObservationGroups(): string[] {
  return [...ALLOWED_OBSERVATION_GROUPS];
}

/**
 * Verifica se o modo de observação está ativo.
 */
export function isObservationModeActive(): boolean {
  return OBSERVATION_MODE;
}



