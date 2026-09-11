#!/usr/bin/env node
/**
 * laboratorio/captura-msg.ts
 *
 * Script para capturar mensagens de grupos e salvar em JSONL para análise.
 * Lê mensagens do chat, normaliza (extrai texto de botões, imagens, etc.),
 * e grava em laboratorio/captured-messages.jsonl.
 *
 * Uso:
 *   node dist/laboratorio/captura-msg.js                    # captura todos os grupos
 *   node dist/laboratorio/captura-msg.js --group JID        # captura grupo específico
 *   node dist/laboratorio/captura-msg.js --chat JID         # captura chat específico (privado ou grupo)
 *   node dist/laboratorio/captura-msg.js --sender JID       # captura apenas mensagens de um remetente
 *   node dist/laboratorio/captura-msg.js --file PATH        # salva em arquivo específico
 *   node dist/laboratorio/captura-msg.js --live             # modo live: escuta novas mensagens
 *
 * O script usa o testServer na porta 3004 para acessar o adapter do bot.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { argv, cwd } from 'process';

const TEST_SERVER = 'http://127.0.0.1:3004';
const DEFAULT_OUTPUT = path.join(cwd(), 'laboratorio', 'captured-messages.jsonl');
const CAPTURE_DIR = path.join(cwd(), 'laboratorio');

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args = argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const groupArg = getArg('--group');
const chatArg = getArg('--chat');
const senderArg = getArg('--sender');
const fileArg = getArg('--file');
const liveMode = args.includes('--live');
const outputFile = fileArg || DEFAULT_OUTPUT;

// ─── Utilidades ──────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[CAPTURA] ${msg}`);
}

function logError(msg: string) {
  console.error(`[CAPTURA-ERR] ${msg}`);
}

function httpPost(url: string, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resBody));
        } catch {
          resolve({ _raw: resBody, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.get({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: { 'Accept': 'application/json' },
    }, res => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(resBody));
        } catch {
          resolve({ _raw: resBody, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
  });
}

// ─── Persistência no JSONL ──────────────────────────────────────────────────
function appendCapture(entry: object): void {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  const line = JSON.stringify(entry, null, 0).slice(0, 50000) + '\n';
  fs.appendFileSync(outputFile, line, 'utf-8');
}

function readCaptures(): Array<Record<string, any>> {
  if (!fs.existsSync(outputFile)) return [];
  try {
    const text = fs.readFileSync(outputFile, 'utf-8').trim();
    if (!text) return [];
    return text.split('\n').filter(Boolean).map((line: string) => {
      try { return JSON.parse(line); } catch { return null as any; }
    }).filter((r: any): r is Record<string, any> => r != null);
  } catch { return []; }
}

// ─── Normalização de mensagens (extrai texto de todos os tipos) ─────────────
function normalizeMessageText(msg: any): string {
  if (!msg) return '';

  const parts: string[] = [];

  // Texto direto
  if (typeof msg.conversation === 'string' && msg.conversation.trim()) {
    parts.push(msg.conversation.trim());
  }

  // Extended text (com caption, link preview, etc.)
  if (msg.extendedTextMessage) {
    const etm = msg.extendedTextMessage;
    if (typeof etm.text === 'string' && etm.text.trim()) parts.push(etm.text.trim());
    if (typeof etm.caption === 'string' && etm.caption.trim()) parts.push(etm.caption.trim());
    // Link preview
    try {
      const lp = etm['linkPreview'];
      if (lp && typeof lp === 'object') {
        if (lp['canonical-url']) parts.push(String(lp['canonical-url']));
        if (lp.title) parts.push(String(lp.title));
        if (lp.description) parts.push(String(lp.description));
      }
    } catch { /* ignore */ }
    // Context info (quote/reply)
    try {
      const ci = etm.contextInfo;
      if (ci) {
        if (ci.quotedMessage) {
          const qm = ci.quotedMessage;
          if (qm.conversation) parts.push(`[quote:${qm.conversation}]`);
          if (qm.extendedTextMessage?.text) parts.push(`[quote:${qm.extendedTextMessage.text}]`);
        }
      }
    } catch { /* ignore */ }
  }

  // Botões
  if (msg.buttonsMessage) {
    const bm = msg.buttonsMessage;
    if (typeof bm.contentText === 'string' && bm.contentText.trim()) parts.push(bm.contentText.trim());
    if (typeof bm.footerText === 'string' && bm.footerText.trim()) parts.push(bm.footerText.trim());
    if (typeof bm.headerText === 'string' && bm.headerText.trim()) parts.push(bm.headerText.trim());
    // Extrair URLs dos botões
    const buttons = bm.buttons || [];
    for (const b of buttons) {
      try {
        if (b.buttonParamsJson) {
          const params = JSON.parse(String(b.buttonParamsJson));
          if (params.url) parts.push(params.url);
          if (params.display_text) parts.push(params.display_text);
        }
      } catch { /* ignore */ }
      if (b.buttonText?.displayText) parts.push(b.buttonText.displayText);
      if (b.buttonId) parts.push(`[buttonId:${b.buttonId}]`);
    }
  }

  // Interactive message (cards, quick replies)
  if (msg.interactiveMessage) {
    const im = msg.interactiveMessage;
    if (im.body?.text) parts.push(im.body.text);
    if (im.header?.title) parts.push(im.header.title);
    if (im.footer?.text) parts.push(im.footer.text);
    // Botões do interactive
    const buttons = im.nativeFlowMessage?.buttons || [];
    for (const b of buttons) {
      try {
        if (b.buttonParamsJson) {
          const params = JSON.parse(String(b.buttonParamsJson));
          if (params.url) parts.push(params.url);
          if (params.display_text) parts.push(params.display_text);
          if (params.copy_code) parts.push(`copy:${params.copy_code}`);
        }
      } catch { /* ignore */ }
      if (b.buttonText?.displayText) parts.push(b.buttonText.displayText);
      if (b.buttonId) parts.push(`[buttonId:${b.buttonId}]`);
    }
  }

  // Template message
  if (msg.templateMessage) {
    const tm = msg.templateMessage;
    const hydrated = tm.hydratedTemplate || tm;
    if (hydrated.hydratedContentText) parts.push(hydrated.hydratedContentText);
    if (hydrated.hydratedTitleText) parts.push(hydrated.hydratedTitleText);
    if (hydrated.hydratedFooterText) parts.push(hydrated.hydratedFooterText);
    // Botões do template
    const buttons = hydrated.hydratedButtons || [];
    for (const b of buttons) {
      if (b.urlButton?.displayText) parts.push(b.urlButton.displayText);
      if (b.urlButton?.url) parts.push(b.urlButton.url);
      if (b.quickReplyButton?.displayText) parts.push(b.quickReplyButton.displayText);
      if (b.buttonText?.displayText) parts.push(b.buttonText.displayText);
    }
  }

  // Resposta de botão
  if (msg.buttonsResponseMessage) {
    const br = msg.buttonsResponseMessage;
    if (br.buttonReply?.displayText) parts.push(`[button_reply:${br.buttonReply.displayText}]`);
  }

  // List message
  if (msg.listMessage) {
    const lm = msg.listMessage;
    if (lm.title) parts.push(lm.title);
    if (lm.description) parts.push(lm.description);
    if (lm.section_header) parts.push(lm.section_header);
  }

  // Resposta de lista
  if (msg.listResponseMessage) {
    const lr = msg.listResponseMessage;
    if (lr.title) parts.push(`[list_reply:${lr.title}]`);
    if (lr.description) parts.push(lr.description);
    if (lr.listSelectedId) parts.push(`[list_selected:${lr.listSelectedId}]`);
  }

  // Imagem com legenda
  if (msg.imageMessage) {
    const im = msg.imageMessage;
    if (im.caption) parts.push(im.caption);
    if (im.staticUrl) parts.push(`[image:${im.staticUrl}]`);
  }

  // Vídeo com legenda
  if (msg.videoMessage) {
    const vm = msg.videoMessage;
    if (vm.caption) parts.push(vm.caption);
    if (vm.staticUrl) parts.push(`[video:${vm.staticUrl}]`);
  }

  // Documento com legenda
  if (msg.documentMessage) {
    const dm = msg.documentMessage;
    if (dm.caption) parts.push(dm.caption);
    if (dm.fileName) parts.push(`[doc:${dm.fileName}]`);
  }

  // Sticker
  if (msg.stickerMessage) {
    parts.push('[sticker]');
  }

  // Áudio
  if (msg.audioMessage) {
    parts.push('[audio]');
  }

  // Localização
  if (msg.locationMessage) {
    const lm = msg.locationMessage;
    parts.push(`[location:${lm.latitude},${lm.longitude}]`);
    if (lm.address) parts.push(`[location_addr:${lm.address}]`);
  }

  // Contato
  if (msg.contactMessage) {
    const cm = msg.contactMessage;
    parts.push(`[contact:${cm.displayName || ''} ${cm.vcard || ''}]`);
  }

  // Enquete
  if (msg.poll) {
    parts.push(`[poll:${msg.poll.question || ''} ]`);
  }

  // Grupo convite
  if (msg.groupInviteMessage) {
    const gim = msg.groupInviteMessage;
    if (gim.text) parts.push(gim.text);
    if (gim.subject) parts.push(`[invite_subject:${gim.subject}]`);
  }

  // Forward
  if (msg.forward) {
    parts.push('[forward]');
  }

  // Reaction
  if (msg.reactionMessage) {
    parts.push(`[reaction:${msg.reactionMessage.reaction?.emoji || ''}]`);
  }

  // Product
  if (msg.productMessage) {
    const pm = msg.productMessage;
    if (pm.productId) parts.push(`[product:${pm.productId}]`);
    if (pm.title) parts.push(pm.title);
    if (pm.description) parts.push(pm.description);
  }

  // Order
  if (msg.orderMessage) {
    parts.push('[order]');
  }

  // Message share
  if (msg.messageShare) {
    const ms = msg.messageShare;
    if (ms.sharedMessage?.conversation) parts.push(`[share:${ms.sharedMessage.conversation}]`);
    if (ms.sharedMessage?.extendedTextMessage?.text) parts.push(`[share:${ms.sharedMessage.extendedTextMessage.text}]`);
    if (ms.pttMessage) parts.push('[share:PTT]');
  }

  // Concat all parts
  return parts.join('\n').trim();
}

