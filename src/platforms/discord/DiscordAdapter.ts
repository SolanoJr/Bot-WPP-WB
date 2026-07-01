// src/platforms/discord/DiscordAdapter.ts
/**
 * Discord Adapter (esqueleto) – implementa a mesma interface de PlatformAdapter.
 * Utiliza discord.js; por enquanto implementa apenas sendMessage e stubs para os demais métodos.
 */

// import { Client, Intents } from 'discord.js';
import { Client } from 'discord.js';
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

class DiscordClient implements PlatformClient {
  readonly platform: PlatformType = 'discord';
  private client: Client;
  public userId: string = '';
  public userName: string = '';
  public isReady: boolean = false;

  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;

  constructor(token: string) {
    // Intents needed para receber mensagens
    // Intents needed for receiving messages; fallback to empty array if Intents is undefined in test mocks
    // Safely acquire Intents if available (mock may omit it)
    let intents:any[] = [];
    try {
      const discordPkg = require('discord.js');
      const Intents = discordPkg.Intents;
      if (Intents?.FLAGS) {
        intents = [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.DIRECT_MESSAGES];
      }
    } catch (_) {
      // fallback to empty intents for tests without Intents mock
    }
    this.client = new Client({ intents });

    this.client.login(token).catch(err => {
      console.error('[DiscordAdapter] Falha ao fazer login:', err);
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
    });
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.once('ready', () => {
      this.isReady = true;
      this.userId = this.client.user?.id ?? '';
      this.userName = this.client.user?.username ?? 'DiscordBot';
      if (this.readyHandler) this.readyHandler();
    });

    this.client.on('messageCreate', async (msg) => {
      if (this.messageHandler) {
        const platformMsg = this.normalizeMessage(msg);
        await this.messageHandler(platformMsg);
      }
    });

    this.client.on('error', (err) => {
      console.error('[DiscordAdapter] Erro:', err);
      this.isReady = false;
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
    });
  }

  private normalizeMessage(msg: any): PlatformMessage {
    const chatId = `dc:${msg.channel.id}`;
    const userId = `dc:${msg.author.id}`;
    const isGroup = msg.channel.type === 'GUILD_TEXT' || msg.channel.type === 'GUILD_VOICE';
    const hasMedia = !!msg.attachments?.size;
    let mediaType: PlatformMessage['mediaType'] | undefined = undefined;
    if (hasMedia) {
      const attachment = msg.attachments.first();
      const mime = attachment?.contentType ?? '';
      if (mime.startsWith('image/')) mediaType = 'image';
      else if (mime.startsWith('video/')) mediaType = 'video';
      else if (mime.startsWith('audio/')) mediaType = 'audio';
      else mediaType = 'document';
    }
    return {
      id: `dc:${msg.id}`,
      chatId,
      userId,
      userName: msg.author.username ?? 'unknown',
      text: msg.content ?? '',
      timestamp: msg.createdAt,
      isFromMe: msg.author.id === this.client.user?.id,
      isCommand: false,
      platform: 'discord',
      raw: msg,
      hasMedia,
      mediaType,
      replyToMessageId: msg.reference?.messageId ? `dc:${msg.reference.messageId}` : undefined,
    } as PlatformMessage;
  }

  async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^dc:/, '');
    const channel = await this.client.channels.fetch(cleanChatId);
    if (!channel?.isText()) throw new Error('Canal de texto não encontrado para Discord');
    const sent = await (channel as any).send(text);
    return this.normalizeMessage(sent);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    // Implementação mínima – ainda não suportada no esqueleto.
    throw new Error('sendMedia ainda não implementado para DiscordAdapter');
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const cleanChatId = chatId.replace(/^dc:/, '');
    const channel = await this.client.channels.fetch(cleanChatId);
    return {
      id: `dc:${channel.id}`,
      name: (channel as any).name ?? 'Discord Chat',
      isGroup: (channel as any).type === 'GUILD_TEXT',
      platform: 'discord',
      participants: [], // Para simplificar, deixamos vazio.
      raw: channel,
    } as PlatformChat;
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const cleanUserId = userId.replace(/^dc:/, '');
    const user = await this.client.users.fetch(cleanUserId);
    return {
      id: `dc:${user.id}`,
      name: user.username,
      username: user.username,
      isBot: user.bot,
      platform: 'discord',
      raw: user,
    } as PlatformUser;
  }

  async getChats(): Promise<PlatformChat[]> {
    // Discord não oferece listagem simples de chats do bot; retornamos os canais de texto dos guilds.
    const chats: PlatformChat[] = [];
    this.client.guilds.cache.forEach(guild => {
      guild.channels.cache.forEach(ch => {
        if (ch.isText()) {
          chats.push({
            id: `dc:${ch.id}`,
            name: (ch as any).name,
            isGroup: true,
            platform: 'discord',
            participants: [],
            raw: ch,
          });
        }
      });
    });
    return chats;
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
}

export class DiscordAdapter implements PlatformAdapter {
  readonly platform: PlatformType = 'discord';
  readonly client: PlatformClient;

  constructor(token: string) {
    this.client = new DiscordClient(token);
  }

  async initialize(): Promise<void> {
    // Espera o cliente ficar ready
    return new Promise((resolve, reject) => {
      if ((this.client as any).isReady) {
        resolve();
        return;
      }
      (this.client as any).onReady(() => resolve());
      (this.client as any).onDisconnected(reason => reject(new Error(reason)));
    });
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}

// Registro automático do adapter caso exista o token.
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.warn('[DiscordAdapter] DISCORD_BOT_TOKEN não definido – adapter não será registrado');
} else {
  const adapter = new DiscordAdapter(token);
  platformManager.registerAdapter(adapter);
}
