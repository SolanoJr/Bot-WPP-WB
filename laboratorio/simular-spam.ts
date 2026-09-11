#!/usr/bin/env node
/**
 * laboratorio/simular-spam.ts
 *
 * Script para simular envio de mensagens de spam de cassino no grupo
 * "Figurinhas" para testar o AutoMod e a detecção.
 *
 * Gera mensagens com diferentes perfis:
 *   1. Cassino completo: foreign + domínio + keyword + botão
 *   2. Apenas link suspeito: foreign + domínio
 *   3. Apenas keyword: foreign + keyword de spam
 *   4. Botão interativo: foreign + botão CTA
 *   5. Template card: foreign + card com botões
 *   6. Imagem com legenda suspeita: foreign + imagem + legenda
 *
 * NÃO envia mensagens reais. Apenas simula no JSONL de capturas para
 * que o script apagar-spam.ts possa testar a detecção.
 *
 * Uso:
 *   node dist/laboratorio/simular-spam.js                    # gera todas as variantes
 *   node dist/laboratorio/simular-spam.js --group JID       # grupo específico
 *   node dist/laboratorio/simular-spam.js --sender JID      # remetente específico
 *   node dist/laboratorio/simular-spam.js --count N         # quantas mensagens gerar
 *   node dist/laboratorio/simular-spam.js --dry-run         # mostra sem salvar
 *   node dist/laboratorio/simular-spam.js --clear           # remove capturas antigas do grupo alvo antes
 */

import fs from 'fs';
import path from 'path';
import { argv, cwd } from 'process';

const CAPTURE_FILE = path.join(cwd(), 'laboratorio', 'captured-messages.jsonl');
const CAPTURE_DIR = path.join(cwd(), 'laboratorio');

// ─── Configurações ────────────────────────────────────────────────────────────
const DEFAULT_GROUP_JID = '120363419033272638@g.us'; // Figurinhas
const DEFAULT_SENDER = '6282364007211@s.whatsapp.net'; // Indonésio
const DEFAULT_SENDER_NUMBER = '6282364007211';

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args = argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

const specificGroup = getArg('--group') || DEFAULT_GROUP_JID;
const specificSender = getArg('--sender') || DEFAULT_SENDER;
const countStr = getArg('--count');
const count = countStr ? Number(countStr) : undefined;
const dryRun = args.includes('--dry-run');
const clearFirst = args.includes('--clear');

// ─── Utilidades ──────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[SIMULAR-SPAM] ${msg}`);
}

function logError(msg: string) {
  console.error(`[SIMULAR-SPAM-ERR] ${msg}`);
}

// ─── Geração de mensagens simuladas ──────────────────────────────────────────
interface SimulatedMessage {
  type: string;
  description: string;
  payload: any;
  expectedSignals: string[];
  expectedScore: number;
}

