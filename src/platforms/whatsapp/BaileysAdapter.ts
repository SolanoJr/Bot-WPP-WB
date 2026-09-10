/**
 * 🔒 WarriorBlack - Baileys Adapter (SEM Chromium)
 *
 * Força DNS confiável (8.8.8.8/1.1.1.1) no processo Node para contornar
 * /etc/resolv.conf quebrado do sistema (BUG 36 / infra do host).
 *
 * Adapter refatorado: orquestra módulos especializados (Connection, Normalizer, Sender, Chat, Member, Health).
 * O arquivo original de 779 linhas foi dividido em 6 módulos coesos + este orquestrador (~100 linhas).
 */

import dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch { /* ignore */ }

// Silencia Baileys traces GLOBALMENTE (antes de qualquer import do Baileys)
const originalTrace = console.trace;
console.trace = (...args: any[]) => {
  const msg = args.join(' ');
  if (msg.includes('loading from store') || msg.includes('updated cache')) {
    return;
  }
  originalTrace.apply(console, args);
};

import { PlatformClient, PlatformAdapter, PlatformMessage, PlatformChat, PlatformUser, PlatformType, SendOptions, MediaPayload, MessageHandler } from '../base/PlatformTypes';
import { logInfo, logWarning, logError } from '../../services/loggerService';
import { setWppHealth, WppHealth } from '../../services/healthStore';
import { getOwnerNotifyTarget, isProtectedTarget } from '../../services/permissions';
import { handleMutedMessage } from '../../bot/commands/mute';
import { normId, toJid } from './baileys/util';

import { BaileysConnection } from './baileys/BaileysConnection';
import { BaileysMessageNormalizer } from './baileys/BaileysMessageNormalizer';
import { BaileysMessageSender } from './baileys/BaileysMessageSender';
import { BaileysChatManager } from './baileys/BaileysChatManager';
import { BaileysMemberManager } from './baileys/BaileysMemberManager';
import { BaileysHealth } from './baileys/BaileysHealth';

export class BaileysAdapter implements PlatformAdapter, PlatformClient {
  platform: PlatformType = 'whatsapp';
  userId = '';
  userName = 'Bot-WPP';
  isReady = false;
  readonly client: PlatformClient = this;

  // Submodules
  private connection!: BaileysConnection;
  private normalizer!: BaileysMessageNormalizer;
  private sender!: BaileysMessageSender;
  private chatManager!: BaileysChatManager;
  private memberManager!: BaileysMemberManager;
  private health!: BaileysHealth;

  // State (delegated to connection)
  private _sock: any = null;
  private authDir: string;
  private msgHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;

  constructor(opts: { authDir?: string; platform?: string } = {}) {
    this.authDir = opts.authDir
      ? require('path').join(process.cwd(), opts.authDir)
      : require('path').join(process.cwd(), process.env.WPP_AUTH_DIR || 'sessions');

    if (opts.platform) this.platform = opts.platform as PlatformType;

    // Initialize submodules
    this.connection = new BaileysConnection(
      this.authDir,
      {
        onQR: (qr) => this.handleQR(qr),
        onOpen: () => this.handleOpen(),
        onClose: (reason, statusCode) => this.handleClose(reason, statusCode),
        onCredsUpdate: () => this.handleCredsUpdate(),
        onDisconnected: (reason) => this.handleDisconnected(reason),
      },
      this.platform
    );

    this.normalizer = new BaileysMessageNormalizer({
      sock: null, // set after connect
      platform: this.platform,
      userId: this.userId,
      getChat: (jid) => this.getChat(jid),
      sendMessage: (jid, text, opts) => this.sendMessage(jid, text, opts),
      removeParticipant: (g, u) => this.removeParticipant(g, u),
    });

    this.sender = new BaileysMessageSender({
      sock: null, // set after connect
      platform: this.platform,
      userId: this.userId,
      userName: this.userName,
      getNumberId: (phone) => this.getNumberId(phone),
      getContactById: (id) => this.getContactById(id),
    });

    this.chatManager = new BaileysChatManager({
      sock: null,
      platform: this.platform,
      userId: this.userId,
    });

    this.memberManager = new BaileysMemberManager({
      sock: null,
    });

    this.health = new BaileysHealth({
      sock: null,
      platform: this.platform,
      userId: this.userId,
      userName: this.userName,
      authDir: this.authDir,
      ready: false,
      qrPending: false,
      lastActivityTs: Date.now(),
      lastConnectAttemptTs: Date.now(),
    });

    if (!require('fs').existsSync(this.authDir)) {
      require('fs').mkdirSync(this.authDir, { recursive: true });
    }
  }

