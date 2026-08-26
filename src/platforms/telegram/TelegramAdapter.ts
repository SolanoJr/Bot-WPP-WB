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
  // ⚠️ O genérico de Telegraf<> é o CONTEXT, não a Message. Estava
  // `Telegraf<TgMessage>`, o que violava a constraint `Context<Update>` e fazia
  // o TS colapsar o tipo do ctx para `never` — 33 erros em cascata neste arquivo
  // (ctx.chat, ctx.from, tg.photo… todos "não existem em never").
  private bot: Telegraf<TelegrafContext>;
  private token: string;
  public userId: string = '';
  public userName: string = '';
  public isReady: boolean = false;

  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;

  constructor(token: string) {
    this.token = token;
    this.bot = new Telegraf(token);
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.bot.on('message', async (ctx: TelegrafContext) => {
      console.log('[Telegram] Mensagem recebida:', JSON.stringify({
        from: ctx.from?.username,
        text: (ctx.message as any)?.text,
        chatId: ctx.chat?.id
      }));
      if (this.messageHandler) {
        const platformMsg = this.normalizeMessage(ctx);
        await this.messageHandler(platformMsg);
      }
    });

    this.bot.catch?.((err: any) => {
      console.error('[Telegram] ❌ Erro no bot:', err);
      console.error('[Telegram] Stack trace:', err.stack);
      if (err.response) {
        console.error('[Telegram] Response status:', err.response?.status);
        console.error('[Telegram] Response data:', err.response?.data);
      }
      if (err.request) {
        console.error('[Telegram] Request URL:', err.request?.path || err.config?.url);
        console.error('[Telegram] Request method:', err.config?.method);
      }
      this.isReady = false;
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
    });
  }

  /**
   * Inicia o bot. Chamado pelo TelegramAdapter.initialize().
   * Separado do construtor para evitar race condition.
   */
  async launch(): Promise<void> {
    console.log('[Telegram] Iniciando launch()...');
    console.log('[Telegram] Token usado:', this.token.substring(0, 10) + '...');
    try {
      await this.bot.launch();
      this.isReady = true;
      this.userId = this.bot.botInfo?.id?.toString() ?? '';
      this.userName = this.bot.botInfo?.username ?? 'TelegramBot';
      console.log(`[Telegram] ✅ Pronto como ${this.userName} (${this.userId})`);
      if (this.readyHandler) this.readyHandler();
    } catch (err: any) {
      console.error('[Telegram] ❌ Erro no launch():', err.message);
      console.error('[Telegram] Stack trace:', err.stack);
      if (err.response) {
        console.error('[Telegram] Response status:', err.response?.status);
        console.error('[Telegram] Response data:', err.response?.data);
      }
      if (err.request) {
        console.error('[Telegram] Request URL:', err.request?.path || err.config?.url);
        console.error('[Telegram] Request method:', err.config?.method);
      }
      throw err;
    }
  }

  private normalizeMessage(ctx: TelegrafContext): PlatformMessage {
    const msgHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    console.log(`[TelegramAdapter.normalizeMessage] ENTRY - msgHash: ${msgHash}, ctx:`, !!ctx, 'typeof ctx:', typeof ctx);
    console.log(`[TelegramAdapter.normalizeMessage] Stack trace:`, stack);
    
    // ctx.message é opcional no Telegraf (updates de edição/callback não têm).
    // Sem esta guarda, um update desses causava TypeError em runtime ao ler
    // tg.chat.id. Lançamos um erro claro e o chamador ignora o update.
    const tg = ctx.message;
    if (!tg) {
      throw new Error('[TelegramAdapter] update sem message — ignorado');
    }
    // `Message` é uma UNIÃO discriminada: só a variante de texto tem `.text`, só
    // a de foto tem `.photo`, etc. Estreitar cada uma daria 8 type-guards; como
    // aqui apenas detectamos presença de mídia, usamos uma view indexada.
    const tgAny = tg as Record<string, any>;
    const chatId = `tg:${tg.chat.id}`;
    const userId = `tg:${tg.from?.id ?? 0}`;
    const hasMedia = !!tgAny.photo || !!tgAny.document || !!tgAny.video || !!tgAny.sticker || !!tgAny.audio || !!tgAny.voice || !!tgAny.video_note;
    const mediaType = (() => {
      if (tgAny.photo) return 'image' as const;
      if (tgAny.video) return 'video' as const;
      if (tgAny.document) return 'document' as const;
      if (tgAny.sticker) return 'sticker' as const;
      if (tgAny.audio || tgAny.voice) return 'audio' as const;
      if (tgAny.video_note) return 'video' as const;
      return undefined;
    })();

    return {
      id: `tg:${tg.message_id}`,
      chatId,
      userId,
      userName: tg.from?.first_name ?? 'unknown',
      text: tgAny.text ?? '',
      timestamp: tg.date * 1000,
      isFromMe: tg.from?.is_bot ?? false,
      isCommand: false,
      platform: 'telegram',
      raw: tg,
      hasMedia,
      mediaType,
      replyToMessageId: tgAny.reply_to_message ? `tg:${tgAny.reply_to_message.message_id}` : undefined,
    } as PlatformMessage;
  }

  async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage> {
    const thisHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    console.log(`[TelegramAdapter.sendMessage] ENTRY - thisHash: ${thisHash}, this.constructor.name: ${this.constructor.name}, chatId: ${chatId}`);
    console.log(`[TelegramAdapter.sendMessage] Stack trace:`, stack);
    
    const cleanChatId = chatId.replace(/^tg:/, '');
    const sent = await this.bot.telegram.sendMessage(Number(cleanChatId), text, {
      parse_mode: options?.parseMode as any,
      link_preview_options: options?.disablePreview ? { is_disabled: true } : undefined,
      reply_parameters: options?.replyToMessageId ? { message_id: Number(options.replyToMessageId.replace(/^tg:/, '')) } : undefined,
    });
    
    console.log(`[TelegramAdapter.sendMessage] EXIT - thisHash: ${thisHash}, sent:`, !!sent, 'typeof sent:', typeof sent);
    console.log(`[TelegramAdapter.sendMessage] Stack trace:`, stack);
    
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

  async removeParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = Number(chatId.replace(/^tg:/, ''));
    const cleanUserId = Number(userId.replace(/^tg:/, ''));
    // kickChatMember remove o usuário do grupo (sem banir permanentemente)
    await this.bot.telegram.kickChatMember(cleanChatId, cleanUserId);
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = Number(chatId.replace(/^tg:/, ''));
    const cleanUserId = Number(userId.replace(/^tg:/, ''));
    // banChatMember bane permanentemente (até revogar)
    await this.bot.telegram.banChatMember(cleanChatId, cleanUserId);
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
    // NÃO aguardar launch() bloqueante: o Telegraf só resolve a Promise ao
    // encerrar o bot (long-polling), então um await nunca retornaria e o
    // PlatformManager nunca registraria o messageHandler (setupAdapterHandlers),
    // deixando o comando sem despacho. Disparamos em background e retornamos.
    (this.client as any).launch().catch((err: any) => {
      console.error('[Telegram] ❌ Erro no launch():', err?.message);
    });
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