// ─── Formatação de 출력 ────────────────────────────────────────────────────
function printCapture(entry: any): void {
  console.log('\n── Nova captura ──');
  console.log(`  captureId:     ${entry.captureId}`);
  console.log(`  groupId:       ${entry.groupId}`);
  console.log(`  messageId:     ${entry.messageId}`);
  console.log(`  participant:   ${entry.participant}`);
  console.log(`  senderJid:     ${entry.senderJid}`);
  console.log(`  timestamp:     ${new Date(entry.timestamp).toISOString()}`);
  console.log(`  messageType:   ${entry.messageType}`);
  console.log(`  contentType:   ${entry.contentType}`);
  console.log(`  textPreview:   ${entry.textPreview ? entry.textPreview.slice(0, 200) + (entry.textPreview.length > 200 ? '...' : '') : '(sem texto)'}`);
  console.log(`  isGroup:       ${entry.isGroup}`);
  console.log(`  size:          ${entry.size} bytes`);
}

// ─── Captura de uma mensagem individual ─────────────────────────────────────
function captureMessage(
  message: any,
  groupId: string,
  platform: string = 'whatsapp',
  botUserId: string = '',
): Record<string, any> | null {
  const key = message?.key || {};
  const m = message?.message || {};

  const messageId = key.id || message.messageId || '';
  const remoteJid = key.remoteJid || groupId || '';
  const participant = key.participant || '';
  const fromMe = !!key.fromMe;

  if (!messageId) return null;

  // Sender JID
  let senderJid: string;
  if (fromMe) {
    senderJid = botUserId || 'self';
  } else if (participant && participant.endsWith('@g.us')) {
    senderJid = remoteJid || participant;
  } else {
    senderJid = participant || remoteJid;
  }

  const isGroup = remoteJid.endsWith('@g.us') || groupId.endsWith('@g.us') ||
                  groupId.startsWith('tg:') || groupId.startsWith('dc:');

  // Detecção de tipo
  let messageType = 'unknown';
  let contentType = 'unknown';

  if (m.buttonsMessage) { messageType = 'button'; contentType = 'buttonsMessage'; }
  else if (m.interactiveMessage) { messageType = 'interactive'; contentType = 'interactiveMessage'; }
  else if (m.templateMessage) { messageType = 'template'; contentType = 'templateMessage'; }
  else if (m.productMessage) { messageType = 'product'; contentType = 'productMessage'; }
  else if (m.orderMessage) { messageType = 'order'; contentType = 'orderMessage'; }
  else if (m.listMessage) { messageType = 'list'; contentType = 'listMessage'; }
  else if (m.listResponseMessage) { messageType = 'list_response'; contentType = 'listResponseMessage'; }
  else if (m.imageMessage) { messageType = 'image'; contentType = 'imageMessage'; }
  else if (m.videoMessage) { messageType = 'video'; contentType = 'videoMessage'; }
  else if (m.audioMessage) { messageType = 'audio'; contentType = 'audioMessage'; }
  else if (m.documentMessage) { messageType = 'document'; contentType = 'documentMessage'; }
  else if (m.stickerMessage) { messageType = 'sticker'; contentType = 'stickerMessage'; }
  else if (m.locationMessage) { messageType = 'location'; contentType = 'locationMessage'; }
  else if (m.contactMessage) { messageType = 'contact'; contentType = 'contactMessage'; }
  else if (m.poll) { messageType = 'poll'; contentType = 'poll'; }
  else if (m.liveLocationMessage) { messageType = 'live_location'; contentType = 'liveLocationMessage'; }
  else if (m.messageShare) { messageType = 'share'; contentType = 'messageShare'; }
  else if (m.reactionMessage) { messageType = 'reaction'; contentType = 'reactionMessage'; }
  else if (m.groupInviteMessage) { messageType = 'group_invite'; contentType = 'groupInviteMessage'; }
  else if (m.extendedTextMessage) { messageType = 'extended_text'; contentType = 'extendedTextMessage'; }
  else if (typeof m.conversation === 'string' && m.conversation.trim()) { messageType = 'text'; contentType = 'conversation'; }
  else { messageType = 'other'; contentType = 'other'; }

  // Normaliza texto (extrai de todos os campos possíveis)
  const textPreview = normalizeMessageText(message).slice(0, 500);

  const entry: Record<string, any> = {
    captureId: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    capturedAt: new Date().toISOString(),
    groupId,
    messageId,
    remoteJid,
    participant,
    fromMe,
    timestamp: key.messageTimestamp ? Number(key.messageTimestamp) * 1000 : Date.now(),
    messageType,
    contentType,
    senderJid,
    isGroup,
    pushName: message.pushName || (message as any)?.[ 'pushName' ] || '',
    textPreview,
    size: JSON.stringify(message).length,
    platform,
    rawPayloadSafe: sanitizePayload(message),
  };

  return entry;
}