  // ---- PlatformAdapter implementation ----
  async initialize(): Promise<void> {
    await this.connection.connect();
    // Wire up submodules with the connected socket
    const sock = this.connection.getSock();
    this.normalizer = new BaileysMessageNormalizer({
      sock,
      platform: this.platform,
      userId: this.userId,
      getChat: (jid) => this.getChat(jid),
      sendMessage: (jid, text, opts) => this.sendMessage(jid, text, opts),
      removeParticipant: (g, u) => this.removeParticipant(g, u),
    });
    this.sender = new BaileysMessageSender({
      sock,
      platform: this.platform,
      userId: this.userId,
      userName: this.userName,
      getNumberId: (phone) => this.getNumberId(phone),
      getContactById: (id) => this.getContactById(id),
    });
    this.chatManager = new BaileysChatManager({
      sock: this.connection.getSock(),
      platform: this.platform,
      userId: this.userId,
    });
    this.memberManager = new BaileysMemberManager({
      sock: this.connection.getSock(),
    });
    this.health = new BaileysHealth({
      sock: this.connection.getSock(),
      platform: this.platform,
      userId: this.userId,
      userName: this.userName,
      authDir: this.authDir,
      ready: this.connection.ready,
      qrPending: this.connection.pendingQR,
      lastActivityTs: this.connection.lastActivityTs,
      lastConnectAttemptTs: this.connection.lastConnectAttemptTs,
    });
    // Attach message handler
    this.normalizer.setMessageHandler(this.msgHandler!);
  }

  // ---- PlatformClient implementation ----
  onMessage(handler: any): void {
    this.msgHandler = handler;
    this.normalizer.setMessageHandler(handler);
  }

  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  onDisconnected(handler: (reason: string) => void): void {
    this.disconnectedHandler = handler;
  }

  async shutdown(): Promise<void> {
    await this.connection.shutdown();
  }

  // ---- Message handling ----
  async sendMessage(chatId: string, text: string, options?: any) {
    return this.sender.sendMessage(chatId, text, options);
  }

  async sendMedia(chatId: string, media: any, caption?: string, options?: any) {
    return this.sender.sendMedia(chatId, media, caption, options);
  }

  async react(messageId: string, emoji: string): Promise<void> {
    await this.sender.react(messageId, emoji);
  }

  // ---- Chat / User ----
  async getChat(chatId: string) {
    return this.chatManager.getChat(chatId);
  }

  async getUser(userId: string) {
    return this.chatManager.getUser(userId);
  }

  async getNumberId(phone: string) {
    return this.chatManager.getNumberId(phone);
  }

  async getContactById(id: string) {
    return this.chatManager.getContactById(id);
  }

  async getChats() {
    return this.chatManager.getChats();
  }

  // ---- Member management ----
  async removeParticipant(chatId: string, userId: string): Promise<void> {
    return this.memberManager.removeParticipant(chatId, userId);
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    return this.memberManager.banParticipant(chatId, userId);
  }

  // ---- Health / QR / Notify ----
  getHealth(): WppHealth {
    const h = this.health.getHealth() as WppHealth;
    setWppHealth(h);
    return h;
  }

