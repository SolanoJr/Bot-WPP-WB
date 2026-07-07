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
          '--single-process',
          '--disable-gpu'
        ]
      },
      webVersionCache: { type: 'remote', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html' }
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
      if (this.messageHandler) {
        const platformMsg = this.normalizeMessage(msg);
        await this.messageHandler(platformMsg);
      }
    });

    this.client.on('message_create', async (msg: Message) => {
      if (msg.fromMe && this.messageHandler) {
        const platformMsg = this.normalizeMessage(msg);
        await this.messageHandler(platformMsg);
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
      const groupId = notification.chatId || notification.id.remote;
      const newMembers = notification.recipientIds || notification.recipients || [];
      
      console.log('[WhatsApp] Novo(s) membro(s) entrando:', { groupId, members: newMembers });

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

  private normalizeMessage(msg: Message): PlatformMessage {
    const chatId = `wpp:${msg.from}`;
    const userId = `wpp:${msg.author || msg.from}`;
    const isGroup = msg.from.endsWith('@g.us');

    // Extração de texto avançada para mensagens interativas/cards
    let extractedText = msg.body || '';
    
    // Se o corpo estiver vazio, tentar buscar em metadados de mensagens interativas
    if (!extractedText && msg._data) {
      const data = msg._data;
      // Tentar extrair de captions de mídia, botões ou templates
      extractedText = data.caption || 
                      data.matchedText || 
                      data.text || 
                      data.contentText || 
                      data.title || '';
                      
      // Se ainda vazio e houver botões, extrair texto dos botões
      if (!extractedText && data.buttons) {
        extractedText = data.buttons.map((b: any) => b.buttonText?.displayText || '').join(' ');
      }
      
      // Se houver lista, extrair títulos das opções
      if (!extractedText && data.listResponse) {
        extractedText = data.listResponse.title || data.listResponse.description || '';
      }
    }

    return {
      id: `wpp:${msg.id._serialized}`,
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
    // Remover prefixo wpp: se presente
    const cleanChatId = chatId.replace(/^wpp:/, '');
    const sent = await this.client.sendMessage(cleanChatId, text, {
      quotedMessageId: options?.replyToMessageId?.replace(/^wpp:/, '')
    });
    return this.normalizeMessage(sent);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    const mediaObject = media.data instanceof Buffer
      ? new (await import('whatsapp-web.js')).MessageMedia(media.mimetype || 'application/octet-stream', media.data.toString('base64'), media.filename)
      : await (await import('whatsapp-web.js')).MessageMedia.fromUrl(media.data as string);

    const sent = await this.client.sendMessage(cleanChatId, mediaObject, { caption });
    return this.normalizeMessage(sent);
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    const chat = await this.client.getChatById(cleanChatId);
    return this.normalizeChat(chat);
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
      raw: chat
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