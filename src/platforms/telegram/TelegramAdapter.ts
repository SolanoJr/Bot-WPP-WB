// src/platforms/telegram/TelegramAdapter.ts
/**
 * Telegram Adapter using Telegraf.
 * Implements the PlatformAdapter interface defined in src/platforms/base/PlatformTypes.ts.
 *
 * CORREÇÃO: bot.launch() é chamado APENAS em launch(), não no construtor.
 * Isso elimina a race condition onde initialize() esperava um evento que já havia disparado.
 */

import { Telegraf, Context as TelegrafContext } from 'telegraf';
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
    this.bot.on('message', async (ctx: TelegrafContext<TgMessage>) => {
      if (this.messageHandler) {
        const platformMsg = this.normalizeMessage(ctx);
        await this.messageHandler(platformMsg);
      }
    });

    this.bot.catch?.((err: any) => {
      console.error('[Telegram] ❌ Erro no bot:', err);
      this.isReady = false;
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
    });
  }

  /**
   * Inicia o bot. Chamado pelo TelegramAdapter.initialize().
   * Separado do construtor para evitar race condition.
   */
  async launch(): Promise<void> {
    await this.bot.launch();
    this.isReady = true;
    this.userId = this.bot.botInfo?.id?.toString() ?? '';
    this.userName = this.bot.botInfo?.username ?? 'TelegramBot';
    console.log(`[Telegram] ✅ Pronto como ${this.userName} (${this.userId})`);
    if (this.readyHandler) this.readyHandler();
  }

  private normalizeMessage(ctx: TelegrafContext<TgMessage>): PlatformMessage {
    const tg = ctx.message;
    const chatId = `tg:${tg.chat.id}`;
    const userId = `tg:${tg.from?.id ?? 0}`;
    const hasMedia = !!tg.photo || !!tg.document || !!tg.video || !!tg.sticker || !!tg.audio || !!tg.voice || !!tg.video_note;
    const mediaType = (() => {
      if (tg.photo) return 'image' as const;
      if (tg.video) return 'video' as const;
      if (tg.document) return 'document' as const;
      if (tg.sticker) return 'sticker' as const;
      if (tg.audio || tg.voice) return 'audio' as const;
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
      isCommand: false,
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
      parse_mode: options?.parseMode as any,
      disable_web_page_preview: options?.disablePreview,
      reply_to_message_id: options?.replyToMessageId ? Number(options.replyToMessageId.replace(/^tg:/, '')) : undefined,
    });
    return this.normalizeMessage({ message: sent } as any);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^tg:/, '');
    const { type, data, filename } = media;
    let sent: any;
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
        sent = await this.bot.telegram.sendSticker(Number(cleanChatId), { source: data as Buffer });
        break;
      default:
        throw new Error(`Tipo de mídia não suportado: ${type}`);
    }
    return this.normalizeMessage({ message: sent } as any);
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const cleanChatId = chatId.replace(/^tg:/, '');
    const chat = await this.bot.telegram.getChat(Number(cleanChatId));
    return {
      id: `tg:${chat.id}`,
      name: (chat as any).title ?? (chat as any).username ?? 'Telegram Chat',
      isGroup: chat.type === 'group' || chat.type === 'supergroup',
      platform: 'telegram',
      participants: [],
      raw: chat,
    } as PlatformChat;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const cleanUserId = userId.replace(/^tg:/, '');
    const user = await this.bot.telegram.getChat(Number(cleanUserId)) as any;
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
    return [];
  }

  onMessage(handler: MessageHandler): void { this.messageHandler = handler; }
  onReady(handler: () => void): void { this.readyHandler = handler; }
  onDisconnected(handler: (reason: string) => void): void { this.disconnectedHandler = handler; }

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
    if (this.client.isReady) {
      console.log('[TelegramAdapter] Já estava pronto');
      return;
    }
    try {
      // launch() é síncrono em relação ao ready — aguarda o bot estar pronto
      await (this.client as any).launch();
      console.log('[TelegramAdapter] ✅ Inicializado com sucesso');
    } catch (err: any) {
      console.error('[TelegramAdapter] ❌ Falha na inicialização:', err.message);
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
