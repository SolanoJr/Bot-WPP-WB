// src/platforms/telegram/TelegramAdapter.ts
/***
 * Telegram Adapter using Telegraf.
 * Implements the PlatformAdapter interface defined in src/platforms/base/PlatformTypes.ts.
 *
 * CORREÇÃO: bot.launch() é chamado APENAS em launch(), não no construtor.
 * Isso elimina a race condition onde initialize() esperava um evento que já havia disparado.
 */

import dns from 'dns';
import https from 'https';
import { evaluate } from '../../services/autoModEngine';
import { isProtectedTarget } from '../../services/permissions';

// DNS fixo GLOBAL no Node (contorna /etc/resolv.conf quebrado — BUG 36)
try { dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']); } catch { /* ignore */ }

/**
 * Monkey-patch dns.lookup para usar dns.resolve4(resolve6) em vez de getaddrinfo do sistema.
 *
 * MOTIVO: O Node.js chama dns.lookup com options.all=true às vezes (ver Node.js net module),
 * e nslookup.getaddrinfo do sistema falha com EAI_AGAIN quando /etc/resolv.conf aponta para
 * 100.100.100.100 que responde SERVFAIL. O dns.resolve4 com 127.0.0.53 (systemd-resolved stub)
 * funciona corretamente.
 *
 * O patch substitui dns.lookup.global por uma versão que:
 * - Quando options.all=true: retorna Array<{address: string, family: number}>
 * - Quando options.all=false/undefined: retorna (null, address: string, family: number)
 */
function patchDnsLookup(): void {
  const originalLookup = (dns.lookup as any);
  // Força todos os lookups Subsequentes via systemd-resolved stub (que funciona).
  dns.setServers(['127.0.0.53']);

  (dns as any).lookup = function(hostname: string, options: dns.LookupOptions | undefined, callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family: number) => void): void {
    if (typeof options === 'function') { callback = options; options = {}; }

    // Se for IPv6 explícito, usar resolve6 (usa any para evitar problemas de tipo com RecordWithTtl)
    if (options && (options as any).family === 6) {
      dns.resolve6(hostname, options as any, (err, addrs) => {
        if (err) {
          // Fallback para lookup original (usa getaddrinfo do sistema)
          return (originalLookup as any).call(dns, hostname, options, callback);
        }
        if (options && options.all) {
          // addrs é RecordWithTtl[] — cada item tem .address
          const result = (addrs as any[]).map((ip: any) => ({ address: ip.address || ip, family: 6 }));
          callback(null, result, 6);
        } else {
          const addr = addrs && addrs[0] ? (addrs[0] as any).address || addrs[0] : null;
          callback(null, addr, 6);
        }
      });
      return;
    }

    // Para IPv4 (familia 4 ou não especificada), usar resolve4 (usa any para evitar problemas de tipo com RecordWithTtl)
    dns.resolve4(hostname, options as any, (err, addrs) => {
      if (err) {
        // Fallback para lookup original (usa getaddrinfo do sistema)
        console.log(`[dns.lookup patch] resolve4 falhou para ${hostname} — usando fallback`);
        return (originalLookup as any).call(dns, hostname, options, callback);
      }
      if (options && options.all) {
        // addrs é RecordWithTtl[] — cada item tem .address
        const result = (addrs as any[]).map((ip: any) => ({ address: ip.address || ip, family: 4 }));
        callback(null, result, 4);
      } else {
        const addr = addrs && addrs[0] ? (addrs[0] as any).address || addrs[0] : null;
        callback(null, addr, 4);
      }
    });
  };
}

// Aplica o patch ANTES de qualquer import do Telegraf
patchDnsLookup();

/**
 * Agent HTTPS — o dns.lookup já está patchado globalmente acima.
 */
function createDNSSafeAgent(): https.Agent {
  return new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
    scheduling: 'lifo',
  });
}

import { Telegraf } from 'telegraf';
type TgMessage = any;
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

/**
 * Captura mensagem do Telegram e persiste no JSONL de capturas.
 * Formato compatível com laboratorio/capture-store.ts (WAMessageKey-like).
 */
