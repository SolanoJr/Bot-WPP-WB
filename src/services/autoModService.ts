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

/**
 * Padrões de Regex para Spam e Cassino (Regras Estritas)
 */
const SPAM_PATTERNS = [
  /taxa\s+de\s+vit[oó]rias?/i,
  /recolha\s+cont[ií]nua/i,
  /b[oô]nus/i,
  /recolhidos\s+à\s+vontade/i,
  /pp7\.wtf/i,
  /\.bet/i,
  /\.wtf\?c=/i,
  /ganhar\s+dinheiro/i,
  /lucro\s+f[aá]cil/i,
  /🎰|🎲|bet/i,
  /https?:\/\/[^\s]+\.(wtf|bet|game|win|xyz|top|click)/i
];

/**
 * Extrai texto oculto de mensagens interativas/cards complexos
 */
export function extractTextFromInteractiveMessage(msg: Message): string {
  let text = msg.body || '';
  const msgData = (msg as any)._data || {};

  // Captura caption de mídia
  if (msgData.caption) text += ' ' + msgData.caption;

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
    msgData.listMessage?.description,
    msgData.listMessage?.title
  ];

  text += ' ' + interactiveSources.filter(Boolean).join(' ');

  // Extrair texto de botões
  const buttons = [
    ...(msgData.buttonsMessage?.buttons || []),
    ...(msgData.interactiveMessage?.nativeFlowMessage?.buttons || [])
  ];

  buttons.forEach((btn: any) => {
    if (btn.buttonText?.displayText) text += ' ' + btn.buttonText.displayText;
    if (btn.name) text += ' ' + btn.name;
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
    const isInteractive = ['interactive', 'template', 'buttons'].includes(msg.type) || !!(msg as any)._data?.interactiveMessage;

    // 2. Verificação de Admin (Bot precisa ser admin, Autor não pode ser admin)
    const freshChat = await client.getChatById(chat.id._serialized);
    const participants = freshChat.participants || [];
    const botId = cleanId(client.info.wid._serialized);
    
    const botPart = participants.find((p: any) => cleanId(p.id._serialized) === botId);
    if (!botPart?.isAdmin && !botPart?.isSuperAdmin) return false;

    const authorPart = participants.find((p: any) => cleanId(p.id._serialized) === cleanId(authorId));
    if (authorPart?.isAdmin || authorPart?.isSuperAdmin) return false;

    let shouldBan = false;
    let reason = '';

    // REGRA 1: DDI Estrangeiro + (Link ou Interativo)
    if (defaultConfig.filterForeignNumbers && isForeignNumber(authorId)) {
        const hasLink = /https?:\/\/[^\s]+/i.test(messageText);
        if (hasLink || isInteractive) {
            shouldBan = true;
            reason = '🚫 [DDI ESTRANGEIRO] Link ou Mensagem Interativa detectada de número não-55.';
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
            // 1. Deletar mensagem
            await msg.delete(true);
            
            // 2. Banir usuário
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
