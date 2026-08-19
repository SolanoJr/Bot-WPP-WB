/**
 * 🔒 WarriorBlack - Auto Moderation Service
 * 
 * Sistema de moderação automática para detectar e remover spam,
 * links de cassino e conteúdo suspeito.
 */

import { Message } from 'whatsapp-web.js';
import { cleanId } from './permissions';

export interface ModConfig {
  enabled: boolean;
  autoKickSpam: boolean;
  autoKickCasino: boolean;
  autoDeleteLinks: boolean;
  deleteViewOnce: boolean;
  filterInteractiveMessages: boolean;
  filterForeignNumbers: boolean;
  filterSuspiciousKeywords: boolean;
}

// Configuração padrão global
const defaultConfig: ModConfig = {
  enabled: true,
  autoKickSpam: true,
  autoKickCasino: true,
  autoDeleteLinks: true,
  deleteViewOnce: false,
  filterInteractiveMessages: true, 
  filterForeignNumbers: true, 
  filterSuspiciousKeywords: true, 
};

// Map para armazenar timestamps de entrada dos membros (chave: "grupo:usuario", valor: timestamp ms)
export const joinTimestamps = new Map<string, number>();

export const FIRST_MINUTES_LIMIT_MS = 10 * 60 * 1000; // 10 minutos

export function recordMemberJoin(groupId: string, memberId: string): void {
  console.log('[recordMemberJoin] ENTRY - groupId:', groupId, 'memberId:', memberId);
  const cleanGroup = groupId.replace(/^(wpp:|tg:|dc:)/, '');
  const cleanMember = memberId.replace(/^(wpp:|tg:|dc:)/, '');
  
  console.log('[recordMemberJoin] cleanGroup:', cleanGroup, 'cleanMember:', cleanMember);
  
  // Limpeza de entradas antigas para evitar vazamento de memória
  const now = Date.now();
  for (const [key, value] of joinTimestamps.entries()) {
    if (now - value > FIRST_MINUTES_LIMIT_MS) {
      joinTimestamps.delete(key);
    }
  }
  
  joinTimestamps.set(`${cleanGroup}:${cleanMember}`, now);
  console.log(`🛡️ [AutoMod] Entrada registrada para @${cleanMember.split('@')[0]} no grupo ${cleanGroup}`);
}

/**
 * Padrões de Regex para Spam e Cassino (Regras Estritas)
 */
const SPAM_PATTERNS = [
  /taxa\s+de\s+vit[oó]rias?/i,
  /recolha\s+cont[ií]nua/i,
  /b[oôó]nus/i,
  /recolhidos\s+à\s+vontade/i,
  /pp7\.wtf/i,
  /\.bet($|[\s/?])/i,
  /\.wtf\?c=/i,
  /ganhar\s+dinheiro/i,
  /lucro\s+f[aá]cil/i,
  /🎰|🎲|\bbet\b/i,
  // Domínios de cassino/apostas comuns (inclui kl7.games, ck7, etc)
  /https?:\/\/[^\\s]+(\.(wtf|bet|game|win|xyz|top|click|casino|fun|pk|sh|games?|play))/i,
  /https?:\/\/[^\\s]*(bet|casino|win|game|777|jackpot|slot)/i,
  // Marcas de bot de cassino (ex: CK7 BET, kl7)
  /\b(ck|kl|kc|kw)\d+\s*bet\b/i,
  /\bbet\b\s*(?:777|99|club)?/i,
  // Número de contato + convite (padrão MI065085 / +62 etc)
  /entrou usando o link|usou o link do grupo/i
];

/**
 * Extrai texto oculto de mensagens interativas/cards complexos de forma profunda
 */
