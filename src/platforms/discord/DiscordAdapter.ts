import { isProtectedTarget } from '../../services/permissions';
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
import { logInfo, logWarning, logError } from '../../services/loggerService';
import fs from 'node:fs';
import path from 'node:path';

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
        // Necessário para o $screen achar em qual call de voz a pessoa está
        // (voice states chegam por evento de gateway, não por REST).
        GatewayIntentBits.GuildVoiceStates,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.User],
      presence: {
        status: 'online',
        activities: [{ name: 'Bot-WPP Multi-Platform', type: 0 }],
      },
    });
    logInfo('[Discord] Cliente v14 inicializado com intents, partials e presence');
    this.setupEventHandlers();
  }

  async login(): Promise<void> {
    logInfo('[Discord] Iniciando login...');
    try {
      await this.client.login(this.token);
      if (!this.isReady) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout aguardando clientReady')), 10000);
          this.client.once('clientReady', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
      logInfo('[Discord] Chamada de login concluída');
    } catch (err: any) {
      logError('[Discord] ❌ Falha no login (possível rate limit):', err?.message || err);
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
      logInfo('[Discord] Tentando novamente após 30s...');
      await new Promise(r => setTimeout(r, 30000));
      try {
        await this.client.login(this.token);
        logInfo('[Discord] Login retry concluído');
      } catch (retryErr: any) {
        logError('[Discord] ❌ Falha persistiu após retry:', retryErr?.message || retryErr);
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
      logInfo(`[Discord] ✅ Pronto como ${this.userName} (${this.userId})`);
      
      try {
        this.client.user?.setPresence({
          status: 'online',
          activities: [{ name: 'Bot-WPP Multi-Platform', type: 0 }]
        });
        logInfo('[Discord] Presença definida como online');
      } catch (err: any) {
        logError('[Discord] Erro ao definir presença:', err.message);
      }
      
      if (this.readyHandler) this.readyHandler();
    });

    this.client.on('messageCreate', async (msg) => {
      logInfo(`[Discord] messageCreate recebido - autor: ${msg.author.username} (bot: ${msg.author.bot}), conteúdo: "${msg.content}", canal: ${msg.channel.id}, tipo: ${msg.channel.type}`);

      // Ignorar mensagens do próprio bot
      if (msg.author.id === this.client.user?.id) {
        logInfo('[Discord] Mensagem ignorada (do próprio bot)');
        return;
      }

      // ─── CAPTURA DE MENSAGEM (persistência) ─────────────────────────────
      try {
        await captureDiscordMessage(msg);
      } catch (capErr: any) {
        logWarning('[Discord] Erro na captura da mensagem:', capErr?.message);
      }

      if (this.messageHandler) {
        logInfo('[Discord] messageHandler definido, chamando normalizeMessage...');
        const platformMsg = this.normalizeMessage(msg);
        logInfo('[Discord] PlatformMessage normalizado:', JSON.stringify({
          id: platformMsg.id,
          chatId: platformMsg.chatId,
          userId: platformMsg.userId,
          text: platformMsg.text,
          isCommand: platformMsg.isCommand
        }));
        logInfo('[Discord] Chamando messageHandler...');
        await this.messageHandler(platformMsg);
        logInfo('[Discord] messageHandler concluído');
      } else {
        logInfo('[Discord] ⚠️ messageHandler NÃO definido!');
      }
    });

    this.client.on('error', (err) => {
      logError('[DiscordAdapter] Erro:', err);
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

  /**
   * Em qual call de voz a pessoa está (primeira encontrada nos servidores).
   * Usado pelo $screen para apontar a transmissão para a sala daquela call —
   * quem abre a atividade dentro dela cai direto na tela, sem link.
   * Retorna null quando o Discord está offline ou a pessoa não está em call.
   */
  async findUserVoiceChannel(userId: string): Promise<{ guildId: string; channelId: string; channelName: string } | null> {
    try {
      if (!this.isReady) return null;
      const cleanId = userId.replace(/^dc:/, '');
      for (const guild of this.client.guilds.cache.values()) {
        let member: any = guild.members.cache.get(cleanId) ?? null;
        if (!member) {
          try {
            member = await guild.members.fetch(cleanId);
          } catch {
            continue;
          }
        }
        const voice = member?.voice?.channel;
        if (voice) {
          return { guildId: guild.id, channelId: voice.id, channelName: voice.name ?? 'call' };
        }
      }
      return null;
    } catch (e: any) {
      logError('Discord.fetchVoiceCall', e);
      return null;
    }
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
    if (isProtectedTarget(userId)) throw new Error('alvo protegido: operação bloqueada');
    const cleanChatId = chatId.replace(/^dc:/, '');
    const cleanUserId = userId.replace(/^dc:/, '');
    const channel = await this.client.channels.fetch(cleanChatId) as any;
    const guild = channel?.guild;
    if (!guild) throw new Error('Canal não pertence a um servidor (guild) no Discord');
    const member = await guild.members.fetch(cleanUserId);
    if (member) await member.kick('Removido por comando do bot');
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    if (isProtectedTarget(userId)) throw new Error('alvo protegido: operação bloqueada');
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
      logError('Discord.react', e);
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

/**
 * Captura mensagem do Discord e persiste no JSONL de capturas.
 * Formato compatível com laboratorio/capture-store.ts.
 */
async function captureDiscordMessage(msg: any): Promise<void> {
  if (!msg || !msg.channel) return;

  const chatId = `dc:${msg.channel.id}`;
  const isGroup = msg.channel.type === 0 || msg.channel.type === 2 ||
                  msg.channel.type === 'GUILD_TEXT' || msg.channel.type === 'GUILD_VOICE' ||
                  msg.channel.type === 5; // GUILD_FORUM
  const senderId = `dc:${msg.author.id}`;
  const senderName = msg.author.username ?? msg.author.displayName ?? 'unknown';
  const messageId = msg.id?.toString() ?? '';
  const timestamp = msg.createdAt ? msg.createdAt.getTime() : Date.now();
  const fromMe = !!(msg.author?.bot);

  // Extrai texto de todos os campos possíveis
  const textParts: string[] = [];
  if (typeof msg.content === 'string' && msg.content.trim()) textParts.push(msg.content.trim());

  // Extrai URLs de attachments
  if (msg.attachments && msg.attachments.size > 0) {
    for (const att of msg.attachments.values()) {
      if (att.url) textParts.push(att.url);
    }
  }

  // Extrai URLs de embeds
  if (msg.embeds && msg.embeds.size > 0) {
    for (const emb of msg.embeds.values()) {
      if (emb.url) textParts.push(emb.url);
      if (emb.title) textParts.push(emb.title);
      if (emb.description) textParts.push(emb.description);
      if (emb.fields) {
        for (const field of emb.fields) {
          if (field.url) textParts.push(field.url);
          if (field.value) textParts.push(field.value);
        }
      }
    }
  }

  const textPreview = textParts.join('\n').trim().slice(0, 1000);

  // Monta payload compatível com capture-store
  const key = {
    id: messageId,
    remoteJid: chatId,
    participant: senderId,
    fromMe,
    messageTimestamp: timestamp / 1000,
  };

  const hasMedia = msg.attachments && msg.attachments.size > 0;

  const message = {
    conversation: msg.content || '',
    chat_id: msg.channel.id,
    channel_type: msg.channel.type,
    author: {
      id: msg.author.id,
      username: msg.author.username,
      displayName: msg.author.displayName,
      bot: msg.author.bot,
    },
    created_at: msg.createdAt?.toISOString(),
    id: msg.id,
    attachments: hasMedia ? Array.from(msg.attachments.values()).map((a: any) => ({
      url: a.url,
      filename: a.name,
      contentType: a.contentType,
      size: a.size,
    })) : [],
    embeds: msg.embeds && msg.embeds.size > 0 ? Array.from(msg.embeds.values()).map((e: any) => ({
      title: e.title,
      description: e.description,
      url: e.url,
      fields: e.fields ? Array.from(e.fields).map((f: any) => ({ name: f.name, value: f.value, url: f.url })) : [],
    })) : [],
  };

  const rawPayload = {
    key,
    message,
    pushName: senderName,
    messageTimestamp: timestamp / 1000,
  };

  // Persiste no JSONL
  const CAPTURE_DIR = path.join(process.cwd(), 'laboratorio');
  const CAPTURE_FILE = path.join(CAPTURE_DIR, 'captured-messages.jsonl');

  try {
    fs.mkdirSync(CAPTURE_DIR, { recursive: true });
    const entry = {
      captureId: `dccap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      capturedAt: new Date().toISOString(),
      groupId: chatId,
      messageId,
      remoteJid: chatId,
      participant: senderId,
      fromMe,
      timestamp,
      messageType: isGroup ? 'group' : 'private',
      contentType: getDiscordMediaType(msg),
      senderJid: senderId,
      isGroup,
      pushName: senderName,
      size: JSON.stringify(rawPayload).length,
      platform: 'discord',
      textPreview,
      rawPayloadSafe: sanitizeDiscordPayload(rawPayload),
    };
    const line = JSON.stringify(entry, null, 0).slice(0, 50000) + '\n';
    fs.appendFileSync(CAPTURE_FILE, line, 'utf-8');
    logInfo(`[DiscordCapture] Mensagem capturada: ${messageId} em ${chatId} (${isGroup ? 'grupo/servidor' : 'DM'})`);
  } catch (err: any) {
    logWarning(`[DiscordCapture] Erro ao persistir: ${err?.message}`);
  }
}

function getDiscordMediaType(msg: any): string {
  if (!msg.attachments || msg.attachments.size === 0) return 'text';
  const att = msg.attachments.first();
  const mime = att.contentType || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function sanitizeDiscordPayload(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const safe: any = {};
  const keys = Object.keys(raw);
  const redactedKeys = new Set([
    'creds', 'keys', 'cookie', 'session', 'token', 'secret',
    'routingInfo', 'noiseKey', 'signedIdentityKey', 'preKey',
    'signedPreKey', 'identityKey', 'browser', 'userAgent',
    'deviceList', 'lids', 'pn_map',
  ]);
  for (const k of keys) {
    if (redactedKeys.has(k)) {
      safe[k] = '[REDACTED]';
      continue;
    }
    const v = raw[k];
    if (typeof v === 'object' && v !== null) {
      if (Array.isArray(v)) {
        safe[k] = v.filter((x: any) => x != null).slice(0, 20).map((x: any) =>
          typeof x === 'object' ? sanitizeDiscordPayload(x) : x
        );
      } else {
        safe[k] = sanitizeDiscordPayload(v);
      }
    } else if (typeof v === 'string') {
      safe[k] = v.length > 500 ? v.slice(0, 500) + '...' : v;
    } else {
      safe[k] = v;
    }
  }
  if (safe.message && typeof safe.message === 'object') {
    const msg = safe.message as any;
    const msgKeys = Object.keys(msg).slice(0, 30);
    safe.message = {};
    for (const mk of msgKeys) {
      if (redactedKeys.has(mk)) continue;
      const mv = msg[mk];
      safe.message[mk] = typeof mv === 'object' && mv !== null
        ? JSON.parse(JSON.stringify(mv, (kp: string, vv: any) => {
            if (kp.startsWith('secret') || kp.startsWith('cookie') || kp.startsWith('token')) return undefined;
            return vv;
          }))
        : mv;
    }
  }
  return safe;
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
