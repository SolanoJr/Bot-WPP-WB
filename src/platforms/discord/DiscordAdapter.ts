// src/platforms/discord/DiscordAdapter.ts
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
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.User],
      presence: {
        status: 'online',
        activities: [{ name: 'Bot-WPP Multi-Platform', type: 0 }],
      },
    });
    console.log('[Discord] Cliente v14 inicializado com intents, partials e presence');
    this.setupEventHandlers();
  }

  async login(): Promise<void> {
    console.log('[Discord] Iniciando login...');
    try {
      await this.client.login(this.token);
      console.log('[Discord] Chamada de login concluída');
    } catch (err: any) {
      console.error('[Discord] ❌ Falha no login (possível rate limit):', err?.message || err);
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
      console.log('[Discord] Tentando novamente após 30s...');
      await new Promise(r => setTimeout(r, 30000));
      try {
        await this.client.login(this.token);
        console.log('[Discord] Login retry concluído');
      } catch (retryErr: any) {
        console.error('[Discord] ❌ Falha persistiu após retry:', retryErr?.message || retryErr);
        throw retryErr;
      }
    }
  }

  private setupEventHandlers() {
    const readyEvent = 'clientReady';
    this.client.once(readyEvent as any, () => {
      this.isReady = true;
      this.userId = this.client.user?.id ?? '';
      this.userName = this.client.user?.username ?? 'DiscordBot';
      console.log(`[Discord] ✅ Pronto como ${this.userName} (${this.userId})`);
      
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
      if (msg.author.id === this.client.user?.id) {
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
    const chatId = `dc:${msg.channel.id}`;
    const userId = `dc:${msg.author.id}`;
    
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
    const cleanChatId = chatId.replace(/^dc:/, '');
    let channel: any;
    
    try {
      channel = await this.client.channels.fetch(cleanChatId);
    } catch {
      channel = null;
    }
    
    if (!channel) {
      channel = this.client.channels.cache.get(cleanChatId);
    }
    
    if (!channel || typeof channel.send !== 'function') {
      throw new Error(`Discord: Canal não encontrado: ${chatId}`);
    }

    // Montar mensagem com suporte a reply (citação)
    const sendData: any = { content: text };
    if (options?.replyToMessageId) {
      const replyId = options.replyToMessageId.replace(/^dc:/, '');
      sendData.reply = { messageReference: replyId };
    }

    const sent = await channel.send(sendData);
    return this.normalizeMessage(sent);
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
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
    const chats: PlatformChat[] = [];
    this.client.guilds.cache.forEach(guild => {
      guild.channels.cache.forEach(ch => {
        if (ch.isTextBased()) {
          chats.push({
            id: `dc:${ch.id}`,
            name: (ch as any).name ?? 'Discord Channel',
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

  async removeParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = chatId.replace(/^dc:/, '');
    const cleanUserId = userId.replace(/^dc:/, '');
    const channel = await this.client.channels.fetch(cleanChatId) as any;
    const guild = channel?.guild;
    if (!guild) throw new Error('Canal não pertence a um servidor (guild) no Discord');
    const member = await guild.members.fetch(cleanUserId);
    if (member) await member.kick('Removido por comando do bot');
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = chatId.replace(/^dc:/, '');
    const cleanUserId = userId.replace(/^dc:/, '');
    const channel = await this.client.channels.fetch(cleanChatId) as any;
    const guild = channel?.guild;
    if (!guild) throw new Error('Canal não pertence a um servidor (guild) no Discord');
    await guild.members.ban(cleanUserId, { reason: 'Banido por comando do bot' });
  }

  async react(messageId: string, emoji: string): Promise<void> {
    try {
      const msgId = messageId.split(':').pop();
      if (!msgId) return;
      const msg = await (this.client as any).messages.fetch(msgId);
      if (msg) await msg.react(emoji);
    } catch (e: any) {
      console.error(`[Discord] ❌ erro ao reagir: ${e?.message}`);
    }
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
    await (this.client as DiscordClient).login();
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}
