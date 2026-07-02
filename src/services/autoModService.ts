/**
 * 🔒 WarriorBlack - Auto Moderation Service
 * 
 * Sistema de moderação automática para detectar e remover spam,
 * links de cassino e conteúdo suspeito.
 */

import { Message, Chat } from 'whatsapp-web.js';
import { cleanId } from './permissions';

interface ModConfig {
  enabled: boolean;
  autoKickSpam: boolean;
  autoKickCasino: boolean;
  autoDeleteLinks: boolean;
  deleteViewOnce: boolean;
}

// Configuração padrão (pode ser expandido para ser por grupo)
const defaultConfig: ModConfig = {
  enabled: true,
  autoKickSpam: true,
  autoKickCasino: true,
  autoDeleteLinks: true,
  deleteViewOnce: false, // Não deletar view once por padrão
};

// Padrões suspeitos
const CASINO_PATTERNS = [
  /\b(cassino|casino|bet|apostas?)\b/i,
  /\b(slot|777|🎰|🎲)\b/i,
  /\b(ganhar dinheiro|dinheiro fácil|renda extra)\b/i,
  /\b(bônus|bonus|deposito|saque)\b/i,
  /alta taxa de vit[oó]rias?/i,
  /recolh[ae]r?\s+(cont[ií]nu[oa]|b[oô]nus)/i,
  /to\d+\.game/i, // Links tipo to7.game
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
  // Adicione mais domínios suspeitos aqui
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

    const messageText = msg.body || '';
    const hasMedia = msg.hasMedia;
    const isViewOnce = msg.isViewOnce;

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

    // Detectar spam de cassino
    if (fullConfig.autoKickCasino && isSpamMessage(messageText)) {
      shouldKick = true;
      reason = '🚫 Spam de cassino/apostas detectado';
    }

    // Detectar links suspeitos com mídia (comum em spam)
    if (!shouldKick && fullConfig.autoKickSpam && hasMedia && hasSuspiciousLink(messageText)) {
      shouldKick = true;
      reason = '🚫 Link suspeito com mídia detectado';
    }

    // Executar ação de moderação
    if (shouldKick) {
      console.log(`[AutoMod] Detectado spam de ${msg.author}: ${reason}`);

      try {
        // 1. Deletar a mensagem
        await msg.delete(true);
        console.log('[AutoMod] Mensagem deletada');

        // 2. Remover usuário do grupo
        await chat.removeParticipants([msg.author || msg.from]);
        console.log('[AutoMod] Usuário removido do grupo');

        // 3. Tentar bloquear o contato
        try {
          const contact = await client.getContactById(msg.author || msg.from);
          if (contact && typeof contact.block === 'function') {
            await contact.block();
            console.log('[AutoMod] Contato bloqueado');
          } else {
            // Fallback para versões do wwebjs que podem ter problemas com o objeto contact
            console.warn('[AutoMod] Método contact.block não disponível, tentando via interface');
            await client.interface.performAction('blockContact', { contactId: msg.author || msg.from });
          }
        } catch (blockError) {
          console.error('[AutoMod] Erro ao bloquear contato:', blockError);
        }

        // 4. Enviar notificação ao grupo
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
