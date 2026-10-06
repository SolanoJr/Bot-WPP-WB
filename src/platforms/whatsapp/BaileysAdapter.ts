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
import { countPresentationSignals } from '../../services/presentationService';

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
  private reconnectAttempts = 0;
    private reconnectInProgress = false;
    private readonly maxReconnectDelay = 60000;

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
        onMessagesUpsert: (messages) => this.handleMessagesUpsert(messages),
        onMessagesDelete: (keys) => this.handleMessagesDelete(keys),
        onMessagesDeleteAll: (jid, all) => this.handleMessagesDeleteAll(jid, all),
        onMessagesUpdate: (updates) => this.handleMessagesUpdate(updates),
        onGroupParticipantsUpdate: (event) => this.handleGroupParticipantsUpdate(event),
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
      getNumberId: (phone: string) => this.getNumberId(phone),
      getContactById: (id: string) => this.getContactById(id),
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
      getNumberId: (phone: string) => this.getNumberId(phone),
      getContactById: (id: string) => this.getContactById(id),
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

  async react(messageId: string, emoji: string, chatId?: string, originalKey?: any): Promise<void> {
    await this.sender.react(messageId, emoji, chatId, originalKey);
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
      return this.health.getHealth();
    }

  onSocketDisconnect(handler: (reason: string) => void): void {
    this.connection.onSocketDisconnect(handler);
  }

  async notifyOwner(text: string): Promise<void> {
    const ownerId = getOwnerNotifyTarget();
    if (!ownerId) {
      logInfo('[Baileys][notifyOwner] ⚠️ destino do dono não resolvido (configure MASTER_USER/MASTER_LID) — alerta descartado');
      return;
    }
    try {
      const sock = this.connection.getSock();
      if (!sock) {
        logWarning('[Baileys][notifyOwner] ⚠️ socket nulo, alerta descartado');
        return;
      }
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
    this.reconnectAttempts = 0;
    this.userId = this.connection.getUserId();
    this.userName = this.connection.getUserName();
    logInfo(`[Baileys] ✅ Conectado como ${this.userName} (${this.userId})`);

    this.notifyOwner(`✅ *WPP reconectado* (Baileys) como ${this.userName}. Bot operante.`).catch(() => {});

    this.getHealth();
    this.readyHandler?.();

    // Sincronizar submódulos com o socket recém-aberto
    this.syncSubmodulesWithNewSocket().catch(() => {});

    if (process.env.WPP_AUTOSELFTEST === '1') {
      const alvoTeste = process.env.WPP_TEST_GROUP_ID || '';
      if (alvoTeste) {
        import('../../../laboratorio/selftest.js').then((mod) => {
          setTimeout(() => mod.runSelfTestMod(this as any, alvoTeste).catch(() => {}), 6000);
        }).catch(() => {});
      }
    }

    this.health.setReady(true);
    this.health.setQrPending(false);
    this.health.setUserInfo(this.userId, this.userName);
  }

  private handleClose(reason: string, statusCode?: number): void {
    this.isReady = false;
    this.getHealth();
    this.disconnectedHandler?.(reason);

    // Evita reconnect concorrente: se já há um em progresso, ignora
    if (this.reconnectInProgress) {
      logWarning('[BaileysAdapter] 🔄 Reconecte concorrente ignorado (já há um em progresso)');
      return;
    }

    // Marca reconnectInProgress ANTES do setTimeout para evitar race condition
    // com handleClose() duplicado (segunda chamada antes do timer executar)
    this.reconnectInProgress = true;

    if (statusCode === 401) {
          logInfo('[BaileysAdapter] 🚪 Logout (401) — mantendo credenciais para reconexão');
          this.reconnectAttempts = 0;
          setTimeout(() => {
            logInfo('[BaileysAdapter] 🔄 Reconectando...');
            this.connection.connect()
              .then(() => {
                this.reconnectInProgress = false;
              })
              .catch((err: any) => {
                this.reconnectInProgress = false;
                logError('[BaileysAdapter] Falha no reconnect (401):', err);
                // Reagendar reconnect com backoff
                this.reconnectAttempts++;
                const baseDelay = 5000;
                const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
                logInfo(`[BaileysAdapter] 🔄 Reagendando reconect em ${delay}ms (tentativa ${this.reconnectAttempts})...`);
                setTimeout(() => this.handleClose('reconnect-failed-after-401', 401), delay);
              });
          }, 5000);
          return;
        }

        // Backoff exponencial: evita loop infinito de reconnect
        this.reconnectAttempts++;
        const baseDelay = reason.includes('Stream Errored') || reason.includes('conflict') ? 2000 : 5000;
        const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

        logInfo(`[BaileysAdapter] 🔄 ${reason} — reconectando em ${delay}ms (tentativa ${this.reconnectAttempts})...`);
        setTimeout(() => {
          this.connection.connect()
            .then(() => {
              this.reconnectInProgress = false;
            })
            .catch((err: any) => {
              this.reconnectInProgress = false;
              logError('[BaileysAdapter] Falha no reconnect:', err);
              // Reagendar com backoff
              const retryDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
              logInfo(`[BaileysAdapter] 🔄 Reagendando reconect em ${retryDelay}ms (tentativa ${this.reconnectAttempts + 1})...`);
              setTimeout(() => this.handleClose('reconnect-failed', 0), retryDelay);
            });
        }, delay);
      }

  /**
   * Atualiza todos os submódulos com o novo socket após reconexão.
   * CORREÇÃO: Sem isso, o sender/normalizer/chatManager continuam usando o socket antigo (fechado),
   * causando "Connection Closed" em operações de saída enquanto entrada ainda funciona.
   */
  private async syncSubmodulesWithNewSocket(): Promise<void> {
    const sock = this.connection.getSock();
    if (!sock) {
      logWarning('[BaileysAdapter] syncSubmodulesWithNewSocket: socket nulo');
      return;
    }
    this.normalizer?.setSock(sock);
    this.sender?.setSock(sock);
    this.chatManager?.setSock(sock);
    this.memberManager?.setSock(sock);
    this.health?.setSock(sock);
    logInfo('[BaileysAdapter] ✅ Submódulos sincronizados com novo socket');
  }

  private handleCredsUpdate(): void {
    // handled by connection
  }

  private handleDisconnected(reason: string): void {
    this.disconnectedHandler?.(reason);
  }

  private async handleMessagesUpsert(messages: any[]): Promise<void> {
    for (const message of messages) {
      await this.normalizer?.dispatchMessage(message);
    }
  }

  private async handleMessagesDelete(keys: any[]): Promise<void> {
    logInfo('[BaileysAdapter] MENSAGENS_DELETADAS (confirmacao do servidor)', {
      count: keys.length,
      keys: keys.map((k: any) => ({ id: k.id, remoteJid: k.remoteJid, participant: k.participant })),
    });
    // Re-dispatch para normalizer/observer se houver hook registrado
    for (const key of keys) {
      await this.normalizer?.dispatchKeyDeleted?.(key);
    }
  }

  private async handleMessagesDeleteAll(jid: string, all: boolean): Promise<void> {
    logInfo('[BaileysAdapter] MENSAGENS_DELETADAS_TODAS', { jid, all });
  }

  private async handleMessagesUpdate(updates: any[]): Promise<void> {
    logInfo('[BaileysAdapter] MENSAGENS_ATUALIZADAS', {
      count: updates.length,
      updates: updates.slice(0, 5).map((u: any) => ({
        id: u.id, remoteJid: u.remoteJid,
        hasProtocol: !!(u?.message as any)?.protocolMessage,
      })),
    });
    for (const update of updates) {
      await this.normalizer?.dispatchMessageUpdate?.(update);
    }
  }

  /**
   * Entrada/saída de membros — `group-participants.update` do Baileys.
   *
   * Fluxo: Baileys → BaileysConnection → AQUI → memberJoinService → welcome.
   * Antes desta implementação o listener não existia e o memberJoinService era
   * código morto (nunca chamado).
   */
  private async handleGroupParticipantsUpdate(event: any): Promise<void> {
    const groupId = event?.id || '';
    const action = event?.action || '';
    const rawParticipants: any[] = event?.participants || [];
    if (!groupId || !rawParticipants.length) return;

    // Registra a relação grupo → comunidade (linkedParent do metadata).
    // É a identificação REAL da Comunidade 085, não uma lista de nomes.
    try {
      const chat = await this.getChat(groupId);
      const meta = (chat as any)?.raw || {};
      if (meta.linkedParent) {
        const { upsertCommunityGroup } = await import('../../services/welcomeService.js');
        await upsertCommunityGroup(groupId, meta.linkedParent, (chat as any)?.name);
      }
    } catch { /* metadata indisponível — não bloqueia o fluxo */ }

    // ─── SAÍDA de membro → Feedback (automação independente do AutoMod) ───
    // Registra no SQLite (fonte oficial). O Telegram é apenas espelho.
    if (action === 'remove') {
      try {
        const { recordExitEvent, consolidatePending, isCommunityGroup } = await import('../../services/feedbackService.js');
        const chat = await this.getChat(groupId).catch(() => null);
        const meta = (chat as any)?.raw || {};
        const communityId = meta.linkedParent || null;
        const communityName = communityId ? 'Fortaleza 085' : null;
        const groupName = (chat as any)?.name || groupId;

        for (const raw of rawParticipants) {
          const id = typeof raw === 'string' ? raw : (raw?.id || '');
          if (!id) continue;
          const hit = ((chat as any)?.participants || []).find((p: any) => p?.id === id);
          const eventType = communityId ? 'group_leave' : 'group_leave';
          await recordExitEvent({
            platform: 'whatsapp',
            userId: id,
            phoneNumber: hit?.phoneNumber,
            displayName: hit?.name || hit?.pushName,
            groupId,
            groupName,
            communityId: communityId ?? undefined,
            communityName: communityName ?? undefined,
            eventType,
            leftAt: Date.now(),
          });
          // Agrupa saídas próximas do mesmo usuário em um único pedido
          await consolidatePending(id);
        }
      } catch (err: any) {
        logWarning('[Baileys] feedback de saída falhou:', err?.message);
      }
      return; // 'remove' não faz welcome
    }

    // Só 'add' interessa para welcome/ban-on-rejoin.
    if (action !== 'add') return;

    // Resolve os dados de cada novato (nome + PN) a partir do metadata.
    let participants: Array<{ id: string; name?: string; phoneNumber?: string }> = [];
    try {
      const chat = await this.getChat(groupId);
      const parts: any[] = (chat as any)?.participants || [];
      participants = rawParticipants.map((raw: any) => {
        const id = typeof raw === 'string' ? raw : (raw?.id || '');
        const hit = parts.find((p: any) => p?.id === id);
        return { id, name: hit?.name || hit?.pushName, phoneNumber: hit?.phoneNumber };
      });
    } catch {
      participants = rawParticipants.map((raw: any) => ({
        id: typeof raw === 'string' ? raw : (raw?.id || ''),
      }));
    }

    try {
      const { handleMemberJoin } = await import('../../services/memberJoinService.js');
      await handleMemberJoin(
        {
          removeParticipant: (g: string, u: string) => this.removeParticipant(g, u),
          sendMessage: async (g: string, text: string) => { await this.sendMessage(g, text); },
          resolveGroupName: async (g: string) => (await this.getChat(g))?.name || g,
        },
        { groupId, members: participants },
      );
    } catch (err: any) {
      logWarning('[Baileys] handleGroupParticipantsUpdate falhou:', err?.message);
    }
  }

  /**
   * Coleta de apresentações — mensagens de membros em grupos da Comunidade 085.
   *
   * Gatilhos:
   *   1. reply à mensagem de welcome → MUITO FORTE
   *   2. $apresentar → MUITO FORTE (tratado no comando)
   *   3. entrou recente + ≥2 sinais → contextual
   *   4. sessão já aberta → continua coletando
   *
   * NUNCA usa uma palavra isolada ("idade") como prova.
   */
  private async handlePresentationCollect(normMsg: any): Promise<void> {
    try {
      const { getOrCreateSession, getActiveSession, collectMessage, isCommunity085Group, DEFAULT_IDLE_MS } =
        await import('../../services/presentationService.js');

      const chatId = normMsg?.chatId || '';
      const senderId = normMsg?.senderId || '';
      const text = normMsg?.text || '';
      const messageId = normMsg?.messageId || '';
      const mediaType = normMsg?.mediaType;

      if (!chatId || !senderId || !chatId.includes('@g.us')) return;

      // Só publica na Comunidade 085 — mas a coleta é gratuita (não bloqueia).
      const inCommunity = await isCommunity085Group(chatId);

      // 1. Sessão já aberta → continua coletando
      const active = getActiveSession(chatId, senderId);
      if (active) {
        collectMessage(active, messageId, text, mediaType ? { type: mediaType === 'image' ? 'image' : 'other', mediaType } : undefined);
        return;
      }

      // 2. Reply à mensagem de welcome → MUITO FORTE
      const replyTo = normMsg?.replyToMessageId || normMsg?.quotedMessageId;
      if (replyTo) {
        // Se a mensagem respondida foi o welcome do bot, abre sessão
        const { getWelcomeMessage } = await import('../../services/welcomeService.js');
        const welcome = await getWelcomeMessage(chatId);
        // Heurística: se o texto da mensagem respondida contém "Bem-vindo" ou o welcome customizado
        const quotedText = normMsg?.quotedText || '';
        if (quotedText.includes('Bem-vindo') || (welcome && quotedText.includes(welcome))) {
          const s = getOrCreateSession(chatId, senderId, 'welcome_reply');
          collectMessage(s, messageId, text, mediaType ? { type: mediaType === 'image' ? 'image' : 'other', mediaType } : undefined);
          return;
        }
      }

      // 3. Gatilho contextual: entrou recente + ≥2 sinais de apresentação
      // (não implementado aqui — requer tracking de tempo de entrada)
      // Por enquanto, só coleta se houver sinais claros no texto
      const sinais = countPresentationSignals(text);
      if (sinais >= 2) {
        const s = getOrCreateSession(chatId, senderId, 'signals');
        collectMessage(s, messageId, text, mediaType ? { type: mediaType === 'image' ? 'image' : 'other', mediaType } : undefined);
      }
    } catch (e: any) {
      logWarning('[Baileys] handlePresentationCollect falhou:', e?.message);
    }
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
          // Baileys v7: sock.store não existe; obtém display name via getChat/getContactById
          try {
            const u = await this.getContactById(normMsg.userId);
            senderName = u?.formattedName || u?.notify || u?.verifiedName || u?.name || '';
          } catch { /* ignorar */ }
          if (!senderName) {
            try {
              const recent = await this.connection.getSock()?.waitForMessage(normMsg.chatId, '');
              if (recent?.pushName) senderName = recent.pushName;
            } catch { /* ignorar */ }
          }
          await evaluate(
            normMsg.raw,
            {
              sock: this.connection.getSock(),
              userId: this.userId,
              fromMe: normMsg.isFromMe,
              groupName: normMsg.chatId.endsWith('@g.us')
                ? (await this.getChat(normMsg.chatId))?.name
                  || (await this.getChat(normMsg.chatId))?.subject
                  || normMsg.chatId
                : normMsg.chatId,
              getChat: async (jid: string) => {
                try {
                  const res = await this.getChat(jid);
                  return {
                    // Objetos normalizados (id/phoneNumber/isAdmin/isSuperAdmin) —
                    // preserva isAdmin para o admin check do AutoMod e dos comandos.
                    participants: res?.participants || [],
                    id: res?.id || jid,
                    subject: res?.name,
                  };
                } catch { return null; }
              },

              removeParticipant: async (g: string, u: string) => {
                try { await this.removeParticipant(g, u); } catch { /* ignorar */ }
              },
              sendMessage: async (jid: string, text: string, opts?: any) => {
                try { return await this.sendMessage(jid, text, opts); } catch { return null as any; }
              },
              log: logInfo,
              warn: logWarning,
              error: logError,
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