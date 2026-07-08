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
  const cleanGroup = groupId.replace(/^(wpp:|tg:|dc:)/, '');
  const cleanMember = memberId.replace(/^(wpp:|tg:|dc:)/, '');
  
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
  /\.bet($|[\s/\?])/i,
  /\.wtf\?c=/i,
  /ganhar\s+dinheiro/i,
  /lucro\s+f[aá]cil/i,
  /🎰|🎲|\bbet\b/i,
  /https?:\/\/[^\s]+\.(wtf|bet|game|win|xyz|top|click)/i
];

/**
 * Extrai texto oculto de mensagens interativas/cards complexos de forma profunda
 */
export function extractTextFromInteractiveMessage(msg: Message): string {
  let text = msg.body || '';
  const msgData = (msg as any)._data || msg || {};

  // Captura caption de mídia e textos comuns
  if (msgData.caption) text += ' ' + msgData.caption;
  if (msgData.matchedText) text += ' ' + msgData.matchedText;
  if (msgData.text) text += ' ' + msgData.text;

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
export async function processAutoMod(msg: Message, client: any): Promise<boolean> {
  if (!defaultConfig.enabled || msg.fromMe) return false;

  try {
    const chat = await msg.getChat();
    if (!chat.isGroup) return false;

    // 1. Extração de conteúdo (incluindo interativos)
    const messageText = extractTextFromInteractiveMessage(msg);
    const authorId = msg.author || msg.from;
    
    // Identificar se a mensagem veio em formato interativo
    const isInteractive = ['interactive', 'template', 'buttons', 'list_response', 'buttons_response'].includes(msg.type) || 
                          !!(msg as any)._data?.interactiveMessage || 
                          !!(msg as any)._data?.templateMessage || 
                          !!(msg as any)._data?.buttonsMessage;

    // 2. Verificação de Admin (Bot precisa ser admin, Autor não pode ser admin)
    const freshChat = await client.getChatById(chat.id._serialized);
    const participants = freshChat.participants || [];
    const botId = client.info?.wid?._serialized ? cleanId(client.info.wid._serialized) : '';
    
    const botPart = participants.find((p: any) => cleanId(p.id._serialized) === botId);
    if (!botPart?.isAdmin && !botPart?.isSuperAdmin) return false;

    const authorPart = participants.find((p: any) => cleanId(p.id._serialized) === cleanId(authorId));
    if (authorPart?.isAdmin || authorPart?.isSuperAdmin) return false;

    let shouldBan = false;
    let reason = '';

    // REGRA 1: DDI Estrangeiro + (Link ou Interativo) nos primeiros 10 minutos
    if (defaultConfig.filterForeignNumbers && isForeignNumber(authorId)) {
        const cleanGroup = chat.id._serialized.replace(/^(wpp:|tg:|dc:)/, '');
        const cleanAuthor = authorId.replace(/^(wpp:|tg:|dc:)/, '');
        const joinKey = `${cleanGroup}:${cleanAuthor}`;
        const joinTime = joinTimestamps.get(joinKey);
        
        if (joinTime && (Date.now() - joinTime) < FIRST_MINUTES_LIMIT_MS) {
            const hasLink = /https?:\/\/[^\s]+/i.test(messageText) || messageText.includes('http://') || messageText.includes('https://');
            if (hasLink || isInteractive) {
                shouldBan = true;
                reason = '🚫 [DDI ESTRANGEIRO] Link ou Mensagem Interativa nos primeiros 10 minutos no grupo.';
            }
        }
    }

    // REGRA 2: Palavras-Chave / Regex de Spam
    if (!shouldBan && defaultConfig.filterSuspiciousKeywords) {
        for (const pattern of SPAM_PATTERNS) {
            if (pattern.test(messageText)) {
                shouldBan = true;
                reason = `🚫 [SPAM DETECTADO] Conteúdo suspeito: "${pattern.source}"`;
                break;
            }
        }
    }

    if (shouldBan) {
        console.log(`🛡️ [AutoMod] Aplicando punição para ${authorId}. Motivo: ${reason}`);

        // Ações de Punição Imediata
        try {
            // 1. Deletar mensagem para todos
            await msg.delete(true);
            
            // 2. Banir usuário (remover do grupo)
            await chat.removeParticipants([authorId]);

            // 3. Notificar grupo
            await chat.sendMessage(`🛡️ *AutoMod WarriorBlack*\n\n⚠️ Usuário removido!\n👤 @${authorId.split('@')[0]}\n📝 Motivo: ${reason}`, {
                mentions: [authorId]
            });

            return true;
        } catch (err: any) {
            console.error(`❌ [AutoMod] Erro ao punir: ${err.message}`);
        }
    }

    return false;
  } catch (error: any) {
    console.error(`❌ [AutoMod] Erro crítico: ${error.message}`);
    return false;
  }
}

export const getAutoModConfig = () => ({ ...defaultConfig });

export const updateAutoModConfig = (updates: Partial<ModConfig>) => {
  Object.assign(defaultConfig, updates);
  return { ...defaultConfig };
};
