/**
 * 🔒 WarriorBlack - Baileys Adapter (SEM Chromium)
 *
 * Implementa a interface PlatformClient usando @whiskeysockets/baileys
 * (WebSocket puro com o WhatsApp Multi-Device). Elimina o Chromium do
 * whatsapp-web.js — fim das quedas por travamento de browser (BUG 41/45).
 *
 * Mantém a MESMA interface do WhatsAppAdapter para que comandos, AutoMod,
 * messageHandler e PlatformManager NÃO precisem mudar.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WAMessageKey,
  type WAMessage,
  type proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { platformManager } from '../PlatformManager';
import { setWppHealth } from '../../services/healthStore';

// Tipos da interface unificada
import {
  PlatformClient,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  PlatformType,
  SendOptions,
  MediaPayload,
  MessageHandler,
} from '../base/PlatformTypes';

const MASTER_USER = process.env.MASTER_USER || '5588998314322@c.us';
const MASTER_LID = process.env.MASTER_LID || '2592935567439@lid';

// Converte ID do Baileys (ex: 558581344211:1234@g.us) para formato interno
function normId(id: string): string {
  // Baileys usa : prefixo em alguns lugares; normalizamos para @c.us / @g.us / @lid
  return id.replace(/:/, '@').replace('@g.us', '@g.us').replace('@s.whatsapp.net', '@c.us');
}

function toJid(id: string): string {
  // PlatformMessage usa @c.us / @g.us / @lid; Baileys quer @s.whatsapp.net / @g.us
  if (id.includes('@g.us')) return id;
  if (id.includes('@lid')) {
    // @lid não é JID direto do Baileys; tentamos o número cru
    return id.replace('@lid', '@s.whatsapp.net');
  }
  return id.replace('@c.us', '@s.whatsapp.net');
}

export class BaileysAdapter implements PlatformClient {
  platform: PlatformType = 'whatsapp';
  userId = '';
  userName = 'Bot-WPP';
  isReady = false;

  private sock: any = null;
  private authDir: string;
  private msgHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;
  private lastActivityTs = Date.now();
  private lastConnectAttemptTs = Date.now();
  private qrPending = false;
  private reconnectTimer: any = null;

  constructor(opts: { authDir?: string; platform?: string } = {}) {
    this.authDir = opts.authDir
      ? path.join(process.cwd(), opts.authDir)
      : path.join(process.cwd(), process.env.WWEBJS_AUTH_DIR || '.wwebjs_auth');
    if (opts.platform) this.platform = opts.platform as PlatformType;
    if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });
    // Conecta de forma assíncrona (não bloqueia o construtor)
    this.connect();
  }

  // ============================================================
  // CONEXÃO
  // ============================================================
  private async connect(): Promise<void> {
    this.lastConnectAttemptTs = Date.now();
    console.log(`[Baileys] 🚀 Iniciando conexão (authDir=${this.authDir})...`);
    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, console as any),
        },
        printQRInTerminal: false,
        logger: undefined as any,
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        // Swiftshader/NÃO precisa — Baileys é WebSocket puro, sem browser.
      });

      // ---- handlers de evento ----
      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, qr, lastDisconnect, isNewLogin } = update;
        if (qr) {
          this.qrPending = true;
          console.log(`[Baileys] 📱 QR recebido — enviando ao dono...`);
          this.sendQrToOwner(qr);
        }
        if (connection === 'open') {
          this.isReady = true;
          this.qrPending = false;
          this.lastActivityTs = Date.now();
          this.userId = this.sock.user?.id || '';
          this.userName = this.sock.user?.name || 'Bot-WPP';
          console.log(`[Baileys] ✅ Conectado como ${this.userName} (${this.userId})`);
          this.notifyOwner(`✅ *WPP reconectado* (Baileys) como ${this.userName}. Bot operante.`).catch(() => {});
          this.getHealth();
          this.readyHandler?.();
        }
        if (connection === 'close') {
          this.isReady = false;
          const reason = lastDisconnect?.error?.message || 'unknown';
          console.log(`[Baileys] 🔌 Conexão fechada: ${reason}`);
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
          this.disconnectedHandler?.(reason);
          if (shouldReconnect) {
            console.log(`[Baileys] ♻️ Reconectando automaticamente (Baileys gerencia)...`);
            // Baileys reconecta sozinho se não deslogou; se travou, recria sock
            setTimeout(() => this.recreateSock(state, saveCreds), 3000);
          } else {
            console.log(`[Baileys] 🚪 Deslogado — precisa escanear QR novamente.`);
          }
        }
      });

      this.sock.ev.on('creds.update', saveCreds);
      this.sock.ev.on('messages.upsert', (m: any) => {
        this.lastActivityTs = Date.now();
        for (const msg of m.messages) {
          if (m.type === 'notify' || m.type === 'append') {
            this.dispatchMessage(msg);
          }
        }
      });

      // Salvar credenciais periodicamente
      this.sock.ev.on('creds.update', saveCreds);
    } catch (e: any) {
      console.error(`[Baileys] ❌ Erro ao conectar: ${e?.message}`);
    }
  }

  private async recreateSock(state: any, saveCreds: any): Promise<void> {
    try {
      if (this.sock) this.sock.end?.(new Error('recreate'));
    } catch {}
    this.sock = makeWASocket({
      version: (await fetchLatestBaileysVersion()).version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, console as any),
      },
      printQRInTerminal: false,
      connectTimeoutMs: 120000,
    });
    // Reanexa handlers mínimos (reutiliza lógica do connect seria ideal; simplificado)
    this.sock.ev.on('connection.update', async (update: any) => {
      if (update.connection === 'open') {
        this.isReady = true;
        this.userId = this.sock.user?.id || '';
        this.userName = this.sock.user?.name || 'Bot-WPP';
        this.notifyOwner(`✅ *WPP reconectado* (Baileys) como ${this.userName}.`).catch(() => {});
        this.readyHandler?.();
      }
    });
    this.sock.ev.on('messages.upsert', (m: any) => {
      this.lastActivityTs = Date.now();
      for (const msg of m.messages) this.dispatchMessage(msg);
    });
  }

  // ============================================================
  // NORMALIZAÇÃO DE MENSAGEM
  // ============================================================
  private dispatchMessage(msg: any): void {
    try {
      const m = msg.message || {};
      const key: WAMessageKey = msg.key;
      const from = key.remoteJid || '';
      const isGroup = from.endsWith('@g.us');
      const fromMe = !!key.fromMe;
      const participant = key.participant || from;
      const sender = fromMe ? this.userId : participant;

      // Extrai texto (suporta text, extendedText, conversation, caption)
      let body = '';
      if (m.conversation) body = m.conversation;
      else if (m.extendedTextMessage?.text) body = m.extendedTextMessage.text;
      else if (m.imageMessage?.caption) body = m.imageMessage.caption;
      else if (m.videoMessage?.caption) body = m.videoMessage.caption;
      else if (m.buttonsMessage?.contentText) body = m.buttonsMessage.contentText;
      else if (m.listResponseMessage?.title) body = m.listResponseMessage.title;
      else if (m.templateButtonReplyMessage?.selectedDisplayText)
        body = m.templateButtonReplyMessage.selectedDisplayText;

      const mentioned = m.extendedTextMessage?.contextInfo?.mentionedJidList ||
        m.imageMessage?.contextInfo?.mentionedJidList || [];
      const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedKey = quoted ? msg.message?.extendedTextMessage?.contextInfo?.stanzaId : undefined;

      const platformMsg: PlatformMessage = {
        id: `${this.platform}:${key.id}`,
        chatId: normId(from),
        userId: normId(sender),
        body,
        fromMe,
        isGroup,
        timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) : Date.now(),
        mentionedIds: mentioned.map((x: string) => normId(x)),
        quotedMessageId: quotedKey ? `${this.platform}:${quotedKey}` : undefined,
        raw: msg,
      };
      this.msgHandler?.(platformMsg);
      // Atualiza healthStore
      this.getHealth();
    } catch (e: any) {
      console.error(`[Baileys] ❌ erro ao normalizar msg: ${e?.message}`);
    }
  }

  // ============================================================
  // ENVIO
  // ============================================================
  async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage> {
    if (!this.sock) throw new Error('Baileys não conectado');
    const jid = toJid(chatId);
    const msgOpts: any = { text };
    if (options?.replyToMessageId) {
      const quotedId = options.replyToMessageId.split(':').pop();
      msgOpts.quoted = { key: { id: quotedId, remoteJid: jid, fromMe: true } };
    }
    if (options?.mentionedIds?.length) {
      msgOpts.mentions = options.mentionedIds.map((x) => toJid(x));
    }
    const res = await this.sock.sendMessage(jid, msgOpts);
    return {
      id: `${this.platform}:${res.key.id}`,
      chatId: normId(jid),
      userId: this.userId,
      body: text,
      fromMe: true,
      isGroup: jid.endsWith('@g.us'),
      timestamp: Date.now(),
    };
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    if (!this.sock) throw new Error('Baileys não conectado');
    const jid = toJid(chatId);
    const msgOpts: any = { caption: caption || '' };
    if (typeof media.data === 'string' && fs.existsSync(media.data)) {
      msgOpts[media.type] = fs.readFileSync(media.data);
      if (media.filename) msgOpts.mimetype = media.mimetype;
    } else if (Buffer.isBuffer(media.data)) {
      msgOpts[media.type] = media.data;
    } else {
      msgOpts[media.type] = { url: media.data as string };
    }
    const res = await this.sock.sendMessage(jid, msgOpts);
    return {
      id: `${this.platform}:${res.key.id}`,
      chatId: normId(jid),
      userId: this.userId,
      body: caption || '',
      fromMe: true,
      isGroup: jid.endsWith('@g.us'),
      timestamp: Date.now(),
    };
  }

  // ============================================================
  // CHATS / USUÁRIOS
  // ============================================================
  async getChat(chatId: string): Promise<PlatformChat> {
    const jid = toJid(chatId);
    const metadata = await this.sock.groupMetadata(jid).catch(() => null);
    return {
      id: normId(jid),
      name: metadata?.subject || '',
      isGroup: jid.endsWith('@g.us'),
      participants: metadata?.participants?.map((p: any) => normId(p.id)) || [],
    };
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const jid = toJid(userId);
    const contact = await this.sock.contactFetch?.(jid).catch(() => null);
    return {
      id: normId(jid),
      name: contact?.name || contact?.notify || '',
      isBot: false,
    };
  }

  async getChats(): Promise<PlatformChat[]> {
    const chats = await this.sock.groupFetchAllParticipating?.().catch(() => ({}));
    return Object.values(chats || {}).map((c: any) => ({
      id: normId(c.id),
      name: c.subject || '',
      isGroup: true,
      participants: (c.participants || []).map((p: any) => normId(p.id)),
    }));
  }

  // ============================================================
  // GESTÃO DE MEMBROS
  // ============================================================
  async removeParticipant(chatId: string, userId: string): Promise<void> {
    const jid = toJid(chatId);
    const userJid = toJid(userId);
    await this.sock.groupParticipantsUpdate(jid, [userJid], 'remove');
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    const jid = toJid(chatId);
    const userJid = toJid(userId);
    // Baileys não tem "ban" nativo; remove + bloqueia
    await this.sock.groupParticipantsUpdate(jid, [userJid], 'remove');
    await this.sock.updateBlockStatus(userJid, 'block').catch(() => {});
  }

  // ============================================================
  // HANDLERS
  // ============================================================
  onMessage(handler: MessageHandler): void {
    this.msgHandler = handler;
  }
  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }
  onDisconnected(handler: (reason: string) => void): void {
    this.disconnectedHandler = handler;
  }

  async shutdown(): Promise<void> {
    try { this.sock?.end?.(new Error('shutdown')); } catch {}
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
  }

  // ============================================================
  // ALERTA / HEALTH (compatível com o watchdog anterior)
  // ============================================================
  async notifyOwner(text: string): Promise<void> {
    const ownerId = MASTER_LID || MASTER_USER;
    try {
      await Promise.race([
        this.sock.sendMessage(toJid(ownerId), { text }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 5s')), 5000)),
      ]);
      console.log(`[Baileys][notifyOwner] ✅ alerta enviado ao dono (${ownerId})`);
    } catch (e: any) {
      console.error(`[Baileys][notifyOwner] ❌ falha: ${e?.message}`);
    }
  }

  private sendQrToOwner(qr: string): void {
    // Gera o QR como IMAGEM PNG e manda pro dono (escaneável direto no WPP)
    const qrPath = path.join(this.authDir, 'qr.png');
    import('qrcode').then(async (QR) => {
      try {
        await QR.toFile(qrPath, qr, { width: 512, margin: 2 });
        console.log(`[Baileys] 📱 QR salvo em ${qrPath} — enviando imagem ao dono...`);
        await Promise.race([
          this.sock.sendMessage(toJid(MASTER_LID || MASTER_USER), {
            image: fs.readFileSync(qrPath),
            caption: '📱 Escaneie este QR para conectar o WPP (Baileys, sem Chromium). Expira em ~60s.',
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 8s')), 8000)),
        ]);
        console.log(`[Baileys][notifyOwner] ✅ QR enviado ao dono como imagem`);
      } catch (e: any) {
        // Fallback: manda o texto do QR
        console.error(`[Baileys] ❌ falha ao enviar QR imagem: ${e?.message} — enviando texto`);
        this.notifyOwner(`📱 *QR WPP (Baileys):*\n\`\`\`\n${qr}\n\`\`\``).catch(() => {});
      }
    });
  }

  getHealth(): Record<string, any> {
    const h = {
      pm2: 'online' as const,
      wpp: this.isReady ? ('connected' as const) : (this.qrPending ? ('awaiting-qr' as const) : ('disconnected' as const)),
      sinceActivitySec: Math.round((Date.now() - this.lastActivityTs) / 1000),
      sinceConnectSec: Math.round((Date.now() - this.lastConnectAttemptTs) / 1000),
      qrPending: this.qrPending,
    };
    setWppHealth(h);
    return h;
  }
}