export function extractTextFromInteractiveMessage(msg: Message): string {
  let text = msg.body || '';
  const msgData = (msg as any)._data || {};

  // Captura caption de mídia e textos comuns
  if (msgData.caption) text += ' ' + msgData.caption;
  if (msgData.matchedText) text += ' ' + msgData.matchedText;
  if (msgData.text) text += ' ' + msgData.text;
  // Fallback agressivo: serializa o _data todo (imagens/cards manyam texto em campos variados)
  try {
    if (Object.keys(msgData).length > 0) {
      const all = JSON.stringify(msgData);
      if (all && all.length < 20000) text += ' ' + all;
    }
  } catch { /* ignora */ }

  // templateMessage / buttonsMessage / interactiveMessage
  const interactiveSources = [
    msgData.templateMessage?.hydratedTemplate?.hydratedContentText,
    msgData.templateMessage?.hydratedTemplate?.hydratedFooterText,
    msgData.templateMessage?.hydratedTemplate?.hydratedTitleText,
    msgData.buttonsMessage?.contentText,
    msgData.buttonsMessage?.footerText,
    msgData.buttonsMessage?.headerText,
    msgData.interactiveMessage?.body?.text,
    msgData.interactiveMessage?.footer?.text,
    msgData.interactiveMessage?.header?.title,
    msgData.interactiveMessage?.header?.subtitle,
    msgData.listMessage?.description,
    msgData.listMessage?.title,
    msgData.listResponse?.title,
    msgData.listResponse?.description
  ];

  text += ' ' + interactiveSources.filter(Boolean).join(' ');

  // Extrair texto de botões (inclui botões normais, de templates e native flows)
  const buttons = [
    ...(msgData.buttons || []),
    ...(msgData.buttonsMessage?.buttons || []),
    ...(msgData.interactiveMessage?.nativeFlowMessage?.buttons || []),
    ...(msgData.templateMessage?.hydratedTemplate?.hydratedButtons || [])
  ];

  buttons.forEach((btn: any) => {
    if (btn.buttonText?.displayText) text += ' ' + btn.buttonText.displayText;
    if (btn.name) text += ' ' + btn.name;
    if (btn.reply?.displayText) text += ' ' + btn.reply.displayText;
    if (btn.quickReplyButton?.displayText) text += ' ' + btn.quickReplyButton.displayText;
    if (btn.urlButton?.displayText) text += ' ' + btn.urlButton.displayText;
    if (btn.urlButton?.url) text += ' ' + btn.urlButton.url;
    if (btn.buttonParamsJson) {
      try {
        const params = JSON.parse(btn.buttonParamsJson);
        if (params.display_text) text += ' ' + params.display_text;
        if (params.url) text += ' ' + params.url;
      } catch (e) {}
    }
  });

  return text.trim();
}

/**
 * Verifica se o número é estrangeiro (não começa com 55)
 */
export function isForeignNumber(userId: string): boolean {
  const clean = userId.replace(/\D/g, '');
  return !clean.startsWith('55');
}

/**
 * Processa a moderação automática seguindo regras estritas
 */
