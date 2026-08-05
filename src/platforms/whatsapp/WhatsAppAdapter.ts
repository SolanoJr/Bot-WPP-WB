/**
 * 🔒 WarriorBlack - WhatsApp Adapter
 *
 * Wrapper do whatsapp-web.js existente para a interface PlatformAdapter
 */

import { Client, Message, Chat, Contact, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import {
  PlatformType,
  PlatformAdapter,
  PlatformClient,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  SendOptions,
  MediaPayload,
  MessageHandler
} from './base/PlatformTypes';
import { platformManager } from '../PlatformManager';
import { processAutoMod } from '../../services/autoModService';
import { handleKeywords } from '../../services/keywordHandler';

export class WhatsAppClient implements PlatformClient {
  readonly platform: PlatformType = 'whatsapp';
  private client: Client;
  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;
  public userId = '';
  public userName = '';
  public isReady = false;

  constructor() {
    const authPath = path.join(process.cwd(), '.wwebjs_auth');
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: authPath }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-extensions'
        ]
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('qr', (qr: string) => {
      console.log('[WhatsApp] QR Code recebido, escaneie com seu WhatsApp:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.userId = this.client.info?.wid._serialized || '';
      this.userName = this.client.info?.pushname || 'Bot-WPP';
      console.log(`[WhatsApp] ✅ Pronto como ${this.userName} (${this.userId})`);
      
      // O AutoMod agora é processado via messageHandler.ts para maior controle
      console.log('[WhatsApp] 🛡️ Sistema de AutoMod (via Handler) pronto');
      
      if (this.readyHandler) this.readyHandler();
    });

    this.client.on('disconnected', (reason: string) => {
      this.isReady = false;
      console.log(`[WhatsApp] Desconectado: ${reason}`);
      if (this.disconnectedHandler) this.disconnectedHandler(reason);
    });

    this.client.on('message', async (msg: Message) => {
      try {
        console.log('[WhatsAppAdapter] Mensagem recebida - msg:', !!msg, 'msg.from:', msg?.from, 'msg.author:', msg?.author);
        
        if (!msg) {
          console.error('[WhatsAppAdapter] ERRO: msg é null/undefined, ignorando');
          return;
        }
        
        if (!msg.id) {
          console.error('[WhatsAppAdapter] ERRO: msg não tem id, ignorando - msg type:', typeof msg);
          return;
        }
        
        // Executar AutoMod para mensagens recebidas em grupos
        const moderated = await processAutoMod(msg, this.client);
        if (moderated) {
          console.log(`🛡️ [WhatsAppAdapter] Mensagem moderada e deletada de ${msg.author || msg.from}`);
          return;
        }
      } catch (err) {
        console.error(`[WhatsAppAdapter] Erro ao executar AutoMod:`, err.message);
        console.error(`[WhatsAppAdapter] Erro stack:`, err.stack);
      }

      // Executar handler de palavras-chave (respostas sarcásticas)
      try {
        const intercepted = await handleKeywords(msg, this.client);
        if (intercepted) {
          console.log(`😏 [WhatsAppAdapter] Palavra-chave detectada, resposta enviada`);
          return;
        }
      } catch (err) {
        console.error(`[WhatsAppAdapter] Erro ao executar handleKeywords:`, err.message);
      }

      if (this.messageHandler) {
        try {
          const platformMsg = this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error(`[WhatsAppAdapter] Erro ao normalizar mensagem:`, normError.message);
          console.error(`[WhatsAppAdapter] Stack:`, normError.stack);
        }
      }
    });

    this.client.on('message_create', async (msg: Message) => {
      if (!msg) {
        console.error('[WhatsAppAdapter] message_create: msg é null/undefined, ignorando');
        return;
      }
      
      if (!msg.id) {
        console.error('[WhatsAppAdapter] message_create: msg não tem id, ignorando');
        return;
      }
      
      if (msg.fromMe && this.messageHandler) {
        try {
          const platformMsg = this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error(`[WhatsAppAdapter] Erro ao normalizar message_create:`, normError.message);
        }
      }
    });

    // Evento de entrada de novos membros no grupo
    this.client.on('group_join', async (notification: any) => {
      try {
        await this.handleMemberJoin(notification);
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar entrada de membro:', error);
      }
    });

    // Fallback: monitorar mudanças de participantes
    this.client.on('group_update', async (notification: any) => {
      try {
        if (notification.type === 'add') {
          await this.handleMemberJoin(notification);
        }
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar atualização de grupo:', error);
      }
    });
  }

  private async handleMemberJoin(notification: any): Promise<void> {
    try {
      console.log('[handleMemberJoin] ENTRY - notification:', !!notification);
      const groupId = notification.chatId || notification.id.remote;
      const newMembers = notification.recipientIds || notification.recipients || [];
      
      console.log('[WhatsApp] Novo(s) membro(s) entrando:', { groupId, members: newMembers });

      // Registrar o horário de entrada de cada membro para controle de DDI no AutoMod
      try {
        console.log('[handleMemberJoin] Chamando recordMemberJoin...');
        const { recordMemberJoin } = await import('../../services/autoModService');
        for (const memberId of newMembers) {
          console.log('[handleMemberJoin] Registrando membro:', memberId);
          recordMemberJoin(groupId, memberId);
        }
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao registrar entrada de membro para AutoMod:', err.message);
        console.error('[WhatsApp] Erro stack:', err.stack);
      }

      // Importar função para obter mensagem personalizada
      const { getWelcomeMessage } = await import('../../bot/commands/welcome');
      const customMessage = getWelcomeMessage(groupId);

      // Verificar histórico de membros para detectar se é retorno
      // TODO: implementar storage de histórico de membros

      for (const memberId of newMembers) {
        const isRejoining = false; // TODO: verificar no histórico
        const welcomeText = isRejoining
          ? `Bem-vindo(a) de volta @${memberId.split('@')[0]}! 🎉`
          : `Bem-vindo(a) @${memberId.split('@')[0]}! 🎉`;

        // Adicionar mensagem personalizada se configurada
        const fullMessage = customMessage 
          ? `${welcomeText}\n\n${customMessage}`
          : welcomeText;

        // Enviar mensagem de boas-vindas mencionando o usuário
        await this.client.sendMessage(
          groupId,
          fullMessage,
          {
            mentions: [memberId]
          }
        );

        console.log(`[WhatsApp] Boas-vindas enviadas para ${memberId} no grupo ${groupId}`);
      }
    } catch (error) {
      console.error('[WhatsApp] Erro ao enviar boas-vindas:', error);
    }
  }

  private normalizeMessage(msg: any): PlatformMessage {
    const msgHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    
    // VALIDAÇÃO DEFENSIVA ANTES DE QUALQUER ACESSO
    if (!msg) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg é null/undefined! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem undefined/null em normalizeMessage - fonte desconhecida');
    }
    
    if (!msg.id) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg não tem id! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] msg type:', typeof msg);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem sem id em normalizeMessage');
    }
    
    if (!msg.from) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg não tem from! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] msg type:', typeof msg);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem sem from em normalizeMessage');
    }
    
    console.log(`[WhatsAppAdapter.normalizeMessage] ENTRY - msgHash: ${msgHash}`);
    console.log(`[WhatsApp] normalizeMessage() - msg.id:`, msg?.id, 'msg.id._serialized:', msg?.id?._serialized, 'msg.id.id:', msg?.id?.id);
    console.log('[WhatsApp] normalizeMessage() chamado - msg existe?', !!msg, 'msg.id?', !!msg?.id, 'msg.from?', !!msg?.from);
    
    const chatId = msg.from;
    const isGroup = msg.from.endsWith('@g.us');
    const userId = msg.fromMe
      ? (msg.to || this.client.info?.wid?._serialized)
      : (isGroup ? (msg.author || msg.from) : msg.from);
    
    let extractedText = msg.body || '';
    if (!extractedText && msg.type === 'chat') {
      extractedText = msg.body || '';
    }
    if (!extractedText && msg.type === 'image') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'video') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'document') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'location') {
      extractedText = msg.location?.description || '';
    }
    if (!extractedText && msg.type === 'vcard') {
      extractedText = msg.vcardParsed?.[0]?.displayName || '';
    }
    if (!extractedText && msg.type === 'order') {
      extractedText = msg.order?.title || '';
    }
    if (!extractedText && msg.type === 'call_log') {
      extractedText = msg.callLog?.type || '';
    }
    if (!extractedText && msg.type === 'payment') {
      extractedText = msg.payment?.note || '';
    }
    if (!extractedText && msg.type === 'product') {
      extractedText = msg.product?.title || '';
    }
    if (!extractedText && msg.type === 'sticker') {
      extractedText = msg.sticker?.id || '';
    }
    if (!extractedText && msg.type === 'buttons_response') {
      extractedText = msg.selectedButtonId || '';
    }
    if (!extractedText && msg.type === 'list_response') {
      extractedText = msg.listResponse?.title || msg.listResponse?.description || '';
    }
    if (!extractedText && msg.type === 'poll_creation') {
      extractedText = msg.poll?.name || '';
    }
    if (!extractedText && msg.type === 'e2e_notification') {
      extractedText = msg.e2eNotification?.type || '';
    }
    if (!extractedText && msg.type === 'unknown') {
      extractedText = msg.body || '';
    }
    if (!extractedText && (msg as any)._data) {
      const data = (msg as any)._data;
      extractedText = data.body || data.caption || data.text || '';
      if (!extractedText && data.listResponse) {
        extractedText = data.listResponse.title || data.listResponse.description || '';
      }
    }

    const messageId = msg.id._serialized || msg.id.id || String(msg.id);
    console.log('[WhatsApp] normalizeMessage() - messageId final:', messageId);

    return {
      id: `wpp:${messageId}`,
      chatId,
      userId,
      userName: msg._data?.notifyName || msg.from,
      text: extractedText,
      timestamp: new Date(msg.timestamp * 1000),
      isFromMe: msg.fromMe,
      isCommand: false, // Será determinado pelo PlatformManager
      platform: 'whatsapp',
      raw: {
        ...msg,
        isGroup,
        chat: msg.chat,
        author: msg.author,
        _data: msg._data // Preservar dados brutos para análise profunda no AutoMod
      },
      hasMedia: msg.hasMedia,
      mediaType: this.getMediaType(msg),
      replyToMessageId: msg.hasQuotedMsg ? `wpp:${msg.quotedMsg?.id._serialized}` : undefined
    };
  }

  private getMediaType(msg: Message): PlatformMessage['mediaType'] {
    if (!msg.hasMedia) return undefined;
    const type = msg.type;
    switch (type) {
      case 'image': return 'image';
      case 'video': return 'video';
      case 'audio':
      case 'ptt': return 'audio';
      case 'document': return 'document';
      case 'sticker': return 'sticker';
      case 'location': return 'location';
      case 'vcard': return 'contact';
      default: return undefined;
    }
  }

  async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage> {
    const thisHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    console.log(`[WhatsAppAdapter.sendMessage] ENTRY - thisHash: ${thisHash}, this.constructor.name: ${this.constructor.name}, chatId: ${chatId}`);
    console.log(`[WhatsAppAdapter.sendMessage] Stack trace:`, stack);
    
    // Remover prefixo wpp: se presente
    const cleanChatId = chatId.replace(/^wpp:/, '');
    console.log(`[WhatsAppAdapter.sendMessage] cleanChatId: ${cleanChatId}`);
    
    // FIX: Usar waitUntilMsgSent=true para aguardar o envio real ao servidor
    // Isso garante que a mensagem entre no cache global (Msg store) antes de retornar
    // Ref: whatsapp-web.js Client.sendMessage internalOptions.waitUntilMsgSent
    const sendOptions = {
      quotedMessageId: options?.replyToMessageId?.replace(/^wpp:/, ''),
      waitUntilMsgSent: true
    };
    
    const startTime = Date.now();
    const sent = await this.client.sendMessage(cleanChatId, text, sendOptions);
    const duration = Date.now() - startTime;
    
    console.log(`[WhatsAppAdapter.sendMessage] ⏱️ sendMessage demorou ${duration}ms`);
    console.log(`[WhatsAppAdapter.sendMessage] 📋 RETORNO: typeof: ${typeof sent}, constructor: ${sent?.constructor?.name || 'N/A'}`);
    console.log(`[WhatsAppAdapter.sendMessage] 📋 sent.id:`, sent?.id, 'sent.id._serialized:', sent?.id?._serialized);
    
    if (!sent || !sent.id) {
      console.error(`[WhatsAppAdapter.sendMessage] ERRO CRÍTICO: sent inválido - sent:`, sent);
      throw new Error(`Falha ao enviar mensagem: retorno inválido do whatsapp-web.js`);
    }
    
    console.log(`[WhatsAppAdapter.sendMessage] ✅ Mensagem enviada com sucesso`);
    return this.normalizeMessage(sent);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    const mediaObject = media.data instanceof Buffer
      ? new (await import('whatsapp-web.js')).MessageMedia(media.mimetype || 'application/octet-stream', media.data.toString('base64'), media.filename)
      : await (await import('whatsapp-web.js')).MessageMedia.fromUrl(media.data as string);

    const sent = await this.client.sendMessage(cleanChatId, mediaObject, { caption, waitUntilMsgSent: true });
    return this.normalizeMessage(sent);
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const originalChatId = chatId;
    const cleanChatId = chatId.replace(/^(wpp:|tg:|dc:)/, '');
    console.log(`[WhatsApp] getChat() chamado - chatId original: ${originalChatId} cleanChatId: ${cleanChatId} formato: formato WhatsApp`);

    try {
      const chat = await this.client.getChatById(cleanChatId);
      return this.normalizeChat(chat);
    } catch (error: any) {
      // Workaround para Issue #201838: "r: r" error após atualização WhatsApp Web
      if (error.message === 'r' || error.message === 'r: r') {
        console.warn(`[WhatsApp] getChat() - Erro "r" detectado (Issue #201838).`);
        console.warn(`[WhatsApp] getChat() - Não é possível obter participantes neste momento.`);
        console.warn(`[WhatsApp] getChat() - Retornando chat com isPermissionsVerified: false para indicar falha.`);
        // Retornar chat indicando explicitamente que as permissões não puderam ser verificadas
        return {
          id: originalChatId,
          name: cleanChatId,
          isGroup: cleanChatId.endsWith('@g.us'),
          participants: [], // Vazio - permissões não verificadas
          raw: null,
          isPermissionsVerified: false // INDICADOR EXPLÍCITO DE FALHA
        };
      }
      console.error(`[WhatsApp] Erro em getChatById:`, {
        chatId: originalChatId,
        cleanChatId,
        error: error.message,
        stack: error.stack,
        errorType: error.constructor.name
      });
      throw error;
    }
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const cleanUserId = userId.replace(/^wpp:/, '');
    const contact = await this.client.getContactById(cleanUserId);
    return this.normalizeUser(contact);
  }

  async getChats(): Promise<PlatformChat[]> {
    const chats = await this.client.getChats();
    return chats.map(c => this.normalizeChat(c));
  }

  private normalizeChat(chat: Chat): PlatformChat {
    return {
      id: `wpp:${chat.id._serialized}`,
      name: chat.name || (chat.isGroup ? 'Grupo' : 'Chat Privado'),
      isGroup: chat.isGroup,
      platform: 'whatsapp',
      participants: chat.participants?.map(p => this.normalizeUserId(p.id._serialized)),
      raw: chat,
      isPermissionsVerified: true // Chat obtido com sucesso, permissões verificadas
    };
  }

  private normalizeUser(contact: Contact): PlatformUser {
    return {
      id: `wpp:${contact.id._serialized}`,
      name: contact.pushname || contact.name || contact.number,
      username: contact.shortName,
      isBot: false,
      platform: 'whatsapp',
      raw: contact
    };
  }

  private normalizeUserId(id: string): string {
    return `wpp:${id}`;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  onDisconnected(handler: (reason: string) => void): void {
    this.disconnectedHandler = handler;
  }

  async shutdown(): Promise<void> {
    await this.client.destroy();
    this.isReady = false;
  }

  getClient(): Client {
    return this.client;
  }
}

export class WhatsAppAdapter implements PlatformAdapter {
  readonly platform: PlatformType = 'whatsapp';
  readonly client: WhatsAppClient;

  constructor() {
    this.client = new WhatsAppClient();
  }

  async initialize(): Promise<void> {
    await this.client.getClient().initialize();
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}

// Exportar instância singleton para compatibilidade com código existente
export const whatsAppAdapter = new WhatsAppAdapter();
export const whatsAppClient = whatsAppAdapter.client;
