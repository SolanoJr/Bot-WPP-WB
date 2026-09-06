/**
 * laboratorio/find-casino-message.ts
 *
 * FASE 1-3: Localizar, identificar e capturar o payload REAL da mensagem
 * do bot de cassino já existente no grupo "Figurinhas".
 *
 * NÃO altera nada. NÃO apaga nada. Apenas diagnostica e salva o resultado.
 */

import { BaileysAdapter } from '../src/platforms/whatsapp/BaileysAdapter';
import { PlatformManager } from '../src/platforms/PlatformManager';
import { classifyMessagePayload, detectSuspiciousMessage } from './observer';
import { isProtectedTarget } from '../src/services/permissions';
import logger from '../src/services/loggerService';
import fs from 'fs';
import path from 'path';

// ─── Configuração ────────────────────────────────────────────────────────────

const GROUP_NAME = 'Figurinhas';
const OUTPUT_DIR = path.join(process.cwd(), 'laboratorio');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'casino-message-discovery.json');

// ─── Sanitização de payload ─────────────────────────────────────────────────

function sanitizePayload(rawMsg: any): Record<string, any> {
  const safe: any = {};
  const keys = Object.keys(rawMsg);
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (lower.includes('cookie') || lower.includes('token') ||
        lower.includes('credential') || lower.includes('session') ||
        lower.includes('secret') || lower.includes('qr') ||
        lower.includes('password') || lower.includes('private') ||
        lower.includes('browser') || lower.includes('useragent')) {
      safe[k] = '[REDACTED]';
      continue;
    }
    const v = rawMsg[k];
    if (typeof v === 'object' && v !== null) {
      if (Array.isArray(v)) {
        safe[k] = v.map((item: any) => sanitizePayload(item));
      } else {
        safe[k] = sanitizePayload(v);
      }
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

// ─── Busca o JID do grupo pelo nome ────────────────────────────────────────

async function findGroupJidByName(
  adapter: BaileysAdapter,
  groupName: string,
): Promise<string | null> {
  const chats = await adapter.getChats();
  for (const chat of chats) {
    if (chat.name === groupName || chat.name.toLowerCase() === groupName.toLowerCase()) {
      logger.info(`[FIND-CASINO] grupo encontrado: ${chat.name} → ${chat.id}`);
      return chat.id;
    }
  }
  const sock = (adapter as any).sock;
  if (sock?.store?.chats) {
    for (const [jid, chat] of Object.entries(sock.store.chats as Record<string, any>)) {
      if (chat.subject === groupName || chat.name === groupName ||
          (typeof chat.subject === 'string' && chat.subject.toLowerCase() === groupName.toLowerCase())) {
        logger.info(`[FIND-CASINO] grupo no store: ${chat.subject} → ${jid}`);
        return jid;
      }
    }
  }
  logger.warn(`[FIND-CASINO] grupo "${groupName}" não encontrado`);
  return null;
}

// ─── Busca mensagens do grupo no store do Baileys ──────────────────────────

function findGroupMessages(
  adapter: BaileysAdapter,
  groupJid: string,
  limit: number = 100,
): Array<{ key: any; message: any; receivedAt: number }> {
  const sock = (adapter as any).sock;
  if (!sock?.store?.messages) {
    logger.warn('[FIND-CASINO] store.messages indisponível');
    return [];
  }

  const map = sock.store.messages[groupJid];
  if (!map) {
    logger.warn(`[FIND-CASINO] sem mensagens no store para ${groupJid}`);
    return [];
  }

  const entries = map instanceof Map
    ? Array.from(map.entries())
    : Object.entries(map);

  const results: Array<{ key: any; message: any; receivedAt: number }> = [];

  for (const [msgId, msgData] of entries) {
    if (!msgData) continue;
    const msg = msgData instanceof Map ? msgData : msgData;
    const key = msg.key || msgData?.key;
    if (!key) continue;

    // Verifica se é mensagem do grupo (remoteJid ou participant termina com @g.us)
    const remoteJid = key.remoteJid || '';
    const participant = key.participant || '';
    if (!remoteJid.endsWith('@g.us') && !participant.endsWith('@g.us')) continue;

    results.push({
      key: key,
      message: msg.message || msg,
      receivedAt: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
    });

    if (results.length >= limit) break;
  }

  return results;
}

// ─── Análise e classificação da mensagem ────────────────────────────────────

function analyzeMessage(rawMsg: any, groupJid: string): {
  messageId: string;
  senderJid: string;
  participant: string;
  pushName: string;
  remoteJid: string;
  timestamp: number;
  messageType: ReturnType<typeof classifyMessagePayload>;
  contentType: string;
  messageKeys: string[];
  keyKeys: string[];
  payloadSize: number;
  signals: string[];
  detected: boolean;
  reason: string;
} {
  const key = rawMsg?.key || {};
  const m = rawMsg?.message || {};

  const messageId = key.id || '';
  const remoteJid = key.remoteJid || '';
  const participant = key.participant || '';
  const pushName = rawMsg.pushName || (rawMsg.ack?.notify || '');
  const timestamp = rawMsg.messageTimestamp ? Number(rawMsg.messageTimestamp) * 1000 : Date.now();

  const messageType = classifyMessagePayload(rawMsg);

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

  const messageKeys = Object.keys(m).sort();
  const keyKeys = Object.keys(key).sort();
  const payloadSize = JSON.stringify(rawMsg).length;

  const event = {
    rawMsg,
    groupJid,
    senderJid: participant || remoteJid,
    fromMe: !!key.fromMe,
    pushName,
    messageTimestamp: rawMsg.messageTimestamp,
    eventType: 'messages.upsert',
  };

  const detection = detectSuspiciousMessage(
    rawMsg,
    messageType,
    event.senderJid,
    event.pushName,
    groupJid,
  );

  return {
    messageId,
    senderJid: participant || remoteJid,
    participant,
    pushName,
    remoteJid,
    timestamp,
    messageType,
    contentType,
    messageKeys,
    keyKeys,
    payloadSize,
    signals: detection.signals,
    detected: detection.detected,
    reason: detection.reason,
  };
}

// ─── Formata diagnóstico seguro ─────────────────────────────────────────────

function formatDiagnosis(analysis: ReturnType<typeof analyzeMessage>, rawMsg: any): string {
  const lines: string[] = [];
  const m = rawMsg?.message || {};
  const key = rawMsg?.key || {};

  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  MENSAGEM IDENTIFICADA NO GRUPO "FIGURINHAS"');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`messageId:        ${analysis.messageId}`);
  lines.push(`senderJid:        ${analysis.senderJid}`);
  lines.push(`participant:      ${analysis.participant}`);
  lines.push(`remoteJid:        ${analysis.remoteJid}`);
  lines.push(`pushName:         ${analysis.pushName || '(não disponível)'}`);
  lines.push(`timestamp:        ${new Date(analysis.timestamp).toISOString()}`);
  lines.push(`contentType:      ${analysis.contentType}`);
  lines.push(`messageType:      ${JSON.stringify(analysis.messageType)}`);
  lines.push(`payloadSize:      ${analysis.payloadSize} bytes`);
  lines.push('');
  lines.push('── Chaves em msg.message ──');
  for (const k of analysis.messageKeys) {
    lines.push(`  ${k}`);
  }
  lines.push('');
  lines.push('── Chaves em msg.key ──');
  for (const k of analysis.keyKeys) {
    lines.push(`  ${k}`);
  }
  lines.push('');
  lines.push('── Sinais detectados ──');
  if (analysis.signals.length === 0) {
    lines.push('  (nenhum sinal)');
  } else {
    for (const s of analysis.signals) {
      lines.push(`  ✓ ${s}`);
    }
  }
  lines.push('');
  lines.push(`detected:         ${analysis.detected}`);
  lines.push(`reason:           ${analysis.reason}`);
  lines.push('');

  lines.push('── Análise do conteúdo detectado ──');

  if (m.extendedTextMessage) {
    const etm = m.extendedTextMessage as any;
    lines.push('  extendedTextMessage: SIM');
    if (etm.text) lines.push(`    text: "${etm.text.slice(0, 100)}"`);
    if (etm.caption) lines.push(`    caption: "${etm.caption.slice(0, 100)}"`);
    if (etm.linkPreview) {
      lines.push('    linkPreview: SIM');
      lines.push(`      canonical-url: ${etm.linkPreview['canonical-url'] || ''}`);
      lines.push(`      matchedText: ${etm.linkPreview['matchedText'] || ''}`);
      lines.push(`      title: ${etm.linkPreview.title || ''}`);
    }
    if (etm.contextInfo) {
      lines.push('    contextInfo: SIM');
      if (etm.contextInfo.mentionedJidList?.length) {
        lines.push(`      mentionedJidList: ${etm.contextInfo.mentionedJidList.length} mentions`);
      }
      if (etm.contextInfo.quotedMessage) lines.push('      quotedMessage: SIM');
      if (etm.contextInfo.isForwarded) lines.push('      isForwarded: true');
    }
  }

  if (m.buttonsMessage) {
    const bm = m.buttonsMessage as any;
    lines.push('  buttonsMessage: SIM');
    if (bm.contentText) lines.push(`    contentText: "${bm.contentText.slice(0, 100)}"`);
    if (bm.footerText) lines.push(`    footerText: "${bm.footerText.slice(0, 50)}"`);
    const buttons = bm.buttons || [];
    lines.push(`    buttons: ${buttons.length}`);
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (b.buttonText?.displayText) lines.push(`      [${i}] text: "${b.buttonText.displayText}"`);
      if (b.buttonId) lines.push(`      [${i}] id: ${b.buttonId}`);
      if (b.buttonParamsJson) {
        try {
          const params = JSON.parse(String(b.buttonParamsJson));
          if (params.url) lines.push(`      [${i}] url: ${params.url}`);
          if (params.display_text) lines.push(`      [${i}] display_text: ${params.display_text}`);
        } catch { /* ignorar */ }
      }
    }
  }

  if (m.templateMessage) {
    const tm = m.templateMessage as any;
    lines.push('  templateMessage: SIM');
    const hydrated = tm.hydratedTemplate || tm;
    if (hydrated.hydratedContentText) lines.push(`    hydratedContentText: "${String(hydrated.hydratedContentText).slice(0, 100)}"`);
    if (hydrated.hydratedTitleText) lines.push(`    hydratedTitleText: "${String(hydrated.hydratedTitleText).slice(0, 100)}"`);
    if (hydrated.hydratedFooterText) lines.push(`    hydratedFooterText: "${String(hydrated.hydratedFooterText).slice(0, 50)}"`);
  }

  if (m.interactiveMessage) {
    const im = m.interactiveMessage as any;
    lines.push('  interactiveMessage: SIM');
    if (im.body?.text) lines.push(`    body: "${im.body.text.slice(0, 100)}"`);
    if (im.footer?.text) lines.push(`    footer: "${im.footer.text.slice(0, 50)}"`);
    if (im.header?.title) lines.push(`    header: "${im.header.title}"`);
  }

  if (m.productMessage) lines.push('  productMessage: SIM');
  if (m.listMessage) {
    const lm = m.listMessage as any;
    lines.push('  listMessage: SIM');
    if (lm.title) lines.push(`    title: "${lm.title}"`);
    if (lm.description) lines.push(`    description: "${lm.description?.slice(0, 50)}"`);
  }
  if (m.stickerMessage) lines.push('  stickerMessage: SIM');
  if (m.imageMessage) {
    lines.push('  imageMessage: SIM');
    if (m.imageMessage.caption) lines.push(`    caption: "${m.imageMessage.caption.slice(0, 100)}"`);
  }
  if (m.documentMessage) lines.push('  documentMessage: SIM');
  if (m.conversation && typeof m.conversation === 'string') {
    lines.push(`  conversation: "${m.conversation.slice(0, 200)}"`);
  }

  const knownTypes = ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage',
    'audioMessage', 'documentMessage', 'stickerMessage', 'buttonsMessage',
    'listMessage', 'listResponseMessage', 'interactiveMessage', 'templateMessage',
    'locationMessage', 'contactMessage', 'groupInviteMessage', 'poll',
    'productMessage', 'orderMessage'];

  if (!knownTypes.some(k => m[k])) {
    lines.push('  (sem tipo conhecido — payload incomum)');
    lines.push(`  chaves desconhecidas: ${Object.keys(m).join(', ')}`);
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  Diagnóstico pronto para revisão humana.');
  lines.push('  NÃO foram executadas ações de delete/remova/ban.');
  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Salva resultado no arquivo ─────────────────────────────────────────────

function saveResult(analysis: ReturnType<typeof analyzeMessage>, rawMsg: any): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const entry = {
    foundAt: new Date().toISOString(),
    groupName: GROUP_NAME,
    messageId: analysis.messageId,
    senderJid: analysis.senderJid,
    participant: analysis.participant,
    pushName: analysis.pushName,
    remoteJid: analysis.remoteJid,
    timestamp: analysis.timestamp,
    contentType: analysis.contentType,
    messageType: analysis.messageType,
    messageKeys: analysis.messageKeys,
    keyKeys: analysis.keyKeys,
    payloadSize: analysis.payloadSize,
    signals: analysis.signals,
    detected: analysis.detected,
    reason: analysis.reason,
    rawPayloadSafe: sanitizePayload(rawMsg),
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(entry, null, 2), 'utf-8');
  logger.info(`[FIND-CASINO] resultado salvo em ${OUTPUT_FILE}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info(`[FIND-CASINO] iniciando busca por mensagem de cassino em "${GROUP_NAME}"`);

  const pm = PlatformManager.getInstance();
  const rawAdapter = pm.getAdapter('whatsapp');
  if (!rawAdapter || typeof (rawAdapter as any).sendMessage !== 'function') {
    logger.error('[FIND-CASINO] adapter whatsapp não encontrado ou sem sendMessage. Bot não conectado?');
    process.exit(1);
  }
  const adapter = rawAdapter as any;

  const sock = (adapter as any).sock;
  if (!sock || !sock.user) {
    logger.error('[FIND-CASINO] sessão WhatsApp não disponível.');
    process.exit(1);
  }
  logger.info(`[FIND-CASINO] conectado como ${sock.user.id}`);

  const groupJid = await findGroupJidByName(adapter, GROUP_NAME);
  if (!groupJid) {
    logger.error(`[FIND-CASINO] grupo "${GROUP_NAME}" não encontrado.`);
    process.exit(1);
  }

  const messages = findGroupMessages(adapter, groupJid, 100);
  logger.info(`[FIND-CASINO] ${messages.length} mensagens encontradas no store para "${GROUP_NAME}" (${groupJid})`);

  if (messages.length === 0) {
    logger.warn('[FIND-CASINO] nenhuma mensagem no store. O cache pode estar vazio.');
    process.exit(0);
  }

  // Analisar e encontrar candidatos
  const candidates: Array<{ analysis: ReturnType<typeof analyzeMessage>; rawMsg: any; index: number }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const analysis = analyzeMessage(msg, groupJid);
    const isProtected = isProtectedTarget(analysis.senderJid);

    const isInteractive = analysis.messageType.type === 'interactive' ||
                          analysis.messageType.type === 'multi' ||
                          ['buttonsMessage', 'templateMessage', 'productMessage', 'interactiveMessage', 'other'].includes(analysis.contentType);
    const isSuspicious = analysis.signals.length >= 2;
    const isLarge = analysis.payloadSize > 500;

    if (!isProtected && (isInteractive || isSuspicious || isLarge || analysis.contentType === 'other')) {
      candidates.push({ analysis, rawMsg: msg, index: i });
    }
  }

  candidates.sort((a, b) => b.analysis.timestamp - a.analysis.timestamp);

  if (candidates.length === 0) {
    logger.info('[FIND-CASINO] nenhum candidato com os critérios atuais.');
    logger.info('[FIND-CASINO] Listando 10 mensagens mais recentes:');

    for (let i = 0; i < Math.min(messages.length, 10); i++) {
      const msg = messages[i];
      const analysis = analyzeMessage(msg, groupJid);
      console.log(formatDiagnosis(analysis, msg));
      console.log('');
    }
  } else {
    logger.info(`[FIND-CASINO] ${candidates.length} candidato(s). Mostrando ${Math.min(candidates.length, 5)} mais recentes:`);
    for (let i = 0; i < Math.min(candidates.length, 5); i++) {
      const { analysis, rawMsg } = candidates[i];
      console.log(formatDiagnosis(analysis, rawMsg));
      console.log('');
    }
  }

  // Salvar primeiro candidato ou mensagem mais recente
  if (candidates.length > 0) {
    saveResult(candidates[0].analysis, candidates[0].rawMsg);
  } else if (messages.length > 0) {
    saveResult(analyzeMessage(messages[0], groupJid), messages[0]);
  }

  logger.info('[FIND-CASINO] análise concluída. NENHUMA ação de delete/remova/ban foi executada.');
}

main().catch((err: any) => {
  logger.error(`[FIND-CASINO] erro fatal: ${err?.message || err}`);
  process.exit(1);
});