function sanitizePayload(rawMsg: any): any {
  if (!rawMsg || typeof rawMsg !== 'object') return rawMsg;
  const safe: any = {};
  const keys = Object.keys(rawMsg);
  const redactedKeys = new Set([
    'creds', 'keys', 'cookie', 'session', 'token', 'secret',
    'routingInfo', 'noiseKey', 'signedIdentityKey', 'preKey',
    'signedPreKey', 'identityKey', 'browser', 'userAgent',
    'deviceList', 'lids', 'pn_map',
  ]);

  for (const k of keys) {
    if (redactedKeys.has(k)) {
      safe[k] = '[REDACTED]';
      continue;
    }
    const v = rawMsg[k];
    if (typeof v === 'object' && v !== null) {
      if (Array.isArray(v)) {
        safe[k] = v.filter((x: any) => x != null).slice(0, 20).map((x: any) =>
          typeof x === 'object' ? sanitizePayload(x) : x
        );
      } else {
        safe[k] = sanitizePayload(v);
      }
    } else if (typeof v === 'string') {
      safe[k] = v.length > 500 ? v.slice(0, 500) + '...' : v;
    } else {
      safe[k] = v;
    }
  }

  // Limitar profundidade do message
  if (safe.message && typeof safe.message === 'object') {
    const msg = safe.message as any;
    const msgKeys = Object.keys(msg).slice(0, 30);
    safe.message = {};
    for (const mk of msgKeys) {
      if (redactedKeys.has(mk)) continue;
      const mv = msg[mk];
      safe.message[mk] = typeof mv === 'object' && mv !== null
        ? JSON.parse(JSON.stringify(mv, (kp: string, vv: any) => {
            if (kp.startsWith('secret') || kp.startsWith('cookie') || kp.startsWith('token')) return undefined;
            return vv;
          }))
        : mv;
    }
  }

  return safe;
}

