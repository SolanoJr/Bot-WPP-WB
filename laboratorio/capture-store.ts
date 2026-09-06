/**
 * laboratorio/capture-store.ts
 *
 * Persistência síncrona de WAMessageKey completa para mensagens recebidas
 * pelo Baileys, escrita no handler 'messages.upsert' do BaileysAdapter.
 *
 * Formato: JSONL append-only em laboratorio/captured-messages.jsonl
 * Cada linha = um JSON com a chave completa da mensagem.
 *
 * NÃO expõe tokens, credenciais, cookies ou auth state.
 * NÃO bloqueia o caminho de processamento da mensagem.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const CAPTURE_DIR = path.join(process.cwd(), 'laboratorio');
const CAPTURE_FILE = path.join(CAPTURE_DIR, 'captured-messages.jsonl');

// Campos que NUNCA devem entrar no JSONL (credenciais, tokens, sessão)
const REDACTED_KEYS = new Set([
  'creds', 'keys', 'cookie', 'session', 'token', 'secret',
  'routingInfo', 'noiseKey', 'signedIdentityKey', 'preKey',
  'signedPreKey', 'identityKey', 'browser', 'userAgent',
  'deviceList', 'lids', 'pn_map',
]);

export interface CapturedMessage {
  captureId: string;
  capturedAt: string;
  groupId: string;
  messageId: string;
  remoteJid: string;
  participant: string;
  fromMe: boolean;
  timestamp: number;
  messageType: string;
  contentType: string;
  senderJid: string;
  isGroup: boolean;
  pushName: string;
  size: number;
}

/** Detecção simples do tipo principal da mensagem */
function detectContentType(m: Record<string, any>): string {
  if (m.buttonsMessage) return 'buttonsMessage';
  if (m.interactiveMessage) return 'interactiveMessage';
  if (m.templateMessage) return 'templateMessage';
  if (m.productMessage) return 'productMessage';
  if (m.orderMessage) return 'orderMessage';
  if (m.listMessage) return 'listMessage';
  if (m.listResponseMessage) return 'listResponseMessage';
  if (m.imageMessage) return 'imageMessage';
  if (m.videoMessage) return 'videoMessage';
  if (m.audioMessage) return 'audioMessage';
  if (m.documentMessage) return 'documentMessage';
  if (m.stickerMessage) return 'stickerMessage';
  if (m.locationMessage) return 'locationMessage';
  if (m.contactMessage) return 'contactMessage';
  if (m.poll) return 'poll';
  if (m.liveLocationMessage) return 'liveLocationMessage';
  if (m.messageShare) return 'messageShare';
  if (m.reactionMessage) return 'reactionMessage';
  if (m.groupInviteMessage) return 'groupInviteMessage';
  if (m.extendedTextMessage) return 'extendedTextMessage';
  if (typeof m.conversation === 'string' && m.conversation.trim()) return 'conversation';
  if (Object.keys(m).length > 0) return 'other';
  return 'none';
}

/** Detecção simples da categoria de tipo */
function detectMessageType(m: Record<string, any>): string {
  if (m.buttonsMessage) return 'button';
  if (m.interactiveMessage) return 'interactive';
  if (m.templateMessage) return 'template';
  if (m.productMessage) return 'product';
  if (m.listMessage || m.listResponseMessage) return 'list';
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage) return 'document';
  if (m.stickerMessage) return 'sticker';
  if (m.locationMessage) return 'location';
  if (m.contactMessage) return 'contact';
  if (m.poll) return 'poll';
  if (m.messageShare) return 'share';
  if (m.reactionMessage) return 'reaction';
  if (m.groupInviteMessage) return 'groupInvite';
  if (m.extendedTextMessage) return 'extendedText';
  if (typeof m.conversation === 'string' && m.conversation.trim()) return 'text';
  if (Object.keys(m).length > 0) return 'unknown';
  return 'empty';
}

function sanitizeRecord(record: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(record)) {
    if (REDACTED_KEYS.has(k)) continue;
    if (typeof v === 'object' && v !== null) {
      if (Array.isArray(v)) {
        safe[k] = v.filter((x: any) => x != null).slice(0, 20).map((x: any) =>
          typeof x === 'object' ? sanitizeRecord(x as Record<string, any>) : x
        );
      } else {
        safe[k] = sanitizeRecord(v as Record<string, any>);
      }
    } else if (typeof v === 'string') {
      safe[k] = v.length > 500 ? v.slice(0, 500) + '...' : v;
    } else {
      safe[k] = v;
    }
    // Limitar profundidade de chaves do message
    if (k === 'message' && typeof v === 'object' && v !== null) {
      const msg = v as Record<string, any>;
      const msgKeys = Object.keys(msg).slice(0, 30);
      safe[k] = {};
      for (const mk of msgKeys) {
        if (REDACTED_KEYS.has(mk)) continue;
        const mv = msg[mk];
        safe[k][mk] = typeof mv === 'object' && mv !== null
          ? JSON.parse(JSON.stringify(mv, (kp, vv) => {
              if (kp.startsWith('secret') || kp.startsWith('cookie') || kp.startsWith('token')) return undefined;
              return vv;
            }))
          : mv;
      }
    }
  }
  return safe;
}

