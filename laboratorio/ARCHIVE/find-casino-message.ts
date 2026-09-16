/**
 * laboratorio/find-casino-message.ts
 *
 * FASE 1-3: Localizar, identificar e capturar o payload REAL da mensagem
 * do bot de cassino já existente no grupo "Figurinhas".
 *
 * NÃO altera nada. NÃO apaga nada. Apenas diagnostica e salva o resultado.
 *
 * Execução: node dist/laboratorio/find-casino-message.js
 * (no servidor Linux, onde o bot e o testServer estão rodando)
 */

import { classifyMessagePayload, detectSuspiciousMessage } from './observer';
import { isProtectedTarget } from '../src/services/permissions';
import logger from '../src/services/loggerService';
import fs from 'fs';
import path from 'path';

// ─── Configuração ────────────────────────────────────────────────────────────

const GROUP_NAME = 'Figurinhas';
const OUTPUT_DIR = path.join(process.cwd(), 'laboratorio');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'casino-message-discovery.json');
const TEST_SERVER = 'http://127.0.0.1:3004';

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

// ─── HTTP helper ────────────────────────────────────────────────────────────

function httpPost(url: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = JSON.stringify(data);
    const req = (parsed.protocol === 'https:' ? require('https') : require('http'))
      .request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res: any) => {
        let responseBody = '';
        res.on('data', (chunk: any) => { responseBody += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${parsed.error || 'unknown error'}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`HTTP ${res.statusCode}: cannot parse response`));
          }
        });
      });
    req.on('error', (err: any) => reject(err));
    req.write(body);
    req.end();
  });
}

// ─── Análise e classificação da mensagem ────────────────────────────────────

interface MessageAnalysis {
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
}

function analyzeMessage(rawMsg: any, groupJid: string): MessageAnalysis {
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

function formatDiagnosis(analysis: MessageAnalysis, rawMsg: any): string {
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

function saveResult(analysis: MessageAnalysis, rawMsg: any): void {
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

  // 1. Consultar grupo via testServer
  logger.info(`[FIND-CASINO] consultando grupo via testServer...`);
  let groupInfo: any;
  try {
    groupInfo = await httpPost(`${TEST_SERVER}/lab/find-message`, {
      platform: 'whatsapp',
      groupName: GROUP_NAME,
    });
    logger.info(`[FIND-CASINO] grupo encontrado: ${groupInfo.groupJid} (${groupInfo.chatInfo?.name || GROUP_NAME})`);
    logger.info(`[FIND-CASINO] mensagens no store: ${groupInfo.messageCount}`);
  } catch (err: any) {
    logger.error(`[FIND-CASINO] erro ao consultar grupo: ${err.message}`);
    process.exit(1);
  }

  const groupJid = groupInfo.groupJid;

  // 2. Buscar mensagens do grupo via testServer
  logger.info(`[FIND-CASINO] buscando mensagens do grupo no store...`);

  let messagesData: Array<{ key: any; message: any; receivedAt: number }> = [];
  try {
    // Usa o endpoint de busca de mensagens (precisa estar implementado no testServer)
    const messagesResp = await httpPost(`${TEST_SERVER}/lab/messages`, {
      platform: 'whatsapp',
      groupJid: groupJid,
      limit: 100,
    });
    messagesData = messagesResp.messages || [];
    logger.info(`[FIND-CASINO] ${messagesData.length} mensagens obtidas`);
  } catch (err: any) {
    logger.error(`[FIND-CASINO] erro ao buscar mensagens: ${err.message}`);
    logger.info('[FIND-CASINO] o endpoint /lab/messages pode não estar implementado no testServer');
    logger.info('[FIND-CASINO] tentando usar discovery existente como fallback...');

    // Fallback: usar discovery existente
    const existingDiscovery = path.join(OUTPUT_DIR, 'casino-message-discovery.json');
    if (fs.existsSync(existingDiscovery)) {
      const existing = JSON.parse(fs.readFileSync(existingDiscovery, 'utf-8'));
      if (existing.messageId && existing.participant) {
        logger.info(`[FIND-CASINO] discovery existente carregado: ${existing.messageId}`);
        console.log(formatDiagnosis(existing, existing.rawPayloadSafe || {}));
        saveResult({
          ...existing,
          messageType: existing.messageType || { type: 'button', subtype: 'buttonsMessage' },
        }, existing.rawPayloadSafe || {});
        logger.info('[FIND-CASINO] análise concluída. NENHUMA ação de delete/remova/ban foi executada.');
        return;
      }
    }

    logger.error('[FIND-CASINO] sem mensagens e sem discovery anterior. Abortando.');
    process.exit(1);
  }

  if (messagesData.length === 0) {
    logger.warn('[FIND-CASINO] nenhuma mensagem no store. O cache pode estar vazio.');
    process.exit(0);
  }

  // 3. Analisar e encontrar candidatos
  const candidates: Array<{ analysis: MessageAnalysis; rawMsg: any; index: number }> = [];

  for (let i = 0; i < messagesData.length; i++) {
    const msg = messagesData[i];
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

  // 4. Exibir e salvar
  if (candidates.length === 0) {
    logger.info('[FIND-CASINO] nenhum candidato com os critérios atuais.');
    logger.info('[FIND-CASINO] Listando 10 mensagens mais recentes:');

    for (let i = 0; i < Math.min(messagesData.length, 10); i++) {
      const msg = messagesData[i];
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

  // 5. Salvar primeiro candidato ou mensagem mais recente
  if (candidates.length > 0) {
    saveResult(candidates[0].analysis, candidates[0].rawMsg);
  } else if (messagesData.length > 0) {
    saveResult(analyzeMessage(messagesData[0], groupJid), messagesData[0]);
  }

  logger.info('[FIND-CASINO] análise concluída. NENHUMA ação de delete/remova/ban foi executada.');
}

main().catch((err: any) => {
  logger.error(`[FIND-CASINO] erro fatal: ${err?.message || err}`);
  process.exit(1);
});