function generateSimulatedMessages(
  groupJid: string,
  senderJid: string,
  senderNumber: string,
): SimulatedMessage[] {
  const baseTimestamp = Date.now() - 3600000; // 1 hora atrás

  return [
    {
      type: 'full_casino_card',
      description: 'Cassino completo: foreign + domínio + keyword + botão',
      expectedSignals: ['foreign', 'suspicious_domain', 'spam_keyword', 'interactive'],
      expectedScore: 9,
      payload: makeMessage(groupJid, senderJid, baseTimestamp, {
        contentType: 'buttonsMessage',
        text: '🎰 Bem-vindo ao CK7BET! 🎰\nFaça login diariamente e ganhe bônus exclusivo!\n\n🏆 Taxa de vitórias: 95%\n💰 Bônus de boas-vindas: R$ 77,777\n🎮 +500 jogos disponíveis',
        buttons: [
          { displayText: '🎮 Jogar Agora', buttonId: 'play_now', url: 'https://ck7bet.com.br/?c=10103' },
          { displayText: '💰 Resgatar Bônus', buttonId: 'claim_bonus', url: 'https://ck7bet.com.br/claim' },
          { displayText: '📞 Suporte 24h', buttonId: 'support', url: 'https://wa.me/5511999999999' },
        ],
        footerText: 'Promoção válida para novos jogadores. Termos aplicam-se.',
      }),
    },
    {
      type: 'suspicious_link_only',
      description: 'Apenas link suspeito: foreign + domínio',
      expectedSignals: ['foreign', 'suspicious_domain'],
      expectedScore: 4,
      payload: makeMessage(groupJid, senderJid, baseTimestamp + 1000, {
        contentType: 'extendedTextMessage',
        text: 'Check out this new platform! 🔥',
        caption: 'https://kl7.games/?c=10103 - Melhores apostas do Brasil!',
      }),
    },
    {
      type: 'keyword_only',
      description: 'Apenas keyword de spam: foreign + keyword',
      expectedSignals: ['foreign', 'spam_keyword'],
      expectedScore: 3,
      payload: makeMessage(groupJid, senderJid, baseTimestamp + 2000, {
        contentType: 'conversation',
        text: 'Ganhe dinheiro fácil! Recolha contínua de bônus todo dia! Taxa de vitórias incrível! Jogue e ganhe agora!',
      }),
    },
    {
      type: 'interactive_button',
      description: 'Botão interativo: foreign + botão CTA',
      expectedSignals: ['foreign', 'interactive'],
      expectedScore: 4,
      payload: makeMessage(groupJid, senderJid, baseTimestamp + 3000, {
        contentType: 'interactiveMessage',
        body: { text: '🎮 Novos jogos disponíveis! Faça login e ganhe bônus exclusivo!' },
        header: { title: 'CK7BET - Cassino Online' },
        footer: { text: 'Presentes 777-7777 disponíveis para primeiras entradas!' },
        buttons: [
          { displayText: '🎰 Entrar', buttonId: 'enter', url: 'https://kl7.games/?c=10103' },
          { displayText: '📲 Baixar App', buttonId: 'download', url: 'https://play.google.com/store/apps/details?id=com.ck7bet' },
        ],
      }),
    },
    {
      type: 'template_card',
      description: 'Template card: foreign + card com botões',
      expectedSignals: ['foreign', 'interactive', 'suspicious_domain'],
      expectedScore: 6,
      payload: makeMessage(groupJid, senderJid, baseTimestamp + 4000, {
        contentType: 'templateMessage',
        text: '🏆 Jackpot de R$ 1.000.000 em jogo! 🏆\n Participe agora e tenha chance de ganhar!\n Bônus de boas-vindas: R$ 77,777\n Taxa de vitórias: 95%',
        title: 'CK7BET - O Maior Cassino Online',
        footerText: 'Promoção limitada! Não perca!',
        buttons: [
          { displayText: '🎮 Jogar Agora', url: 'https://kl7.games/?c=10103' },
          { displayText: '💰 Reclamar Bônus', url: 'https://kl7.games/claim' },
        ],
      }),
    },
    {
      type: 'image_with_caption',
      description: 'Imagem com legenda suspeita: foreign + imagem + legenda de spam',
      expectedSignals: ['foreign', 'spam_keyword'],
      expectedScore: 3,
      payload: makeMessage(groupJid, senderJid, baseTimestamp + 5000, {
        contentType: 'imageMessage',
        caption: '🎰 CK7BET - O melhor cassino online! 🎰\n Bônus de R$ 77,777 para novos jogadores!\n Taxa de vitórias de 95%!\n Clique no link e comece a ganhar!',
        imageUrl: 'https://ck7bet.com.br/banners/promo.png',
      }),
    },
    {
      type: 'product_message',
      description: 'Product message: foreign + produto com botão',
      expectedSignals: ['foreign', 'interactive', 'suspicious_domain'],
      expectedScore: 6,
      payload: makeMessage(groupJid, senderJid, baseTimestamp + 6000, {
        contentType: 'productMessage',
        productId: 'ck7bet_promo_001',
        title: 'CK7BET - Bônus de R$ 77,777',
        description: 'Ganhe dinheiro fácil com nossas apostas! Taxa de vitórias: 95%!',
        buttons: [
          { displayText: '🎮 Comprar Agora', url: 'https://ck7bet.com.br/offer' },
        ],
      }),
    },
    {
      type: 'low_text_buttons',
      description: 'Baixa quantidade de texto + botões: foreign + pouco texto + botão',
      expectedSignals: ['foreign', 'interactive', 'low_text'],
      expectedScore: 5,
      payload: makeMessage(groupJid, senderJid, baseTimestamp + 7000, {
        contentType: 'buttonsMessage',
        text: '🏆 Jackpot! 🏆',
        buttons: [
          { displayText: '🎮 Jogar', buttonId: 'play', url: 'https://kl7.games/?c=10103' },
        ],
      }),
    },
  ];
}