  async notifyOwner(text: string): Promise<void> {
    const ownerId = getOwnerNotifyTarget();
    if (!ownerId) {
      logInfo('[Baileys][notifyOwner] ⚠️ destino do dono não resolvido (configure MASTER_USER/MASTER_LID) — alerta descartado');
      return;
    }
    try {
      const sock = this.connection.getSock();
      await Promise.race([
        sock.sendMessage(toJid(ownerId), { text }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 5s')), 5000)),
      ]);
      logInfo(`[Baileys][notifyOwner] ✅ alerta enviado ao dono (${ownerId})`);
    } catch (e: any) {
      logError('Baileys.notifyOwner', e);
    }
  }

  private handleQR(qr: string): void {
    // QR handling is done by connection; we just notify
    const qrPath = require('path').join(this.authDir, 'qr.png');
    import('qrcode').then(async (QR: any) => {
      try {
        await QR.toFile(qrPath, qr, { width: 512, margin: 2 });
        logInfo(`\n\n[Baileys] 📱 QR SALVO EM: ${qrPath}`);
        logInfo('[Baileys] 📱 QR salvo no diretório de autenticação; não é exibido em logs.');

        const ownerTarget = getOwnerNotifyTarget();
        try {
          if (!ownerTarget) throw new Error('destino do dono não resolvido');
          const sock = this.connection.getSock();
          await sock.sendMessage(toJid(ownerTarget), {
            image: require('fs').readFileSync(qrPath),
            caption: '📱 Escaneie para conectar o WPP (Baileys, sem Chromium)',
          });
          logInfo(`[Baileys] ✅ QR enviado ao dono`);
        } catch {
          logInfo(`[Baileys] ⚠️ QR salvo localmente — escanie do arquivo: ${qrPath}`);
        }
      } catch (e: any) {
        logInfo(`[Baileys] 📱 QR (texto para escanear):\n${qr}`);
      }
    });
  }

  private handleOpen(): void {
    this.isReady = true;
    this.userId = this.connection.getUserId();
    this.userName = this.connection.getUserName();
    logInfo(`[Baileys] ✅ Conectado como ${this.userName} (${this.userId})`);

    this.notifyOwner(`✅ *WPP reconectado* (Baileys) como ${this.userName}. Bot operante.`).catch(() => {});

    this.getHealth();
    this.readyHandler?.();

    if (process.env.WPP_AUTOSELFTEST === '1') {
      const alvoTeste = process.env.WPP_TEST_GROUP_ID || '';
      if (alvoTeste) {
        import('../../../laboratorio/selftest.js').then((mod) => {
          setTimeout(() => mod.runSelfTestMod(this as any, alvoTeste).catch(() => {}), 6000);
        }).catch(() => {});
      }
    }

    // Update health module
    this.health.setReady(true);
    this.health.setQrPending(false);
    this.health.setUserInfo(this.userId, this.userName);
  }

  private handleClose(reason: string, statusCode?: number): void {
    this.isReady = false;
    this.getHealth();
    this.disconnectedHandler?.(reason);

    if (statusCode === 401) { // DisconnectReason.loggedOut = 401
      logInfo(`[Baileys] 🚪 Deslogado — precisa escanear QR novamente.`);
      this.notifyOwner(`🚪 *Sessão WhatsApp encerrada*\nO servidor desconectou o bot (sessão expirada).\n\n⚠️ Novo QR code necessário. Reconnectando em 30s para gerar...`).catch(() => {});
      setTimeout(() => {
        logInfo(`[Baileys] 🔄 Reconectando (loggedOut - tentativa única)...`);
        this.connection.connect();
      }, 30000);
    } else if (reason.includes('Stream Errored') || reason.includes('conflict')) {
      logInfo(`[Baileys] 🔄 Stream Errored — forçando re-init completo...`);
      try { this.connection.getSock()?.end?.(new Error('force-reinit')); } catch {}
      setTimeout(() => {
        logInfo(`[Baileys] 🔄 Reconectando...`);
        this.connection.connect();
      }, 2000);
    } else if (reason.includes('Connection Failure') || reason.includes('Timed Out') || reason.includes('socket hang up')) {
      logInfo(`[Baileys] 🔄 ${reason} — reconectando em 5s...`);
      this.notifyOwner(`⚠️ *WhatsApp desconectado*: ${reason}\nReconectando automaticamente...`).catch(() => {});
      setTimeout(() => {
        logInfo(`[Baileys] 🔄 Reconectando (connection failure)...`);
        this.connection.connect();
      }, 5000);
    } else {
      logInfo(`[Baileys] ⚠️ Desconhecido (${reason}) — reconectando em 10s...`);
      setTimeout(() => {
        logInfo(`[Baileys] 🔄 Reconectando (unknown reason)...`);
        this.connection.connect();
      }, 10000);
    }
  }

  private handleCredsUpdate(): void {
    // handled by connection
  }

  private handleDisconnected(reason: string): void {
    this.disconnectedHandler?.(reason);
  }

  private async handleMutedCheck(normMsg: any) {
    const muted = await handleMutedMessage({
      chatId: normMsg.chatId,
      userId: normMsg.userId,
      raw: {
        delete: async () => {
          await this.connection.getSock()?.sendMessage(normMsg.chatId, { delete: normMsg.raw?.key });
        },
      },
    });
    return muted;
  }

  private async handleAutoMod(normMsg: any) {
    try {
      const { evaluate } = await import('../../services/autoModEngine.js');
      void (async () => {
        try {
          let senderName = '';
          if (this.connection.getSock()?.store) {
            try {
              const cts = this.connection.getSock()?.store?.contacts || {};
              const profile = cts[normMsg.userId] || cts[`${normMsg.userId}`] || {};
              senderName = profile.formattedName || profile.notify || profile.verifiedName || '';
            } catch { /* ignorar */ }
          }
          await evaluate(
            normMsg.raw,
            {
              sock: this.connection.getSock(),
              userId: this.userId,
              groupName: normMsg.chatId.endsWith('@g.us')
                ? (this.connection.getSock()?.store?.chats?.[normMsg.chatId]?.subject || normMsg.chatId)
                : normMsg.chatId,
              getChat: async (jid: string) => {
                try {
                  const res = await this.getChat(jid);
                  return {
                    participants: (res?.participants || []).map((p: any) => p?.id || p),
                    id: res?.id || jid,
                    subject: res?.name,
                  };
                } catch { return null; }
              },
              sendMessage: async (jid: string, text: string, opts?: any) => {
                try { await this.sendMessage(jid, text, opts); return {} as any; } catch { return null as any; }
              },
              removeParticipant: async (g: string, u: string) => {
                try { await this.removeParticipant(g, u); } catch { /* ignorar */ }
              },
              log: console.log.bind(console),
              warn: console.warn.bind(console),
              error: console.error.bind(console),
            },
            normMsg.chatId,
            normMsg.userId,
            senderName,
          );
        } catch (err: any) {
          logWarning('[Baileys] autoModEngine.evaluate falhou:', err?.message);
        }
      })();
    } catch (err: any) {
      logWarning('[Baileys] não foi possível carregar autoModEngine:', err?.message);
    }
  }
}

// Re-export types from PlatformTypes for convenience
export type {
  PlatformClient,
  PlatformAdapter,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  PlatformType,
  SendOptions,
  MediaPayload,
  MessageHandler,
} from '../base/PlatformTypes';