/**
 * 🔒 WarriorBlack - Baileys Adapter (SEM Chromium)
 *
 * Força DNS confiável (8.8.8.8/1.1.1.1) no processo Node para contornar
 * /etc/resolv.conf quebrado do sistema (BUG 36 / infra do host).
 */

import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch { /* ignore */ }

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
  // PlatformMessage usa @c.us / @g.us / @lid; Baileys quer @s.whatsapp.net / @g.us / @lid
  if (id.includes('@g.us')) return id;
  if (id.includes('@lid')) return id; // Baileys v7 entende @lid diretamente
  return id.replace('@c.us', '@s.whatsapp.net');
}

export class BaileysAdapter implements PlatformAdapter, PlatformClient {
  platform: PlatformType = 'whatsapp';
  userId = '';
  userName = 'Bot-WPP';
  isReady = false;
  readonly client: PlatformClient = this;

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
  }

  async initialize(): Promise<void> {
    return this.connect();
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
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
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
          // AUTO-TESTE sob demanda: só dispara se WPP_AUTOSELFTEST=1 (evita encher grupo no boot).
          if (process.env.WPP_AUTOSELFTEST === '1') {
            const alvoTesteBaileys = process.env.WPP_TEST_GROUP_ID || '';
            if (alvoTesteBaileys) {
              import('../../devtest/selftest').then((mod) => {
                setTimeout(() => mod.runSelfTestMod(this as any, alvoTesteBaileys).catch(() => {}), 6000);
              }).catch(() => {});
            }
          }
        }
        if (connection === 'close') {
          this.isReady = false;
          const reason = lastDisconnect?.error?.message || 'unknown';
          console.log(`[Baileys] 🔌 Conexão fechada: ${reason}`);
          this.disconnectedHandler?.(reason);
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          if (statusCode === DisconnectReason.loggedOut) {
            console.log(`[Baileys] 🚪 Deslogado — precisa escanear QR novamente.`);
          } else if (reason.includes('Stream Errored') || reason.includes('conflict')) {
            // Sessão inválida no servidor — força re-init completo do socket
            console.log(`[Baileys] 🔄 Stream Errored — forçando re-init completo...`);
            try {
              this.sock?.end?.(new Error('force-reinit'));
            } catch {}
            // Reconecta após breve delay
            setTimeout(() => {
              console.log(`[Baileys] 🔄 Reconectando...`);
              this.connect();
            }, 2000);
          }
        }
      });

      this.sock.ev.on('creds.update', saveCreds);
      this.sock.ev.on('messages.upsert', (m: any) => {
        this.lastActivityTs = Date.now();
        try {
          for (const msg of m.messages || []) {
            if (m.type === 'notify' || m.type === 'append') {
              this.dispatchMessage(msg);
            }
          }
        } catch (e: any) {
          console.error(`[Baileys] Erro no messages.upsert: ${e?.message}`);
        }
      });
    } catch (e: any) {
      console.error(`[Baileys] ❌ Erro ao conectar: ${e?.message}`);
    }
  }



  // ============================================================
  // NORMALIZAÇÃO DE MENSAGEM
  // ============================================================
  private dispatchMessage(msg: any): void {
    try {
      const hasStub = msg.messageStubType || (Array.isArray(msg.messageStubParameters) && msg.messageStubParameters.length > 0);
      if (hasStub) { return; }
      const m = msg.message || {};
      const key: WAMessageKey = msg.key;
      const from = key.remoteJid || '';
      const isGroup = from.endsWith('@g.us');
      const fromMe = !!key.fromMe;
      const participant = key.participant || from;
      const sender = fromMe ? this.userId : participant;

      // Extrai texto (suporta text, extendedText, conversation, caption)
      let body = '';
      if (typeof m.conversation === 'string') body = m.conversation;
      else if (typeof m.extendedTextMessage?.text === 'string') body = m.extendedTextMessage.text;
      else if (typeof m.imageMessage?.caption === 'string') body = m.imageMessage.caption;
      else if (typeof m.videoMessage?.caption === 'string') body = m.videoMessage.caption;
      else if (typeof m.buttonsMessage?.contentText === 'string') body = m.buttonsMessage.contentText;
      else if (typeof m.listResponseMessage?.title === 'string') body = m.listResponseMessage.title;
      else if (typeof m.templateButtonReplyMessage?.selectedDisplayText === 'string')
        body = m.templateButtonReplyMessage.selectedDisplayText;

      // Mensagem sem texto extraível (ex: histórico criptografado, áudio, sticker) → ignora
      if (!body || !body.trim()) return;

      const mentioned = m.extendedTextMessage?.contextInfo?.mentionedJidList ||
        m.imageMessage?.contextInfo?.mentionedJidList || [];
      const quoted = m.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedKey = quoted ? msg.message?.extendedTextMessage?.contextInfo?.stanzaId : undefined;

      const platformMsg: PlatformMessage = {
        id: `${this.platform}:${key.id}`,
        chatId: normId(from),
        userId: normId(sender),
        text: body,
        fromMe,
        isGroup,
        timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
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
    const sendTs = Date.now();
    const res = await this.sock.sendMessage(jid, msgOpts);
    const sentTs = Date.now();
    return {
      id: `${this.platform}:${res.key.id}`,
      chatId: normId(jid),
      userId: this.userId,
      text,
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
    // Timeout: o groupMetadata vai no servidor WA que pode estar lento.
    // Se não responder em 5s, segue sem metadados (não trava o comando).
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([
        p,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]);
    const metadata = await withTimeout(this.sock.groupMetadata(jid).catch(() => null), 5000);
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
    const qrPath = path.join(this.authDir, 'qr.png');
    import('qrcode').then(async (QR) => {
      try {
        await QR.toFile(qrPath, qr, { width: 512, margin: 2 });
        console.log(`\n\n[Baileys] 📱 QR SALVO EM: ${qrPath}`);
        console.log(`[Baileys] 📱 ESCANEIE COM OUTRO CELULAR: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}\n\n`);
        // Tenta enviar ao dono (pode falhar se WPP ainda não abriu)
        try {
          await this.sock.sendMessage(toJid(MASTER_LID || MASTER_USER), {
            image: fs.readFileSync(qrPath),
            caption: '📱 Escaneie para conectar o WPP (Baileys, sem Chromium)',
          });
          console.log(`[Baileys] ✅ QR enviado ao dono`);
        } catch {
          console.log(`[Baileys] ⚠️ QR salvo localmente — escanie do arquivo: ${qrPath}`);
        }
      } catch (e: any) {
        console.log(`[Baileys] 📱 QR (texto para escanear):\n${qr}`);
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
