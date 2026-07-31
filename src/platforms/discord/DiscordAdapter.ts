// src/platforms/discord/DiscordAdapter.ts
/**
 * Discord Adapter (esqueleto) – implementa a mesma interface de PlatformAdapter.
 * Utiliza discord.js; por enquanto implementa apenas sendMessage e stubs para os demais métodos.
 */

import { Client, GatewayIntentBits, Partials } from 'discord.js';
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

class DiscordClient implements PlatformClient {
  readonly platform: PlatformType = 'discord';
  private client: Client;
  public userId: string = '';
  public userName: string = '';
  public isReady: boolean = false;

  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;

  private token: string;

  constructor(token: string) {
    this.token = token;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });
    console.log('[Discord] Cliente v14 inicializado com intents e partials');
    this.setupEventHandlers();
  }

  async login(): Promise<void> {
    console.log('[Discord] Iniciando login...');
    try {
      await this.client.login(this.token);
      console.log('[Discord] Chamada de login concluída');
    } catch (err: any) {
      console.error('[Discord] ❌ Falha crítica no login:', err);
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
      throw err;
    }
  }

  private setupEventHandlers() {
    // discord.js v14+ usa 'clientReady'; 'ready' foi depreciado
    const readyEvent = 'clientReady';
    this.client.once(readyEvent as any, () => {
      this.isReady = true;
      this.userId = this.client.user?.id ?? '';
      this.userName = this.client.user?.username ?? 'DiscordBot';
      console.log(`[Discord] ✅ Pronto como ${this.userName} (${this.userId})`);
      
      // Definir status de presença como online
      try {
        this.client.user?.setPresence({
          status: 'online',
          activities: [{ name: 'Bot-WPP Multi-Platform', type: 0 }]
        });
        console.log('[Discord] Presença definida como online');
      } catch (err: any) {
        console.error('[Discord] Erro ao definir presença:', err.message);
      }
      
      if (this.readyHandler) this.readyHandler();
    });

    this.client.on('messageCreate', async (msg) => {
      console.log(`[Discord] messageCreate recebido - autor: ${msg.author.username} (bot: ${msg.author.bot}), conteúdo: "${msg.content}", canal: ${msg.channel.id}, tipo: ${msg.channel.type}`);
      
      // Ignorar mensagens do próprio bot
      if (msg.author.bot) {
        console.log('[Discord] Mensagem ignorada (do próprio bot)');
        return;
      }
      
      if (this.messageHandler) {
        console.log('[Discord] messageHandler definido, chamando normalizeMessage...');
        const platformMsg = this.normalizeMessage(msg);
        console.log('[Discord] PlatformMessage normalizado:', JSON.stringify({
          id: platformMsg.id,
          chatId: platformMsg.chatId,
          userId: platformMsg.userId,
          text: platformMsg.text,
          isCommand: platformMsg.isCommand
        }));
        console.log('[Discord] Chamando messageHandler...');
        await this.messageHandler(platformMsg);
        console.log('[Discord] messageHandler concluído');
      } else {
        console.log('[Discord] ⚠️ messageHandler NÃO definido!');
      }
    });

    this.client.on('error', (err) => {
      console.error('[DiscordAdapter] Erro:', err);
      this.isReady = false;
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
    });
  }

  private normalizeMessage(msg: any): PlatformMessage {
    const msgHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    console.log(`[DiscordAdapter.normalizeMessage] ENTRY - msgHash: ${msgHash}, msg:`, !!msg, 'typeof msg:', typeof msg);
    console.log(`[DiscordAdapter.normalizeMessage] Stack trace:`, stack);
    
    const chatId = `dc:${msg.channel.id}`;
    const userId = `dc:${msg.author.id}`;
    
    // Discord.js v14 usa ChannelType enum (números), não strings
    // 0 = GUILD_TEXT, 2 = GUILD_VOICE, 11 = GUILD_PUBLIC_THREAD, etc.
    const isGroup = msg.channel.type === 0 || msg.channel.type === 2 || 
                    msg.channel.type === 'GUILD_TEXT' || msg.channel.type === 'GUILD_VOICE';
    
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
    const thisHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    console.log(`[DiscordAdapter.sendMessage] ENTRY - thisHash: ${thisHash}, this.constructor.name: ${this.constructor.name}, chatId: ${chatId}`);
    console.log(`[DiscordAdapter.sendMessage] Stack trace:`, stack);
    
    const cleanChatId = chatId.replace(/^dc:/, '');
    const channel = await this.client.channels.fetch(cleanChatId);
    
    const sent = await (channel as any).send(text);
    
    console.log(`[DiscordAdapter.sendMessage] EXIT - thisHash: ${thisHash}, sent:`, !!sent, 'typeof sent:', typeof sent);
    console.log(`[DiscordAdapter.sendMessage] Stack trace:`, stack);
    
    return this.normalizeMessage(sent);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    // Implementação mínima – ainda não suportada no esqueleto.
    throw new Error('sendMedia ainda não implementado para DiscordAdapter');
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const cleanChatId = chatId.replace(/^dc:/, '');
    const channel = await this.client.channels.fetch(cleanChatId);
    if (!channel) {
      throw new Error('Canal não encontrado para Discord');
    }
    return {
      id: `dc:${channel.id}`,
      name: (channel as any).name ?? 'Discord Chat',
      isGroup: (channel as any).type === 'GUILD_TEXT',
      platform: 'discord',
      participants: [],
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
        // Discord.js v14: usar isTextBased() ao invés de isText()
        if ((ch as any).isTextBased?.()) {
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
    console.log('[DiscordAdapter] Inicializando...');

    if (this.client.isReady) {
      console.log('[DiscordAdapter] Já estava pronto');
      return;
    }
    
    // Configurar timeout para evitar que o bot fique travado se o Discord não conectar
    const timeout = 30000; // 30 segundos
    
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout de ${timeout}ms aguardando conexão do Discord`));
      }, timeout);

      // Capturar o handler original se existir (do PlatformManager)
      const originalReady = (this.client as any).readyHandler;
      const originalDisconnected = (this.client as any).disconnectedHandler;

      const onReady = () => {
        clearTimeout(timer);
        console.log('[DiscordAdapter] Evento Ready recebido na inicialização');
        if (typeof originalReady === 'function') originalReady();
        resolve();
      };
      
      const onDisconnect = (reason: string) => {
        clearTimeout(timer);
        console.error('[DiscordAdapter] Falha na inicialização:', reason);
        if (typeof originalDisconnected === 'function') originalDisconnected(reason);
        reject(new Error(reason));
      };

      this.client.onReady(onReady);
      this.client.onDisconnected(onDisconnect);
    });

    try {
      await (this.client as any).login();
      return readyPromise;
    } catch (error) {
      console.error('[DiscordAdapter] Erro fatal no login do Discord:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