/** Captura uma mensagem recebida e a persiste no JSONL.
 *
 * Chamar no handler 'messages.upsert', ANTES do dispatch/normalização.
 * Não falha se o arquivo não puder ser escrito (apenas loga).
 */
export function capture(rawMsg: any, botUserId: string): void {
  const key = rawMsg?.key || {};
  const m = rawMsg?.message || {};

  const messageId = key.id || '';
  const remoteJid = key.remoteJid || '';
  const participant = key.participant || '';
  const fromMe = !!key.fromMe;
  const timestamp = rawMsg.messageTimestamp
    ? Number(rawMsg.messageTimestamp) * 1000
    : Date.now();

  if (!messageId || !remoteJid && !participant) return;

  // senderJid: quem enviou na prática
  let senderJid: string;
  if (fromMe) {
    senderJid = botUserId;
  } else if (participant && participant.endsWith('@g.us')) {
    // Grupo com LID: o remetente real é o remoteJid
    senderJid = remoteJid || participant;
  } else {
    senderJid = participant || remoteJid;
  }

  const isGroup = remoteJid.endsWith('@g.us') || participant.endsWith('@g.us');
  const pushName = rawMsg.pushName || '';

  const capture: CapturedMessage = {
    captureId: randomUUID(),
    capturedAt: new Date().toISOString(),
    groupId: remoteJid || participant,
    messageId,
    remoteJid,
    participant,
    fromMe,
    timestamp,
    messageType: detectMessageType(m),
    contentType: detectContentType(m),
    senderJid,
    isGroup,
    pushName,
    size: JSON.stringify(rawMsg).length,
  };

  try {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    const safePayload = sanitizeRecord(rawMsg as Record<string, any>);
    const line = JSON.stringify({
      ...capture,
      rawPayloadSafe: safePayload,
    }, null, 0).slice(0, 50000) + '\n'; // limita a 50KB por linha
    fs.appendFileSync(CAPTURE_FILE, line, 'utf-8');
  } catch (err: any) {
    // Silencioso — não quebrar o caminho de processamento da mensagem
    console.error(`[CAPTURE] erro ao persistir message ${messageId}: ${err?.message}`);
  }
}

/** Lê todas as capturas do JSONL */
export function readCaptures(): CapturedMessage[] {
  if (!fs.existsSync(CAPTURE_FILE)) return [];
  try {
    const text = fs.readFileSync(CAPTURE_FILE, 'utf-8').trim();
    if (!text) return [];
    const lines = text.split('\n').filter(Boolean);
    return lines.map((line: string) => {
      try {
        return JSON.parse(line) as CapturedMessage;
      } catch {
        return null as any;
      }
    }).filter((c: any): c is CapturedMessage => c != null);
  } catch {
    return [];
  }
}

/** Filtra capturas por grupo */
export function capturesByGroup(groupJid: string): CapturedMessage[] {
  return readCaptures().filter(
    (c) => c.groupId === groupJid || c.remoteJid === groupJid || c.participant === groupJid
  );
}

/** Mostra as capturas no stdout no formato legível */
export function printCaptures(groupJid?: string): void {
  const entries = groupJid ? capturesByGroup(groupJid) : readCaptures();
  if (entries.length === 0) {
    console.log(groupJid
      ? `Nenhuma captura para o grupo ${groupJid}.`
      : 'Arquivo de capturas vazio ou inexistente.');
    return;
  }
  console.log(`\n═══ Capturas: ${entries.length} registro(s) ═══\n`);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    console.log(`[${i + 1}] ${e.captureId}`);
    console.log(`    grupo:       ${e.groupId}`);
    console.log(`    messageId:   ${e.messageId}`);
    console.log(`    remoteJid:   ${e.remoteJid}`);
    console.log(`    participant: ${e.participant}`);
    console.log(`    fromMe:      ${e.fromMe}`);
    console.log(`    senderJid:   ${e.senderJid}`);
    console.log(`    timestamp:   ${new Date(e.timestamp).toISOString()} (${e.timestamp})`);
    console.log(`    tipo:        ${e.messageType}`);
    console.log(`    conteúdo:    ${e.contentType}`);
    console.log(`    pushName:    "${e.pushName}"`);
    console.log(`    isGroup:     ${e.isGroup}`);
    console.log(`    size:        ${e.size} bytes`);
    console.log('');
  }
}
