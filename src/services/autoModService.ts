/**
 * 🔒 WarriorBlack - Auto Moderation Service
 * 
 * Sistema de moderação automática para detectar e remover spam,
 * links de cassino e conteúdo suspeito.
 */

import { Message, Chat } from 'whatsapp-web.js';
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

// Configuração padrão (pode ser expandido para ser por grupo)
const defaultConfig: ModConfig = {
  enabled: true,
  autoKickSpam: true,
  autoKickCasino: true,
  autoDeleteLinks: true,
  deleteViewOnce: false, // Não deletar view once por padrão
  filterInteractiveMessages: true, // Detectar mensagens interativas/cards
  filterForeignNumbers: true, // Filtrar números internacionais
  filterSuspiciousKeywords: true, // Filtrar palavras-chave suspeitas
};

// Padrões suspeitos
const CASINO_PATTERNS = [
  /\b(cassino|casino|bet|apostas?)\b/i,
  /\b(slot|777|🎰|🎲)\b/i,
  /\b(ganhar dinheiro|dinheiro fácil|renda extra)\b/i,
  /\b(bônus|bonus|deposito|saque)\b/i,
  /taxa de vit[oó]rias?/i,
  /recolh[ae]r?\s+(cont[ií]nu[oa]|b[oô]nus)/i,
  /recolhidos\s+\xE0\s+vontade/i,
  /to\d+\.game/i, 
  /pp7\.wtf/i,
  /\.wtf\?c=/i,
  /\.(game|bet|casino|slots?)\b/i,
];

const SPAM_INDICATORS = [
  /clique\s+(na|no)\s+(imagem|link|aqui)/i,
  /para\s+prosseguir/i,
  /📠.*🍈.*🥅.*👳/i, // Sequência de emojis suspeitos
  /https?:\/\/[^\s]+\.(game|bet|win|xyz|top|click)/i,
];

const SUSPICIOUS_DOMAINS = [
  'to7.game',
  'bet365',
  'pixbet',
  '1xbet',
  'betano',
  'pp7.wtf',
  // Adicione mais domínios suspeitos aqui
];

// Padrões de palavras-chave específicas para spam interativo
const INTERACTIVE_SPAM_KEYWORDS = [
  /taxa\s+de\s+vit[oó]rias?/i,
  /recolha\s+cont[ií]nua/i,
  /b[oô]nus/i,
  /recolhidos\s+à\s+vontade/i,
  /\.bet/i,
  /\.wtf\?c=/i,
  /\.game/i,
  /pp7\.wtf/i,
];

/**
 * Verifica se uma mensagem contém conteúdo suspeito
 */