function makeMessage(
  groupId: string,
  participant: string,
  timestamp: number,
  content: {
    contentType: string;
    text?: string;
    caption?: string;
    buttons?: Array<{ displayText: string; buttonId?: string; url?: string }>;
    footerText?: string;
    body?: { text: string };
    header?: { title: string };
    footer?: { text: string };
    productId?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
  },
): any {
  const messageId = `simulated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const base: any = {
    key: {
      id: messageId,
      remoteJid: groupId,
      participant: participant,
      fromMe: false,
      timestamp: Math.floor(timestamp / 1000),
    },
    messageTimestamp: Math.floor(timestamp / 1000),
    pushName: 'Spammer Indo',
    message: {},
  };

  const m = base.message;

  // Constrói o payload conforme o tipo
  switch (content.contentType) {
    case 'conversation':
      m.conversation = content.text || '';
      break;

    case 'extendedTextMessage':
      m.extendedTextMessage = {
        text: content.text || '',
        caption: content.caption || '',
        contextInfo: {
          stanzaId: messageId,
          participant: participant,
          remoteJid: groupId,
        },
      };
      break;

    case 'buttonsMessage':
      m.buttonsMessage = {
        contentText: content.text || '',
        footerText: content.footerText || '',
        headerText: '',
        buttons: (content.buttons || []).map(b => ({
          buttonText: { displayText: b.displayText },
          buttonId: b.buttonId || '',
          buttonParamsJson: JSON.stringify({
            display_text: b.displayText,
            url: b.url || '',
            type: 'cta_url',
          }),
        })),
      };
      break;

    case 'interactiveMessage':
      m.interactiveMessage = {
        body: { text: content.body?.text || '' },
        header: { title: content.header?.title || '' },
        footer: { text: content.footer?.text || '' },
        nativeFlowMessage: {
          buttons: (content.buttons || []).map(b => ({
            buttonText: { displayText: b.displayText },
            buttonId: b.buttonId || '',
            buttonParamsJson: JSON.stringify({
              display_text: b.displayText,
              url: b.url || '',
              type: 'cta_url',
            }),
          })),
        },
      };
      break;

    case 'templateMessage':
      m.templateMessage = {
        hydratedTemplate: {
          hydratedContentText: content.text || '',
          hydratedTitleText: content.title || '',
          hydratedFooterText: content.footerText || '',
          hydratedButtons: (content.buttons || []).map(b => ({
            urlButton: {
              displayText: b.displayText,
              url: b.url || '',
            },
          })),
        },
      };
      break;

    case 'productMessage':
      m.productMessage = {
        productId: content.productId || '',
        title: content.title || '',
        description: content.description || '',
        buttons: (content.buttons || []).map(b => ({
          buttonText: { displayText: b.displayText },
          buttonId: b.buttonId || '',
          buttonParamsJson: JSON.stringify({
            display_text: b.displayText,
            url: b.url || '',
          }),
        })),
      };
      break;

    case 'imageMessage':
      m.imageMessage = {
        caption: content.caption || '',
        staticUrl: content.imageUrl || '',
        contextInfo: {
          stanzaId: messageId,
          participant: participant,
          remoteJid: groupId,
        },
      };
      break;

    default:
      m.conversation = content.text || '';
  }

  return base;
}

// ─── Persistência no JSONL ──────────────────────────────────────────────────
function appendCapture(entry: object): void {
  fs.mkdirSync(CAPTURE_DIR, { recursive: true });
  const line = JSON.stringify(entry, null, 0).slice(0, 50000) + '\n';
  fs.appendFileSync(CAPTURE_FILE, line, 'utf-8');
}

function readCaptures(): Array<Record<string, any>> {
  if (!fs.existsSync(CAPTURE_FILE)) return [];
  try {
    const text = fs.readFileSync(CAPTURE_FILE, 'utf-8').trim();
    if (!text) return [];
    return text.split('\n')
      .filter(Boolean)
      .map((line: string) => {
        try { return JSON.parse(line); } catch { return null as any; }
      })
      .filter((e: any): e is Record<string, any> => e != null);
  } catch {
    return [];
  }
}

function clearCapturesForGroup(groupJid: string): number {
  const captures = readCaptures();
  const filtered = captures.filter((c: any) =>
    c.groupId !== groupJid && c.remoteJid !== groupJid
  );
  const removed = captures.length - filtered.length;

  fs.writeFileSync(CAPTURE_FILE, filtered.map((c: any) => JSON.stringify(c)).join('\n') + '\n');
  return removed;
}

// ─── Simulação ──────────────────────────────────────────────────────────────
function simulateMessage(
  msg: SimulatedMessage,
  groupJid: string,
  senderJid: string,
  senderNumber: string,
): Record<string, any> {
  const captureId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = Date.now() - Math.floor(Math.random() * 86400000); // aleatório nos últimos 24h

  const entry: Record<string, any> = {
    captureId,
    capturedAt: new Date(timestamp).toISOString(),
    groupId: groupJid,
    messageId: msg.payload.key.id,
    remoteJid: groupJid,
    participant: senderJid,
    fromMe: false,
    timestamp,
    messageType: msg.type,
    contentType: getContentType(msg.payload),
    senderJid,
    isGroup: true,
    pushName: 'Spammer Indo',
    textPreview: extractTextPreview(msg.payload),
    size: JSON.stringify(msg.payload).length,
    platform: 'whatsapp',
    rawPayloadSafe: msg.payload,
    simulated: true,
    simulationType: msg.type,
    expectedSignals: msg.expectedSignals,
    expectedScore: msg.expectedScore,
    description: msg.description,
  };

  return entry;
}

function getContentType(payload: any): string {
  if (payload.message.buttonsMessage) return 'buttonsMessage';
  if (payload.message.interactiveMessage) return 'interactiveMessage';
  if (payload.message.templateMessage) return 'templateMessage';
  if (payload.message.productMessage) return 'productMessage';
  if (payload.message.imageMessage) return 'imageMessage';
  if (payload.message.extendedTextMessage) return 'extendedTextMessage';
  if (payload.message.conversation) return 'conversation';
  return 'unknown';
}

function extractTextPreview(payload: any): string {
  const m = payload.message;

  // Collect all text from different fields
  const parts: string[] = [];

  if (m.conversation) parts.push(m.conversation);

  if (m.extendedTextMessage) {
    const etm = m.extendedTextMessage;
    if (etm.text) parts.push(etm.text);
    if (etm.caption) parts.push(etm.caption);
  }

  if (m.buttonsMessage) {
    const bm = m.buttonsMessage;
    if (bm.contentText) parts.push(bm.contentText);
    if (bm.footerText) parts.push(bm.footerText);
    // Extract button URLs
    for (const b of bm.buttons || []) {
      try {
        if (b.buttonParamsJson) {
          const params = JSON.parse(String(b.buttonParamsJson));
          if (params.url) parts.push(params.url);
        }
      } catch { /* ignore */ }
    }
  }

  if (m.interactiveMessage) {
    const im = m.interactiveMessage;
    if (im.body?.text) parts.push(im.body.text);
    if (im.header?.title) parts.push(im.header.title);
    if (im.footer?.text) parts.push(im.footer.text);
    const buttons = im.nativeFlowMessage?.buttons || [];
    for (const b of buttons) {
      try {
        if (b.buttonParamsJson) {
          const params = JSON.parse(String(b.buttonParamsJson));
          if (params.url) parts.push(params.url);
        }
      } catch { /* ignore */ }
    }
  }

  if (m.templateMessage?.hydratedTemplate) {
    const tm = m.templateMessage.hydratedTemplate;
    if (tm.hydratedContentText) parts.push(tm.hydratedContentText);
    if (tm.hydratedTitleText) parts.push(tm.hydratedTitleText);
    if (tm.hydratedFooterText) parts.push(tm.hydratedFooterText);
    const buttons = tm.hydratedButtons || [];
    for (const b of buttons) {
      if (b.urlButton?.url) parts.push(b.urlButton.url);
    }
  }

  if (m.productMessage) {
    const pm = m.productMessage;
    if (pm.title) parts.push(pm.title);
    if (pm.description) parts.push(pm.description);
    for (const b of pm.buttons || []) {
      try {
        if (b.buttonParamsJson) {
          const params = JSON.parse(String(b.buttonParamsJson));
          if (params.url) parts.push(params.url);
        }
      } catch { /* ignore */ }
    }
  }

  if (m.imageMessage?.caption) parts.push(m.imageMessage.caption);

  return parts.join('\n').trim();
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  log('===============================================================');
  log('GERADOR DE MENSAGENS DE SPAM DE CASSINO (SIMULAÇÃO)');
  log('===============================================================');
  log(` Grupo:      ${specificGroup}`);
  log(` Remetente:  ${specificSender} (${DEFAULT_SENDER_NUMBER})`);
  log(` Dry-run:    ${dryRun}`);
  log(` Clear first: ${clearFirst}`);
  log(` Count:      ${count || 'todos (8 variantes)'}`);
  log('===============================================================');

  // Clear previous captures do grupo se solicitado
  if (clearFirst) {
    const removed = clearCapturesForGroup(specificGroup);
    log(`Removidas ${removed} capturas anteriores do grupo ${specificGroup}`);
  }

  // Gera mensagens
  const messages = generateSimulatedMessages(specificGroup, specificSender, DEFAULT_SENDER_NUMBER);

  if (count && count > 0) {
    // Repete as mensagens para atingir o count desejado
    const repeated: SimulatedMessage[] = [];
    for (let i = 0; i < count; i++) {
      repeated.push(messages[i % messages.length]);
    }
    // Substitui a lista original
    messages.length = 0;
    messages.push(...repeated);
    log(` Geradas ${messages.length} mensagens (repetindo variantes para atingir ${count})`);
  }

  log(` Total de variantes a simular: ${messages.length}`);

  // Processa cada mensagem
  for (const msg of messages) {
    const entry = simulateMessage(msg, specificGroup, specificSender, DEFAULT_SENDER_NUMBER);

    if (dryRun) {
      log(`\n── Simulação (dry-run) ──`);
      log(`  Tipo:          ${msg.type}`);
      log(`  Descrição:     ${msg.description}`);
      log(`  ContentType:   ${entry.contentType}`);
      log(`  ExpectedScore: ${msg.expectedScore}`);
      log(`  ExpectedSig:   ${msg.expectedSignals.join(', ')}`);
      log(`  TextPreview:   ${entry.textPreview.slice(0, 150)}${entry.textPreview.length > 150 ? '...' : ''}`);
      log(`  (não salvo no JSONL)`);
      continue;
    }

    appendCapture(entry);
    log(`+ Salvada: ${msg.type} (${msg.description}) [score esperado: ${msg.expectedScore}]`);
  }

  // Resumo
  const allCaptures = readCaptures();
  const simulated = allCaptures.filter((c: any) => c.simulated);

  log('===============================================================');
  log('RESUMO');
  log('───────────────────────────────────────────────────────────────');
  log(`Total de capturas no JSONL: ${allCaptures.length}`);
  log(`Capturas simuladas:         ${simulated.length}`);
  log('───────────────────────────────────────────────────────────────');

  for (const c of simulated) {
    log(`  [${c.simulationType}] ${c.messageId} — score esperado: ${c.expectedScore}`);
  }

  log('===============================================================');
  log(`Mensagens simuladas salvas em: ${CAPTURE_FILE}`);

  if (dryRun) {
    log('Modo dry-run: nada foi salvo.');
  } else {
    log('Agora execute o script apagar-spam.ts para testar a detecção e exclusão.');
  }

  log('===============================================================');
}

main().catch(err => {
  logError(`Erro fatal: ${err.message || err}`);
  process.exit(1);
});