// ─── Leitura de grupos ───────────────────────────────────────────────────────
async function getGroups(platform: string = 'whatsapp'): Promise<any[]> {
  try {
    const resp = await httpPost(`${TEST_SERVER}/lab/groups`, { platform });
    if (resp?.ok && Array.isArray(resp.groups)) {
      return resp.groups;
    }
    log(`Não foi possível obter grupos: ${JSON.stringify(resp)}`);
    return [];
  } catch (err: any) {
    logError(`Erro ao obter grupos: ${err.message}`);
    return [];
  }
}

// ─── Captura de mensagens de um grupo via /lab/messages ────────────────────
async function fetchGroupMessages(
  platform: string,
  groupJid: string,
  limit: number = 200,
): Promise<any[]> {
  try {
    const resp = await httpPost(`${TEST_SERVER}/lab/messages`, {
      platform,
      groupJid,
      limit,
    });
    if (resp?.ok && Array.isArray(resp.messages)) {
      return resp.messages;
    }
    log(`Não foi possível obter mensagens: ${JSON.stringify(resp)}`);
    return [];
  } catch (err: any) {
    logError(`Erro ao buscar mensagens: ${err.message}`);
    return [];
  }
}

// ─── Captura de mensagens de um chat específico ─────────────────────────────
async function fetchChatMessages(
  platform: string,
  chatId: string,
  limit: number = 200,
): Promise<any[]> {
  // Para WhatsApp, usa /lab/messages com o JID do chat
  if (platform === 'whatsapp') {
    return fetchGroupMessages(platform, chatId, limit);
  }

  // Para Telegram e Discord, precisamos de um endpoint diferente
  // Por enquanto, retorna vazio — esses platforms não têm captura implementada
  log(`⚠️ Captura de chat não implementada para plataforma ${platform}`);
  return [];
}