export function isSpamMessage(text: string): boolean {
  if (!text) return false;

  // Verificar padrões de cassino
  for (const pattern of CASINO_PATTERNS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Verificar indicadores de spam
  for (const pattern of SPAM_INDICATORS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Verificar domínios suspeitos
  for (const domain of SUSPICIOUS_DOMAINS) {
    if (text.toLowerCase().includes(domain)) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se uma mensagem tem links suspeitos
 */
export function hasSuspiciousLink(text: string): boolean {
  if (!text) return false;

  // Links encurtados (comum em spam)
  const shortLinkPatterns = [
    /bit\.ly/i,
    /tinyurl/i,
    /goo\.gl/i,
    /t\.co/i,
  ];

  for (const pattern of shortLinkPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Extrai texto de mensagens interativas/cards complexos
 */
export function extractTextFromInteractiveMessage(msg: Message): string {
  let text = msg.body || '';

  // Tentar extrair texto de diferentes tipos de mensagens interativas
  const msgData = (msg as any)._data || {};

  // Verificar caption (legenda de mídia)
  if (msgData.caption && !text) {
    text = msgData.caption;
  }

  // Verificar templateMessage
  if (msgData.templateMessage) {
    const template = msgData.templateMessage;
    if (template.hydratedTemplate) {
      const hydrated = template.hydratedTemplate;
      if (hydrated.hydratedContentText) text += ' ' + hydrated.hydratedContentText;
      if (hydrated.hydratedFooterText) text += ' ' + hydrated.hydratedFooterText;
      if (hydrated.hydratedTitleText) text += ' ' + hydrated.hydratedTitleText;
    }
  }

  // Verificar buttonsMessage
  if (msgData.buttonsMessage) {
    const buttons = msgData.buttonsMessage;
    if (buttons.contentText) text += ' ' + buttons.contentText;
    if (buttons.footerText) text += ' ' + buttons.footerText;
    if (buttons.headerText) text += ' ' + buttons.headerText;
    // Extrair texto dos botões
    if (buttons.buttons && Array.isArray(buttons.buttons)) {
      for (const btn of buttons.buttons) {
        if (btn.buttonText && btn.buttonText.displayText) {
          text += ' ' + btn.buttonText.displayText;
        }
      }
    }
  }

  // Verificar interactiveMessage
  if (msgData.interactiveMessage) {
    const interactive = msgData.interactiveMessage;
    if (interactive.body && interactive.body.text) text += ' ' + interactive.body.text;
    if (interactive.footer && interactive.footer.text) text += ' ' + interactive.footer.text;
    if (interactive.header && interactive.header.title) text += ' ' + interactive.header.title;
    // Extrair texto de botões nativos
    if (interactive.nativeFlowMessage && interactive.nativeFlowMessage.buttons) {
      for (const btn of interactive.nativeFlowMessage.buttons) {
        if (btn.name) text += ' ' + btn.name;
      }
    }
  }

  // Verificar listMessage
  if (msgData.listMessage) {
    const list = msgData.listMessage;
    if (list.description) text += ' ' + list.description;
    if (list.title) text += ' ' + list.title;
    if (list.sections && Array.isArray(list.sections)) {
      for (const section of list.sections) {
        if (section.title) text += ' ' + section.title;
        if (section.rows && Array.isArray(section.rows)) {
          for (const row of section.rows) {
            if (row.title) text += ' ' + row.title;
            if (row.description) text += ' ' + row.description;
          }
        }
      }
    }
  }

  // Verificar productMessage
  if (msgData.productMessage) {
    const product = msgData.productMessage;
    if (product.title) text += ' ' + product.title;
    if (product.description) text += ' ' + product.description;
  }

  return text.trim();
}

/**
 * Verifica se o número é internacional (não brasileiro)
 */
export function isForeignNumber(phoneNumber: string): boolean {
  if (!phoneNumber) return false;
  
  // Limpar o número (remover @c.us, @s.whatsapp.net, etc.)
  const cleanNumber = phoneNumber.replace(/@.*$/, '').replace(/\D/g, '');
  
  // Se não começar com 55 (Brasil), é internacional
  return !cleanNumber.startsWith('55');
}

/**
 * Verifica palavras-chave suspeitas específicas para spam interativo
 */
export function hasSuspiciousKeywords(text: string): boolean {
  if (!text) return false;

  for (const pattern of INTERACTIVE_SPAM_KEYWORDS) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Processa mensagem para moderação automática
 */
export async function processAutoMod(
  msg: Message,
  client: any,
  config: Partial<ModConfig> = {}
): Promise<void> {
  const fullConfig = { ...defaultConfig, ...config };

  if (!fullConfig.enabled) return;

  try {
    const chat = await msg.getChat();
    
    // Só processar em grupos
    if (!chat.isGroup) return;

    // Extrair texto de mensagens interativas/cards complexos
    let messageText = msg.body || '';
    if (fullConfig.filterInteractiveMessages) {
      messageText = extractTextFromInteractiveMessage(msg);
    }
    
    const hasMedia = msg.hasMedia;
    // isViewOnce pode não existir em todas as versões
    const isViewOnce = (msg as any).isViewOnce || false;

    // Recarregar chat para obter participantes atualizados
    const freshChat = await client.getChatById(chat.id._serialized);
    const participants = Array.isArray(freshChat?.participants)
      ? freshChat.participants
      : Array.isArray(freshChat?.groupMetadata?.participants)
        ? freshChat.groupMetadata.participants
        : [];

    // Verificar se o bot é admin
    const botId = cleanId(client?.info?.wid?._serialized || '');
    const botParticipant = participants.find((p: any) => {
      const participantId = cleanId(p.id?._serialized || '');
      return p.isMe || (!!botId && participantId === botId);
    });

    const isBotAdmin = Boolean(botParticipant?.isAdmin || botParticipant?.isSuperAdmin);

    if (!isBotAdmin) {
      // Bot não é admin, não pode fazer nada
      return;
    }

    // Verificar se o autor é admin
    const authorId = cleanId(msg.author || msg.from);
    const authorParticipant = participants.find(
      (p: any) => cleanId(p.id?._serialized || '') === authorId
    );
    const isAuthorAdmin = Boolean(authorParticipant?.isAdmin || authorParticipant?.isSuperAdmin);

    // Não moderar admins
    if (isAuthorAdmin) return;

    let shouldKick = false;
    let reason = '';

    // 1. Filtro por DDI (Estrangeiros enviando links/cards)
    const authorRaw = msg.author || msg.from;
    const isForeign = !authorRaw.startsWith('55');
    const hasLinks = messageText.includes('http') || messageText.includes('.com') || messageText.includes('.bet') || messageText.includes('.wtf');
    
    // Se for estrangeiro e enviar link ou card interativo
    if (isForeign && (hasLinks || msg.type === 'interactive' || msg.type === 'template' || msg.type === 'buttons')) {
      shouldKick = true;
      reason = '🚫 Filtro de DDI: Usuário estrangeiro enviando conteúdo suspeito';
    }

    // 2. Detectar spam de cassino no texto extraído
    if (!shouldKick && fullConfig.autoKickCasino && isSpamMessage(messageText)) {
      shouldKick = true;
      reason = '🚫 Spam de cassino/apostas detectado';
    }

    // Detectar palavras-chave suspeitas (spam interativo)
    if (!shouldKick && fullConfig.filterSuspiciousKeywords && hasSuspiciousKeywords(messageText)) {
      shouldKick = true;
      reason = '🚫 Palavras-chave suspeitas detectadas';
    }

    // Detectar links suspeitos com mídia (comum em spam)
    if (!shouldKick && fullConfig.autoKickSpam && hasMedia && hasSuspiciousLink(messageText)) {
      shouldKick = true;
      reason = '🚫 Link suspeito com mídia detectado';
    }

    // Detectar números internacionais enviando links/mensagens interativas
    if (!shouldKick && fullConfig.filterForeignNumbers) {
      const authorNumber = msg.author || msg.from;
      if (isForeignNumber(authorNumber)) {
        // Se número internacional enviou link ou mensagem interativa, remover
        if (hasSuspiciousLink(messageText) || hasMedia || messageText.length > 50) {
          shouldKick = true;
          reason = '🚫 Número internacional detectado com conteúdo suspeito';
        }
      }
    }

    // Executar ação de moderação
    if (shouldKick) {
      console.log(`[AutoMod] Detectado spam de ${msg.author}: ${reason}`);

      try {
        // 1. Deletar a mensagem
        await msg.delete(true);
        console.log('[AutoMod] Mensagem deletada');

        // 2. Remover usuário do grupo
        await (chat as any).removeParticipants([msg.author || msg.from]);
        console.log('[AutoMod] Usuário removido do grupo');

        // 3. Enviar notificação ao grupo
        await chat.sendMessage(
          `${reason}\n\n` +
          `👤 Usuário removido automaticamente.\n` +
          `🛡️ AutoMod ativo - Grupo protegido.`
        );

      } catch (error) {
        console.error('[AutoMod] Erro ao executar moderação:', error);
      }
    }

  } catch (error) {
    console.error('[AutoMod] Erro no processamento:', error);
  }
}

/**
 * Ativa o auto-mod em um cliente WhatsApp
 */
export function enableAutoMod(client: any, config: Partial<ModConfig> = {}): void {
  console.log('[AutoMod] Sistema de moderação automática ativado');

  client.on('message_create', async (msg: Message) => {
    // Processar apenas mensagens de outros (não do bot)
    if (!msg.fromMe) {
      await processAutoMod(msg, client, config);
    }
  });
}

/**
 * Obtém a configuração atual do AutoMod
 */
export function getAutoModConfig(): ModConfig {
  return { ...defaultConfig };
}

/**
 * Atualiza a configuração do AutoMod
 */
export function updateAutoModConfig(updates: Partial<ModConfig>): ModConfig {
  Object.assign(defaultConfig, updates);
  console.log('[AutoMod] Configuração atualizada:', defaultConfig);
  return { ...defaultConfig };
}
