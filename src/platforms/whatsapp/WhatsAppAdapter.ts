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
  }

  private normalizeMessage(msg: Message): PlatformMessage {
    const chatId = `wpp:${msg.from}`;
    const userId = `wpp:${msg.author || msg.from}`;
    const isGroup = msg.from.endsWith('@g.us');

    return {
      id: `wpp:${msg.id._serialized}`,
      chatId,
      userId,
      userName: msg._data?.notifyName || msg.from,
      text: msg.body || '',
      timestamp: new Date(msg.timestamp * 1000),
      isFromMe: msg.fromMe,
      isCommand: false, // Será determinado pelo PlatformManager
      platform: 'whatsapp',
      raw: {
        ...msg,
        isGroup,
        chat: msg.chat,
        author: msg.author
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