export async function processAutoMod(msg: any, client: any): Promise<boolean> {
  console.log('[AutoMod] ENTRY - msg:', !!msg, 'client:', !!client);
  // Não moderar a PRÓPRIA mensagem do bot (evita o bot se auto-apagar/apagar seu aviso)
  if (msg?.fromMe) return false;
  // AutoMod por grupo (persistido): lê a config. Se nada relevante estiver ligado, pula.
  let groupIdForCheck = msg.from;
  try {
    const chat = await Promise.race([
      msg.getChat().catch(() => null),
      new Promise((res) => setTimeout(() => res(null), 4000))
    ]).catch(() => null);
    groupIdForCheck = chat?.id?._serialized || msg.from;
  } catch { /* ignora */ }
  // Normaliza prefixos de plataforma (wpp:/tg:/dc:) para bater com o SQLite
  groupIdForCheck = String(groupIdForCheck || '').replace(/^(wpp:|tg:|dc:)/, '');
  try {
    const { getGroupMod } = await import('./databaseService');
    const mod = await getGroupMod(groupIdForCheck);
    const anyOn = mod.antispam || mod.antiestrangeiro || mod.autolink;
    if (!anyOn) {
      console.log('[AutoMod] nenhum módulo de mensagem ligado neste grupo:', groupIdForCheck);
      return false;
    }
  } catch (dbErr: any) {
    console.error('[AutoMod] erro ao checar DB (assumindo off):', dbErr?.message);
    return false;
  }

  try {
    // Obter chat de forma resiliente: o WWebJS quebra com "r:r" (Issue #201838)
    // em chats @lid, deixando participants vazio. Se não conseguirmos verificar,
    // ASSUMIR que o bot é admin (prosseguir) — o WWebJS retorna erro real se não for.
    let chat: any = null;
    try {
      chat = await Promise.race([
        msg.getChat(),
        new Promise((res) => setTimeout(() => res(null), 4000))
      ]).catch(() => null);
    } catch (gcErr: any) {
      console.warn(`[AutoMod] getChat falhou (${gcErr?.message}); assumindo bot admin.`);
    }
    const groupId = String(chat?.id?._serialized || msg.from || '').replace(/^(wpp:|tg:|dc:)/, '');
    const authorId = msg.author || msg.from;
    console.log('[AutoMod] authorId:', authorId, 'groupId:', groupId);

    // 1. Extração de conteúdo (incluindo interativos)
    const messageText = extractTextFromInteractiveMessage(msg);
    
    // Identificar se a mensagem veio em formato interativo
    const isInteractive = ['interactive', 'template', 'buttons', 'list_response', 'buttons_response'].includes(msg.type) || 
                          !!(msg as any)._data?.interactiveMessage || 
                          !!(msg as any)._data?.templateMessage || 
                          !!(msg as any)._data?.buttonsMessage;

    // 2. Verificação de Admin (Bot precisa ser admin, Autor não pode ser admin)
    // Se não conseguimos obter participants (erro r:r), assumimos que o bot é admin
    // para não abortar a moderação silenciosamente.
    const participants = chat?.participants || [];
    const botId = client.info?.wid?._serialized ? cleanId(client.info.wid._serialized) : '';
    console.log('[AutoMod] botId:', botId, 'participants:', participants.length);

    const botPart = participants.find((p: any) => {
      const pId = p?.id?._serialized ? cleanId(p.id._serialized) : null;
      return pId === botId;
    });
    // Resiliente: se participants vazio (falha r:r), assumir bot admin.
    const botIsAdmin = participants.length === 0 ? true : !!(botPart?.isAdmin || botPart?.isSuperAdmin);
    if (!botIsAdmin) return false;

    const authorClean = cleanId(authorId);
    const authorPart = participants.find((p: any) => {
      const pId = p?.id?._serialized ? cleanId(p.id._serialized) : null;
      return pId === authorClean;
    });
    console.log('[AutoMod] authorPart:', !!authorPart, 'authorPart.isAdmin:', authorPart?.isAdmin, 'authorPart.isSuperAdmin:', authorPart?.isSuperAdmin);
    // Se o getChat nao entregou participants confiaveis, verificar admin no
    // groupMetadata (autoritativo) antes de decidir se eh admin.
    let authorIsAdmin = Boolean(authorPart?.isAdmin || authorPart?.isSuperAdmin);
    if (!authorIsAdmin && typeof (client as any).isParticipantAdmin === 'function') {
      try {
        authorIsAdmin = await (client as any).isParticipantAdmin(groupId || msg.from, authorId);
      } catch { authorIsAdmin = false; }
    }
    if (authorIsAdmin) return false;

    const { getGroupMod, banUser } = await import('./databaseService');
    const mod = await getGroupMod(groupId);

    let detected = false;
    let reason = '';

    // REGRA 1: DDI Estrangeiro + (Link ou Interativo) nos primeiros 10 minutos
    if (mod.antiestrangeiro && isForeignNumber(authorId)) {
        const cleanGroup = (groupId || msg.from).replace(/^(wpp:|tg:|dc:)/, '');
        const cleanAuthor = authorId.replace(/^(wpp:|tg:|dc:)/, '');
        const joinKey = `${cleanGroup}:${cleanAuthor}`;
        const joinTime = joinTimestamps.get(joinKey);
        
        if (joinTime && (Date.now() - joinTime) < FIRST_MINUTES_LIMIT_MS) {
            const hasLink = /https?:\/\/[^\\s]+/i.test(messageText) || messageText.includes('http://') || messageText.includes('https://');
            if (hasLink || isInteractive) {
                detected = true;
                reason = '🚫 [DDI ESTRANGEIRO] Link ou Mensagem Interativa nos primeiros 10 minutos no grupo.';
            }
        }
    }

    // REGRA 2: Palavras-Chave / Regex de Spam
    if (!detected && mod.antispam) {
        for (const pattern of SPAM_PATTERNS) {
            if (pattern.test(messageText)) {
                detected = true;
                reason = `🚫 [SPAM DETECTADO] Conteúdo suspeito: "${pattern.source}"`;
                break;
            }
        }
    }

    // REGRA 3: Links (antilink) — apaga a mensagem se ligado
    if (!detected && mod.autolink) {
        const hasLink = /https?:\/\/[^\\s]+/i.test(messageText);
        if (hasLink) {
            detected = true;
            reason = '🚫 [ANTILINK] Links não são permitidos neste grupo.';
        }
    }

    if (detected) {
      console.log(`🛡️ [AutoMod] Detectado para ${authorId}. Motivo: ${reason} | detectar=${mod.detectar} remover=${mod.remover}`);

      const grpName = chat?.name ? ` 🏢 ${chat.name}` : '';

      // 1. Detectar = avisar o grupo (mesmo se não remover)
      if (mod.detectar) {
        try {
          const notify = `🛡️ *AutoMod WarriorBlack*${grpName}\n\n⚠️ Detectado!\n👤 @${authorId.split('@')[0]}\n📝 Motivo: ${reason}${mod.remover ? '' : '\nℹ️ (Remoção desativada — apenas aviso)'}`;
          if (typeof (client as any).sendMessage === 'function') {
            await (client as any).sendMessage(groupId, notify, { mentions: [authorId] });
          } else if (chat) {
            await chat.sendMessage(notify, { mentions: [authorId] });
          }
        } catch (err: any) {
          console.error(`❌ [AutoMod] Erro ao notificar detecção: ${err.message}`);
        }
      }

      // 2. Remover = banir (remover do grupo + lista negra + bloquear)
      if (mod.remover) {
        try {
          // Apagar mensagem
          try { await msg.delete(true); } catch { /* ignora */ }
          // Salvar na lista negra
          try {
            await banUser({ groupId, userId: authorId, bannedBy: 'AutoMod', reason });
          } catch { /* ignora */ }
          // Bloquear contato
          try { await (client as any).blockContact?.(authorId); } catch { /* ignora */ }
          // Remover do grupo
          try {
            if (typeof (client as any).removeParticipant === 'function') {
              await (client as any).removeParticipant(groupId, authorId);
            } else if (typeof (client as any).removeParticipants === 'function') {
              const cleanGroup = groupId.replace(/^(wpp:|tg:|dc:)/, '');
              let cleanAuthor = authorId.replace(/^(wpp:|tg:|dc:)/, '');
              if (cleanAuthor.endsWith('@lid')) cleanAuthor = cleanAuthor.replace('@lid', '@c.us');
              await (client as any).removeParticipants(cleanGroup, [cleanAuthor]);
            } else if (chat) {
              await chat.removeParticipants([authorId.replace(/^(wpp:|tg:|dc:)/, '')]);
            }
          } catch (err: any) {
            console.error(`❌ [AutoMod] Erro ao remover participante: ${err.message}`);
          }
        } catch (err: any) {
          console.error(`❌ [AutoMod] Erro ao punir: ${err.message}`);
        }
      }

      return true;
    }

    return false;
  } catch (error: any) {
    console.error(`❌ [AutoMod] Erro crítico: ${error.message}`);
    // BUG 3: JSON.stringify pode falhar em objetos circulares - usar log seguro
    console.error(`❌ [AutoMod] Erro name:`, error.name);
    console.error(`❌ [AutoMod] Erro code:`, error.code);
    console.error(`❌ [AutoMod] Erro stack:`, error.stack);
    return false;
  }
}

export const getAutoModConfig = () => ({ ...defaultConfig });

export const updateAutoModConfig = (updates: Partial<ModConfig>) => {
  Object.assign(defaultConfig, updates);
  return { ...defaultConfig };
};
