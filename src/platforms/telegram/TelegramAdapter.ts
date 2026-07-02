// src/platforms/telegram/TelegramAdapter.ts
/**
 * Telegram Adapter using Telegraf.
 * Implements the PlatformAdapter interface defined in src/platforms/base/PlatformTypes.ts.
 */

import { Telegraf, Context as TelegrafContext, Telegram } from 'telegraf';
import { Message as TgMessage } from 'telegraf/typings/core/types/typegram';
import {
  PlatformType,
  PlatformAdapter,
  PlatformClient,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  SendOptions,
  MediaPayload,
  MessageHandler,
} from '../base/PlatformTypes';

import { platformManager } from '../PlatformManager';

/**
 * Simple client wrapper exposing the methods required by PlatformClient.
 */
class TelegramClient implements PlatformClient {
  readonly platform: PlatformType = 'telegram';
  private bot: Telegraf<TgMessage>;
  public userId: string = '';
  public userName: string = '';
  public isReady: boolean = false;

  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;

  constructor(token: string) {
    this.bot = new Telegraf(token);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.bot.launch().then(() => {
      this.isReady = true;
      // Bot does not expose a dedicated "ready" event, we treat launch success as ready.
      this.userId = this.bot.botInfo?.id?.toString() ?? '';
      this.userName = this.bot.botInfo?.username ?? 'TelegramBot';
      console.log(`[Telegram] ✅ Pronto como ${this.userName} (${this.userId})`);
      if (this.readyHandler) this.readyHandler();
    }).catch(err => {
      console.error('[Telegram] Erro ao fazer login:', err);
      this.isReady = false;
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
    });

    this.bot.on('message', async (ctx: TelegrafContext<TgMessage>) => {
      if (this.messageHandler) {
        const platformMsg = this.normalizeMessage(ctx);
        await this.messageHandler(platformMsg);
      }
    });

    // Telegraf handles reconnection internally; we expose a generic error handler.
    this.bot.catch?.(err => {
      console.error('[Telegram] Bot error:', err);
      this.isReady = false;
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
    });
  }

  private normalizeMessage(ctx: TelegrafContext<TgMessage>): PlatformMessage {
    const tg = ctx.message;
    const chatId = `tg:${tg.chat.id}`;
    const userId = `tg:${tg.from?.id ?? 0}`;
    const isGroup = tg.chat.type === 'group' || tg.chat.type === 'supergroup';
    const hasMedia = !!tg.photo || !!tg.document || !!tg.video || !!tg.sticker || !!tg.audio || !!tg.voice || !!tg.video_note;
    const mediaType = (() => {
      if (tg.photo) return 'image' as const;
      if (tg.video) return 'video' as const;
      if (tg.document) return 'document' as const;
      if (tg.sticker) return 'sticker' as const;
      if (tg.audio) return 'audio' as const;
      if (tg.voice) return 'audio' as const;
      if (tg.video_note) return 'video' as const;
      return undefined;
    })();

    return {
      id: `tg:${tg.message_id}`,
      chatId,
      userId,
      userName: tg.from?.first_name ?? 'unknown',
      text: tg.text ?? '',
      timestamp: new Date(tg.date * 1000),
      isFromMe: tg.from?.is_bot ?? false,
      isCommand: false, // will be set by PlatformManager
      platform: 'telegram',
      raw: tg,
      hasMedia,
      mediaType,
      replyToMessageId: tg.reply_to_message ? `tg:${tg.reply_to_message.message_id}` : undefined,
    } as PlatformMessage;
  }

  async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^tg:/, '');
    const sent = await this.bot.telegram.sendMessage(Number(cleanChatId), text, {
      parse_mode: options?.parseMode,
      disable_web_page_preview: options?.disablePreview,
      reply_to_message_id: options?.replyToMessageId?.replace(/^tg:/, ''),
    });
    // Telegraf sendMessage returns a Message object.
    return this.normalizeMessage({ message: sent } as any);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^tg:/, '');
    const { type, data, filename, mimetype } = media;
    let sent;
    switch (type) {
      case 'image':
        sent = await this.bot.telegram.sendPhoto(Number(cleanChatId), { source: data as Buffer }, { caption });
        break;
      case 'video':
        sent = await this.bot.telegram.sendVideo(Number(cleanChatId), { source: data as Buffer }, { caption });
        break;
      case 'audio':
        sent = await this.bot.telegram.sendAudio(Number(cleanChatId), { source: data as Buffer }, { caption });
        break;
      case 'document':
        sent = await this.bot.telegram.sendDocument(Number(cleanChatId), { source: data as Buffer, filename }, { caption });
        break;
      case 'sticker':
        sent = await this.bot.telegram.sendSticker(Number(chatId), { source: data as Buffer });
        break;
      default:
        throw new Error(`Unsupported media type ${type}`);
    }
    return this.normalizeMessage({ message: sent } as any);
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const cleanChatId = chatId.replace(/^tg:/, '');
    const chat = await this.bot.telegram.getChat(Number(cleanChatId));
    return {
      id: `tg:${chat.id}`,
      name: chat.title ?? chat.username ?? 'Telegram Chat',
      isGroup: chat.type === 'group' || chat.type === 'supergroup',
      platform: 'telegram',
      participants: [], // Telegram API requires separate calls; left empty for now.
      raw: chat,
    } as PlatformChat;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const cleanUserId = userId.replace(/^tg:/, '');
    const user = await this.bot.telegram.getChat(Number(cleanUserId)); // getChat works for users as well.
    return {
      id: `tg:${user.id}`,
      name: user.first_name ?? user.username ?? 'Telegram User',
      username: user.username,
      isBot: user.is_bot ?? false,
      platform: 'telegram',
      raw: user,
    } as PlatformUser;
  }

  async getChats(): Promise<PlatformChat[]> {
    // Telegraf does not expose a direct "list chats" method. We'll return an empty array.
    // The PlatformManager.broadcast will call getChats on each adapter; Telegram will simply skip broadcast.
    return [];
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
    await this.bot.stop();
    this.isReady = false;
  }
}

export class TelegramAdapter implements PlatformAdapter {
  readonly platform: PlatformType = 'telegram';
  readonly client: PlatformClient;

  constructor(token: string) {
    this.client = new TelegramClient(token);
  }

  async initialize(): Promise<void> {
    console.log('[TelegramAdapter] Inicializando...');
    
    return new Promise((resolve, reject) => {
      if (this.client.isReady) {
        console.log('[TelegramAdapter] Já estava pronto');
        resolve();
        return;
      }
      
      const originalReady = (this.client as any).readyHandler;
      const originalDisconnected = (this.client as any).disconnectedHandler;

      const onReady = () => {
        console.log('[TelegramAdapter] Evento Ready recebido na inicialização');
        if (typeof originalReady === 'function') originalReady();
        resolve();
      };
      
      const onDisconnect = (reason: string) => {
        console.error('[TelegramAdapter] Falha na inicialização:', reason);
        if (typeof originalDisconnected === 'function') originalDisconnected(reason);
        reject(new Error(reason));
      };

      this.client.onReady(onReady);
      this.client.onDisconnected(onDisconnect);
    });
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