// ─── Captura de mensagens de um remetente específico ────────────────────────
async function fetchSenderMessages(
  platform: string,
  senderJid: string,
  limit: number = 200,
): Promise<any[]> {
  // Lê todas as capturas e filtra por remetente
  const all = readCaptures();
  return all.filter((c: any) =>
    (c.senderJid === senderJid || c.participant === senderJid)
  ).slice(0, limit);
}

// ─── Processamento de uma lista de mensagens ────────────────────────────────
function processMessages(
  messages: any[],
  groupId: string,
  platform: string = 'whatsapp',
  botUserId: string = '',
): Array<Record<string, any>> {
  const results: Array<Record<string, any>> = [];
  for (const msg of messages) {
    const entry = captureMessage(msg, groupId, platform, botUserId);
    if (entry) {
      results.push(entry);
    }
  }
  return results;
}

// ─── Modo live: escuta novas mensagens via polling ──────────────────────────
async function liveCapture(
  platform: string,
  groupJid: string,
  intervalMs: number = 5000,
): Promise<void> {
  log(`Modo live ativado para grupo ${groupJid} (interpval: ${intervalMs}ms)`);
  log('Pressione Ctrl+C para parar.');

  let lastCount = 0;

  while (true) {
    try {
      const messages = await fetchGroupMessages(platform, groupJid, 50);
      const newMessages = messages.slice(lastCount);
      const entries = processMessages(newMessages, groupJid, platform);

      for (const entry of entries) {
        appendCapture(entry);
        printCapture(entry);
      }

      if (entries.length > 0) {
        log(`Capturadas ${entries.length} nova(s) mensagem(ens)`);
      }

      lastCount = messages.length;

      // Lê o JSONL para ver quantas capturas totais existem
      const totalCaptures = readCaptures().length;
      log(`Total de capturas no arquivo: ${totalCaptures}`);

      await new Promise(r => setTimeout(r, intervalMs));
    } catch (err: any) {
      logError(`Erro no loop live: ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('===============================================================');
  log('SCRIPT DE CAPTURA DE MENSAGENS');
  log('===============================================================');

  const platform = 'whatsapp'; // Por padrão, operamos no WhatsApp
  let targetGroupJid = groupArg || chatArg;
  const targetSender = senderArg;

  // Se não especificou grupo/chat, lista os grupos disponíveis
  if (!targetGroupJid) {
    log('Nenhum grupo/chat especificado. Listando grupos disponíveis...');
    const groups = await getGroups(platform);
    if (groups.length === 0) {
      logError('Nenhum grupo encontrado. O bot pode não estar conectado ou o testServer não está rodando.');
      log('Dica: execute o bot com \`npm run bot:start\` e certifique-se de que o testServer está ativo.');
      process.exit(1);
    }

    log(`Encontrados ${groups.length} grupos/chat(s):`);
    for (const g of groups) {
      const name = g.name || g.subject || g.id || '(sem nome)';
      const isGroup = g.isGroup || g.id?.endsWith('@g.us') || g.id?.startsWith('tg:') || g.id?.startsWith('dc:');
      console.log(`  [${g.id}] ${JSON.stringify(name)} ${isGroup ? '(grupo)' : '(privado)'}`);
    }

    // Se houver apenas um grupo, usa ele automaticamente
    if (groups.length === 1) {
      targetGroupJid = groups[0].id;
      log(`Usando automaticamente o único grupo encontrado: ${targetGroupJid}`);
    } else {
      log('Use --group <JID> ou --chat <JID> para especificar qual grupo capturar.');
      process.exit(1);
    }
  }

  log(` Plataforma:    ${platform}`);
  log(` Grupo/chat:    ${targetGroupJid}`);
  log(` Arquivo:       ${outputFile}`);
  if (targetSender) log(` Filtro sender: ${targetSender}`);
  if (liveMode) log(` Modo:         LIVE (polling contínuo)`);
  log('===============================================================');

  // Monta o ID do bot para filtrar mensagens próprias
  let botUserId = '';
  try {
    const adapterResp = await httpPost(`${TEST_SERVER}/lab/adapter`, { platform });
    if (adapterResp?.ok) {
      botUserId = adapterResp.userId || '';
      log(`Bot userId: ${botUserId}`);
    }
  } catch { /* ignore */ }

  if (liveMode) {
    const groupJidFinal = targetGroupJid || '';
    await liveCapture(platform, groupJidFinal);
    return;
  }

  // Modo batch: captura uma vez
  log('Buscando mensagens...');

  let messages: any[] = [];
  const groupJid = targetGroupJid || '';

  if (targetSender) {
    // Filtra por remetente
    const senderMessages = await fetchSenderMessages(platform, targetSender, 200);
    messages = senderMessages;
    log(`Mensagens do remetente ${targetSender}: ${messages.length} (do JSONL)`);
  } else {
    // Captura do grupo/chat
    messages = await fetchGroupMessages(platform, groupJid, 200);
    log(`Mensagens no grupo: ${messages.length}`);
  }

  if (messages.length === 0) {
    log('Nenhuma mensagem encontrada. Verifique se o testServer está rodando e se o bot está conectado.');
    process.exit(0);
  }

  // Processa e salva
  const entries = processMessages(messages, groupJid, platform, botUserId);
  log(`Processadas ${entries.length} mensagem(ens) (capturas novas: ${entries.length})`);

  let saved = 0;
  for (const entry of entries) {
    // Verifica se já existe essa captura (evita duplicatas)
    const existing = readCaptures().filter((c: any) => c.messageId === entry.messageId);
    if (existing.length === 0) {
      appendCapture(entry);
      saved++;
      printCapture(entry);
    } else {
      log(`  Pulada (já capturada): ${entry.messageId}`);
    }
  }

  log('===============================================================');
  log(`RESUMO: ${saved} mensagem(ens) capturada(s) e salva(s) em ${outputFile}`);
  log(`Total de capturas no arquivo: ${readCaptures().length}`);
  log('===============================================================');
}

main().catch(err => {
  logError(`Erro fatal: ${err.message || err}`);
  process.exit(1);
});