async function captureTelegramMessage(ctx: any): Promise<void> {
  const tg = ctx.message || (ctx.update as any)?.message;
  if (!tg) return;

  const chatId = `tg:${tg.chat.id}`;
  const isGroup = tg.chat.type === 'group' || tg.chat.type === 'supergroup';
  const senderId = `tg:${tg.from?.id ?? 0}`;
  const senderName = tg.from?.first_name ?? tg.from?.username ?? 'unknown';
  const messageId = tg.message_id?.toString() ?? '';
  const timestamp = tg.date ? Number(tg.date) * 1000 : Date.now();
  const fromMe = !!(tg.from?.is_bot);

  // Extrai texto de todos os campos possíveis
  const textParts: string[] = [];
  if (typeof tg.text === 'string' && tg.text.trim()) textParts.push(tg.text.trim());
  if (typeof tg.caption === 'string' && tg.caption.trim()) textParts.push(tg.caption.trim());
  if (typeof tg.entities === 'string') textParts.push(tg.entities);

  // Extrai URLs de botões/cards (Telegram não tem buttonsMessage nativo, mas check)
  try {
    const entities = tg.entities || [];
    if (Array.isArray(entities)) {
      for (const ent of entities) {
        if (ent.type === 'url' && ent.url) {
          textParts.push(ent.url);
        }
      }
    }
  } catch { /* ignore */ }

  const textPreview = textParts.join('\n').trim().slice(0, 1000);

  // Monta payload compatível com capture-store (WAMessageKey-like)
  const key = {
    id: messageId,
    remoteJid: chatId,
    participant: senderId,
    fromMe,
    messageTimestamp: timestamp / 1000,
  };

  const message = {
    conversation: tg.text || '',
    caption: tg.caption || '',
    chat_id: tg.chat.id,
    chat_type: tg.chat.type,
    from: {
      id: tg.from?.id,
      first_name: tg.from?.first_name,
      username: tg.from?.username,
      is_bot: tg.from?.is_bot,
    },
    date: tg.date,
    message_id: tg.message_id,
    photo: tg.photo ? true : undefined,
    document: tg.document ? true : undefined,
    video: tg.video ? true : undefined,
    sticker: tg.sticker ? true : undefined,
    audio: tg.audio ? true : undefined,
    voice: tg.voice ? true : undefined,
    video_note: tg.video_note ? true : undefined,
    entities: tg.entities ? JSON.parse(JSON.stringify(tg.entities)) : undefined,
    text: tg.text || '',
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
      captureId: `tgcap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      capturedAt: new Date().toISOString(),
      groupId: chatId,
      messageId,
      remoteJid: chatId,
      participant: senderId,
      fromMe,
      timestamp,
      messageType: isGroup ? 'group' : 'private',
      contentType: hasMedia(tg) ? getMediaType(tg) : 'text',
      senderJid: senderId,
      isGroup,
      pushName: senderName,
      size: JSON.stringify(rawPayload).length,
      platform: 'telegram',
      textPreview,
      rawPayloadSafe: sanitizePayload(rawPayload),
    };
    const line = JSON.stringify(entry, null, 0).slice(0, 50000) + '\n';
    fs.appendFileSync(CAPTURE_FILE, line, 'utf-8');
    logInfo(`[TelegramCapture] Mensagem capturada: ${messageId} em ${chatId} (${isGroup ? 'grupo' : 'privado'})`);
  } catch (err: any) {
    logWarning(`[TelegramCapture] Erro ao persistir: ${err?.message}`);
  }
}

function hasMedia(tg: any): boolean {
  return !!(tg.photo || tg.document || tg.video || tg.sticker || tg.audio || tg.voice || tg.video_note);
}

function getMediaType(tg: any): string {
  if (tg.photo) return 'image';
  if (tg.video) return 'video';
  if (tg.document) return 'document';
  if (tg.sticker) return 'sticker';
  if (tg.audio || tg.voice) return 'audio';
  if (tg.video_note) return 'video_note';
  return 'text';
}

function sanitizePayload(raw: any): any {
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
          typeof x === 'object' ? sanitizePayload(x) : x
        );
      } else {
        safe[k] = sanitizePayload(v);
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

class TelegramClient implements PlatformClient {
  readonly platform: PlatformType = 'telegram';
  private bot: Telegraf<TgMessage>;
  private token: string;
  public userId: string = '';
  public userName: string = '';
  public isReady: boolean = false;

  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shuttingDown = false;
  private launchStarted = false;

  constructor(token: string) {
    this.token = token;
    // Injetar agente DNS-safe no Telegraf para que todas as requisições HTTPS
    // (getMe, polls, envio de mensagens) usem systemd-resolved para DNS.
    const dnsAgent = createDNSSafeAgent();
    this.bot = new Telegraf(token, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      telegram: { agent: dnsAgent } as any,
    });
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.bot.on('message', async (ctx: any) => {
      logInfo(`[Telegram] Mensagem recebida:`, JSON.stringify({
        from: ctx.from?.username,
        text: ctx.message?.text,
        chatId: ctx.chat?.id
      }));

      // ─── CAPTURA DE MENSAGEM (persistência) ─────────────────────────────
      try { await captureTelegramMessage(ctx); } catch (capErr: any) {
        logWarning('[Telegram] Erro na captura da mensagem:', capErr?.message);
      }

      // ─── AUTO-ANÁLISE: anti-bot / cassino ────────────────────────────────
      const tg = ctx.message || (ctx.update as any)?.message;
      const textParts2: string[] = [];
      if (tg?.text) textParts2.push(tg.text);
      const autoModText2 = textParts2.join(' ').trim();

      const autoModResult2 = await evaluate(
        { key: { id: tg?.message_id ?? 0 }, message: {} } as any,
        {
          sock: null,
          userId: this.userId,
          groupName: tg?.chat?.title ?? tg?.chat?.first_name ?? 'unknown',
          getChat: async () => null,
          sendMessage: async (jid: any, text: any, opts: any) => {
            try {
              if (opts?.delete) {
                await this.deleteMessage(jid, opts.delete.id?.toString() || '');
              } else {
                await this.sendMessage(jid, text, opts);
              }
            } catch (e: any) {
              logError('[Telegram][AutoMod] erro ao executar ação:', e?.message);
            }
          },
          removeParticipant: async (g: any, u: any) => {
            try {
              if (isProtectedTarget(u)) {
                logInfo(`[Telegram][AutoMod] removeParticipant bloqueado — alvo protegido: ${u}`);
                return;
              }
              await this.removeParticipant(g, u);
              logInfo(`[Telegram][AutoMod] participante removido: ${u}`);
            } catch (e: any) {
              logError('[Telegram][AutoMod] erro ao remover participante:', e?.message);
            }
          },
          log: (...a: any[]) => logInfo('[Telegram][AutoMod]', ...a),
          warn: (...a: any[]) => logWarning('[Telegram][AutoMod]', ...a),
          error: (msg: string, ...args: any[]) => logError('[Telegram][AutoMod]', msg, ...args),
        },
        tg?.chat?.id ?? 0,
        tg?.from?.id ?? 0,
        tg?.from?.first_name ?? 'unknown',
      );
      logInfo(`[Telegram][AutoMod] avaliação: atuou=${autoModResult2.acted}, motivo=${autoModResult2.reason}, ação=${autoModResult2.action}`);

      if (this.messageHandler) {
        const platformMsg = this.normalizeMessage(ctx);
        await this.messageHandler(platformMsg);
      }
    });

    this.bot.catch?.((err: any) => {
      logError('[Telegram] ❌ Erro no bot:', err);
      logError('[Telegram] Stack trace:', err.stack);
      if (err.response) {
        logError('[Telegram] Response status:', err.response?.status);
        logError('[Telegram] Response data:', err.response?.data);
      }
      if (err.request) {
        logError('[Telegram] Request URL:', err.request?.path || err.config?.url);
        logError('[Telegram] Request method:', err.config?.method);
      }
      this.isReady = false;
      if (this.disconnectedHandler) this.disconnectedHandler(err.message);
      this.scheduleReconnect();
    });
  }

  /**
   * Inicia o bot. Chamado pelo TelegramAdapter.initialize().
   * Separado do construtor para evitar race condition.
   */
  async launch(): Promise<void> {
    if (this.launchStarted || this.shuttingDown) return;
    logInfo('[Telegram] Iniciando launch()...');
    try {
      const getMe = (this.bot.telegram as any).getMe;
      if (typeof getMe === 'function') {
        const me = await getMe.call(this.bot.telegram);
        this.userId = me?.id?.toString() ?? '';
        this.userName = me?.username ?? 'TelegramBot';
      }
      this.isReady = true;
      this.reconnectAttempts = 0;
      logInfo(`[Telegram] ✅ Pronto como ${this.userName} (${this.userId})`);
      if (this.readyHandler) this.readyHandler();
      this.launchStarted = true;
      void this.bot.launch().catch((error: any) => {
        this.launchStarted = false;
        this.isReady = false;
        this.disconnectedHandler?.(error?.message || String(error));
        this.scheduleReconnect();
        logError('[Telegram] ❌ Erro no polling:', error?.message || error);
      });
    } catch (err: any) {
      logError('[Telegram] ❌ Erro no launch():', err.message);
      logError('[Telegram] Stack trace:', err.stack);
      if (err.response) {
        logError('[Telegram] Response status:', err.response?.status);
        logError('[Telegram] Response data:', err.response?.data);
      }
      if (err.request) {
        logError('[Telegram] Request URL:', err.request?.path || err.config?.url);
        logError('[Telegram] Request method:', err.config?.method);
      }
      this.scheduleReconnect();
      throw err;
    }
  }

  private scheduleReconnect(): void {
    // Retry infinito com teto: derrubar o Telegram para sempre após 5 falhas
    // matava a plataforma num blecaute de DNS no boot (EAI_AGAIN) sem volta
    // até restart manual. Contador segue para o log; o atraso estaciona em 5min.
    if (this.shuttingDown || this.isReady || this.reconnectTimer) return;
    const delayMs = Math.min(300000, 5000 * 2 ** Math.min(this.reconnectAttempts, 6));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.launch().catch(() => undefined);
    }, delayMs);
    logWarning(`[Telegram] Reconexão agendada em ${Math.round(delayMs / 1000)}s (tentativa ${this.reconnectAttempts})`);
  }

  private normalizeMessage(ctx: any): PlatformMessage {
    const tg = ctx.message || (ctx.update as any)?.message;
    if (!tg) {
      throw new Error('Telegram: ctx.message e ctx.update.message são undefined');
    }
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
    // Delete message (moderação automática)
    if (options?.delete) {
      const msgId = options.delete.id?.toString?.() || String(options.delete.id);
      await this.deleteMessage(chatId, msgId);
      return { id: msgId, chatId, platform: 'telegram' } as any;
    }
    const sent = await this.bot.telegram.sendMessage(Number(cleanChatId), text, {
      parse_mode: options?.parseMode as any,
      disable_web_page_preview: options?.disablePreview as any,
      reply_to_message_id: options?.replyToMessageId ? Number(options.replyToMessageId.replace(/^tg:/, '')) : undefined,
    } as any);
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
    if (isProtectedTarget(userId)) throw new Error('alvo protegido: operação bloqueada');
    const cleanChatId = Number(chatId.replace(/^tg:/, ''));
    const cleanUserId = Number(userId.replace(/^tg:/, ''));
    // kickChatMember remove o usuário do grupo (sem banir permanentemente)
    await this.bot.telegram.kickChatMember(cleanChatId, cleanUserId);
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    if (isProtectedTarget(userId)) throw new Error('alvo protegido: operação bloqueada');
    const cleanChatId = Number(chatId.replace(/^tg:/, ''));
    const cleanUserId = Number(userId.replace(/^tg:/, ''));
    // banChatMember bane permanentemente (até revogar)
    await this.bot.telegram.banChatMember(cleanChatId, cleanUserId);
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    const cleanChatId = Number(chatId.replace(/^tg:/, ''));
    const cleanMessageId = Number(messageId.split(':').pop() || messageId);
    await this.bot.telegram.deleteMessage(cleanChatId, cleanMessageId);
  }

  onMessage(handler: MessageHandler): void { this.messageHandler = handler; }
  onReady(handler: () => void): void { this.readyHandler = handler; }
  onDisconnected(handler: (reason: string) => void): void { this.disconnectedHandler = handler; }

  async react(messageId: string, emoji: string): Promise<void> {
    try {
      const msgId = messageId.split(':').pop();
      await this.bot.telegram.callApi('setMessageReaction', {
        chat_id: Number(this.bot.botInfo?.id),
        message_id: Number(msgId),
        reaction: [{ type: 'emoji', emoji: emoji as any }],
      });
    } catch (e: any) {
      logError('Telegram.react', e);
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try { await this.bot.stop(); } catch (error: any) {
      if (!String(error?.message || '').includes('not running')) throw error;
    }
    this.launchStarted = false;
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
    logInfo('[TelegramAdapter] Inicializando...');
    if ((this.client as any).isReady) {
      logInfo('[TelegramAdapter] Já estava pronto');
      return;
    }
    // NÃO aguardar launch() bloqueante: o Telegraf só resolve a Promise ao
    // encerrar o bot (long-polling), então um await nunca retornaria e o
    // PlatformManager nunca registraria o messageHandler (setupAdapterHandlers),
    // deixando o comando sem despacho. Disparamos em background e retornamos.
    (this.client as any).launch().catch((err: any) => {
      logError('[Telegram] ❌ Erro no launch():', err?.message);
    });
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}