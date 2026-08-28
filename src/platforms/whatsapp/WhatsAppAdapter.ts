/**
 * 🔒 WarriorBlack - WhatsApp Adapter
 *
 * Wrapper do whatsapp-web.js existente para a interface PlatformAdapter
 */

import { Client, Message, Chat, Contact, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  PlatformType,
  PlatformAdapter,
  PlatformClient,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  SendOptions,
  MediaPayload,
  MessageHandler
} from './base/PlatformTypes';
import { platformManager } from '../PlatformManager';
import { processAutoMod } from '../../services/autoModService';
import { handleKeywords } from '../../services/keywordHandler';
import { startLocationPoller } from '../../services/locationPoller';

export class WhatsAppAdapter implements PlatformAdapter, PlatformClient {
  readonly platform: PlatformType = 'whatsapp';
  readonly client: PlatformClient;
  private innerClient!: Client;
  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;
  private isManuallyDestroyed = false;
  private _processedMsgIds = new Set<string>();
  private readyTimeout: ReturnType<typeof setTimeout> | null = null;
  private _infoReady = false;
  public userId = '';
  public userName = '';
  public isReady = false;
  private authDir: string;

  constructor(config?: { authDir?: string }) {
    this.authDir = config?.authDir || process.env.WWBJS_AUTH_DIR || '.wwebjs_auth';
    if (!this.authDir) this.authDir = '.wwebjs_auth';
    this.client = this;
    // ⚠️ DESCONTINUADO: SIGINT/SIGTERM handlers e connect() imediato foram removidos.
    // O PlatformManager.shutdownAll() gerencia os sinais e chama shutdown().
    // A conexão é feita por initialize() (chama connect()) ou pode ser feita adiação
    // pelo chamador — não conectar no constructor para evitar(side effects durante
    // criação de múltiplas sessões em batch.
  }

  private connect(): void {
    const authPath = path.join(process.cwd(), this.authDir);
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    const puppeteerConfig: any = {
      headless: true,
      timeout: 120000,
      protocolTimeout: 180000,
      executablePath: process.env.WWEBJS_CHROME_PATH || '/home/solanojr/.cache/puppeteer/chrome/linux-120.0.6099.109/chrome-linux64/chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--disable-extensions',
        '--use-gl=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox'
      ]
    };

    try { this.innerClient?.destroy?.(); } catch { /* ignora */ }

    this.innerClient = new Client({
      authStrategy: new LocalAuth({ dataPath: authPath }),
      puppeteer: puppeteerConfig,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36'
    });

    this.innerClient.on('ready', () => this.handleReadyEvent());

    this.setupEventHandlers();
    this.innerClient.initialize();

    if (this.readyTimeout) clearTimeout(this.readyTimeout);
    this.readyTimeout = setTimeout(() => {
      if (!this.isReady) {
        console.error('═'.repeat(60));
        console.error('⚠️ [DIAG] WA Web NÃO autenticou em 240s. Verifique o log:');
        console.error('⚠️ [DIAG]   Se apareceu "QR Code recebido", apenas ESCANEIE o QR.');
        console.error('⚠️ [DIAG]   Se NÃO apareceu QR, o Chromium pode estar travado.');
        console.error('⚠️ [DIAG] Correção: rm -rf .baileys_auth* + pm2 restart + QR novo.');
        console.error('═'.repeat(60));
      }
    }, 240000);
  }

  private setupEventHandlers(): void {
    this.innerClient.on('qr', (qr: string) => {
      console.log('[WhatsApp] 🔑 QR Code recebido — ESCANEIE com seu WhatsApp (App > Dispositivos conectados):');
      console.log('[WhatsApp] ⚠️ Bot AINDA NÃO está online. Ele só fica online após escanear o QR ou restaurar a sessão.');
      qrcode.generate(qr, { small: true });
      console.log('[WhatsApp] (Se não precisar escanear, a sessão foi restaurada do cache LocalAuth.)');
    });
    this.innerClient.on('authenticated', () => {
      console.log('[WhatsApp] 🔓 Sessão autenticada com sucesso (LocalAuth restaurado ou novo login).');
    });
    this.innerClient.on('auth_failure', (msg: string) => {
      console.error(`[WhatsApp] ❌ Falha de autenticação: ${msg}`);
      console.error('[WhatsApp] A sessão pode estar inválida; pode ser necessário limpar .baileys_auth e reescaneear o QR.');
    });
    this.innerClient.on('change_state', (state: string) => {
      console.log(`[WhatsApp] 🔄 Mudança de estado da conexão: ${state}`);
      if (state === 'CONNECTED') this.registerMessageHandlers();
    });
    this.innerClient.on('message_ack', (m: any, a: any) => console.log(`[DIAG] message_ack disparou - from: ${m?.from} ack: ${a}`));
    this.innerClient.on('incoming_call', (c: any) => console.log(`[DIAG] incoming_call disparou - ${c?.from}`));
    this.innerClient.on('message_revoke_everyone', () => console.log('[DIAG] message_revoke_everyone disparou'));
    this.innerClient.on('group_update', () => console.log('[DIAG] group_update disparou'));
  }

  private async handleReadyEvent(): Promise<void> {
    if (this.readyTimeout) { clearTimeout(this.readyTimeout); this.readyTimeout = null; }
    this.isReady = true;

    // Aguarda o innerClient.info estar disponível (pode demorar após o evento ready)
    let attempts = 0;
    while (!this.innerClient?.info && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 200));
      attempts++;
    }
    if (this.innerClient?.info) {
      this._infoReady = true;
      this.userId = this.innerClient.info.wid._serialized || '';
      this.userName = this.innerClient.info.pushname || 'Bot-WPP';
      console.log(`[WhatsApp] ✅ Pronto como ${this.userName} (${this.userId})`);
    } else {
      console.error('[WhatsApp] ⚠️ innerClient.info não disponível após 10s - usando userId vazio');
      this._infoReady = true;
      this.userId = '';
      this.userName = 'Bot-WPP';
    }

    console.log('[WhatsApp] 🛡️ Sistema de AutoMod (via Handler) pronto');
    this.registerMessageHandlers();

    // Pequeno delay para garantir que o puppeteer está totalmente inicializado
    // antes de enviar a mensagem de prova (evita "Cannot read properties of null (reading 'evaluate')")
    await new Promise(resolve => setTimeout(resolve, 800));

    const alvoDono = '558581344211@c.us';
    const alvoTeste = process.env.WPP_TEST_GROUP_ID || '';
    const msgOnline = '🤖 WPP online (WarriorBlack). Conexão restabelecida e enviando esta mensagem como prova de funcionamento.';
    this.sendMessage(alvoDono, msgOnline)
      .then(() => console.log('[WhatsApp] ✅ Mensagem de prova ENVIADA para', alvoDono))
      .catch((e: any) => console.error('[WhatsApp] ❌ Falha ao enviar msg de prova para dono:', e?.message));

    if (alvoTeste) {
      this.sendMessage(alvoTeste, msgOnline)
        .then(() => console.log('[WhatsApp] ✅ Mensagem de prova ENVIADA para grupo teste', alvoTeste))
        .catch((e: any) => console.error('[WhatsApp] ❌ Falha ao enviar msg de prova para grupo teste:', e?.message));

      setTimeout(async () => {
        try {
          const grp = await this.innerClient.getChatById(alvoTeste);
          const me = this.innerClient.info?.wid?._serialized || '';
          console.log(`[DIAG grupo teste] me=${me} participants=${JSON.stringify((grp.participants || []).map((p: any) => ({
            id: p.id._serialized,
            isAdmin: p.isAdmin,
            isSuperAdmin: p.isSuperAdmin
          })))}`);
        } catch (e: any) {
          console.error('[DIAG grupo teste] erro:', e?.message);
        }
      }, 4000);
    } else {
      console.log('[WhatsApp] ⚠️ WPP_TEST_GROUP_ID nao definido - pulando msg de prova no grupo teste');
    }

    const hbChat = process.env.HEARTBEAT_CHAT;
    const hbUrl = process.env.HEARTBEAT_URL;
    if (hbChat || hbUrl) {
      try {
        let hash = 'local';
        try { hash = execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim(); } catch { /* ignore */ }
        const plats = platformManager.getActivePlatforms();
        const payload = { bot: this.userId, commit: hash, platforms: plats, uptime: Math.floor(process.uptime()) };
        if (hbChat) {
          const ping = `💓 [HEARTBEAT] bot=${this.userId} commit=${hash} plataformas=[${plats.join(', ')}] uptime=${payload.uptime}s`;
          this.sendMessage(hbChat, ping).catch(() => {});
        }
        if (hbUrl) {
          fetch(hbUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
        }
      } catch { /* ignore */ }
    }

    if (this.readyHandler) this.readyHandler();
    startLocationPoller(5000);
  }

  private handleDisconnectedEvent(reason: string): void {
    this.isReady = false;
    console.log(`[WhatsApp] 🔌 Desconectado: ${reason}`);
    if (this.disconnectedHandler) this.disconnectedHandler(reason);

    // Só envia mensagem de offline se o client ainda existe e está pronto
    if (this.innerClient && this._infoReady) {
      const msgOffline = `🔴 WPP OFFLINE (WarriorBlack). Motivo: ${reason}. Reconectando...`;
      this.sendMessage('558581344211@c.us', msgOffline).catch(() => {});
      const grpTeste = process.env.WPP_TEST_GROUP_ID;
      if (grpTeste) this.sendMessage(grpTeste, msgOffline).catch(() => {});
    } else {
      console.log('[WhatsApp] ⚠️ Não envia msg de offline — client nulo ou não pronto.');
    }

    if (!this.isManuallyDestroyed) {
      console.log('[WhatsApp] ♻️ Reconectando (nova instancia de Client)...');
      setTimeout(() => this.connect(), 3000);
    }
  }

  public onGroupJoin(handler: (notification: any) => void): void {
    this.innerClient.on('group_join', async (notification: any) => {
      try { await this.handleMemberJoin(notification); } catch (error) {
        console.error('[WhatsApp] Erro ao processar entrada de membro:', error);
      }
    });
  }

  public onGroupUpdate(handler: (notification: any) => void): void {
    this.innerClient.on('group_update', async (notification: any) => {
      try {
        if (notification.type === 'add') await this.handleMemberJoin(notification);
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar atualização de grupo:', error);
      }
    });
  }

  public onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  public onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  public onDisconnected(handler: (reason: string) => void): void {
    this.disconnectedHandler = handler;
  }

  public isConnected(): boolean {
    return this.isReady && !!this.innerClient;
  }

  public destroy(): void {
    this.isManuallyDestroyed = true;
    this._infoReady = false;
    this.isReady = false;
    try {
      if (this.innerClient) {
        this.innerClient.destroy();
        this.innerClient = null as any;
      }
    } catch { /* ignora */ }
  }

  public async initialize(): Promise<void> {
    // Constructor does NOT call connect() anymore — initialize() is the entry point.
    // If the previous client was destroyed, allow re-initialization by calling connect().
    if (this.innerClient && !this.isManuallyDestroyed) {
      console.log('[WhatsAppAdapter] Already initialized.');
      return;
    }
    this.connect();
  }

  public async shutdown(): Promise<void> {
    this.isManuallyDestroyed = true;
    this._infoReady = false;
    this.isReady = false;
    this.userId = '';
    this.userName = '';
    try {
      if (this.innerClient) {
        this.innerClient.destroy();
        this.innerClient = null as any;
      }
    } catch { /* ignora */ }
    console.log('[WhatsAppAdapter] Shutdown completo');
  }

  public async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<string | null> {
    // Aguarda o client estar pronto para evitar "Cannot read properties of null (reading 'evaluate')"
    while (!this._infoReady || !this.innerClient) {
      if (!this.innerClient) {
        const err = new Error('WhatsAppAdapter: innerClient nulo — adapter não inicializado ou destruído');
        console.error('[WhatsAppAdapter.sendMessage]', err.message);
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    try {
      const result = await this.innerClient.sendMessage(chatId, text, options);
      return result?.id?._serialized || result?.id?.id || null;
    } catch (err: any) {
      console.error(`[WhatsAppAdapter.sendMessage] ERRO ao enviar mensagem para ${chatId}:`, err?.message);
      throw err;
    }
  }

  public async sendMedia(chatId: string, payload: MediaPayload, caption?: string, options?: SendOptions): Promise<string | null> {
    while (!this._infoReady || !this.innerClient) {
      if (!this.innerClient) {
        const err = new Error('WhatsAppAdapter: innerClient nulo — adapter não inicializado ou destruído');
        console.error('[WhatsAppAdapter.sendMedia]', err.message);
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    try {
      const message = await this.innerClient.sendMessage(chatId, payload, { caption, ...options });
      return message?.id?._serialized || message?.id?.id || null;
    } catch (err: any) {
      console.error(`[WhatsAppAdapter.sendMedia] ERRO ao enviar mídia para ${chatId}:`, err?.message);
      throw err;
    }
  }

  public async getChat(chatId: string): Promise<PlatformChat> {
    const chat = await this.innerClient.getChatById(chatId);
    return {
      id: chat?.id?._serialized || chat?.id?.id || chatId,
      name: chat?.name || '',
      description: chat?.description || '',
      isGroup: chat?.isGroup || false,
      participants: [],
      metadata: chat || {},
    };
  }

  public async getUserInfo(userId: string): Promise<PlatformUser> {
    const contact = await this.innerClient.getContactById(userId);
    return {
      id: contact?.id?._serialized || userId,
      name: contact?.pushname || contact?.name || userId,
      isBot: contact?.isBot || false,
      isBusiness: contact?.isBusiness || false,
    };
  }

  public async removeParticipant(chatId: string, participantId: string): Promise<void> {
    const chat = await this.innerClient.getChatById(chatId);
    if (chat?.isGroup) {
      await this.innerClient.removeParticipant(chatId, participantId);
    }
  }

  public async getGroupAdmins(chatId: string): Promise<string[]> {
    const chat = await this.innerClient.getChatById(chatId);
    if (!chat?.isGroup) return [];
    return (chat.participants || [])
      .filter((p: any) => p.isAdmin || p.isSuperAdmin)
      .map((p: any) => p.id._serialized || p.id);
  }

  public async setAdmin(chatId: string, participantId: string, isAdmin: boolean): Promise<void> {
    await this.innerClient.setGroupAdmin(chatId, participantId, isAdmin);
  }

  private async registerMessageHandlers(): void {
    this.innerClient.removeAllListeners?.('message');
    this.innerClient.removeAllListeners?.('message_create');

    this.innerClient.on('message', async (msg: Message) => {
      console.log('[WhatsAppAdapter] Mensagem recebida - msg:', !!msg, 'msg.from:', msg?.from, 'msg.author:', msg?.author);

      if (!msg?.body && (msg as any)?._data) {
        const d = (msg as any)._data;
        console.log('[DIAG] msg.body vazio. type:', msg?.type, '| _data.body:', d?.body, '| _data.conversation:', d?.conversation);
      }

      const mid = msg?.id?._serialized || msg?.id?.id;
      if (mid && this._processedMsgIds.has(mid)) return;
      if (mid) this._processedMsgIds.add(mid);

      if (!msg) { console.error('[WhatsAppAdapter] ERRO: msg é null/undefined, ignorando'); return; }
      if (!msg.id) { console.error('[WhatsAppAdapter] ERRO: msg não tem id, ignorando - msg type:', typeof msg); return; }

      try {
        const intercepted = await handleKeywords(msg, this.innerClient);
        if (intercepted) {
          console.log('😏 [WhatsAppAdapter] Palavra-chave detectada, resposta enviada');
        } else {
          const moderated = await processAutoMod(msg, this.innerClient);
          if (moderated) console.log(`🛡️ [WhatsAppAdapter] Mensagem moderada e deletada de ${msg.author || msg.from}`);
        }
      } catch (err: any) {
        console.error('[WhatsAppAdapter] Erro em AutoMod/Keywords (nao bloqueante):', err?.message);
      }

      if (this.messageHandler) {
        try {
          const platformMsg = await this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error('[WhatsAppAdapter] Erro ao normalizar mensagem:', normError.message);
        }
      }
    });

    (this as any).selfTestHandleKeywords = async (msg: any) => handleKeywords(msg, this.innerClient);

    this.innerClient.on('message_create', async (msg: Message) => {
      if (!msg) { console.error('[WhatsAppAdapter] message_create: msg é null/undefined, ignorando'); return; }
      if (!msg.id) { console.error('[WhatsAppAdapter] message_create: msg não tem id, ignorando'); return; }

      const mid = msg?.id?._serialized || msg?.id?.id;
      if (mid && this._processedMsgIds.has(mid)) return;
      if (mid) this._processedMsgIds.add(mid);

      try {
        const intercepted = await handleKeywords(msg, this.innerClient);
        if (intercepted) {
          console.log('😏 [WhatsAppAdapter] Palavra-chave detectada (message_create), resposta enviada');
          return;
        }
      } catch (err: any) {
        console.error('[WhatsAppAdapter] Erro em handleKeywords (message_create):', err?.message);
      }

      if (this.messageHandler) {
        try {
          const platformMsg = await this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error('[WhatsAppAdapter] Erro ao normalizar message_create:', normError.message);
        }
      }
    });
  }

  private async handleMemberJoin(notification: any): Promise<void> {
    try {
      console.log('[handleMemberJoin] ENTRY - notification:', !!notification);
      const groupId = notification.chatId || notification.id?.remote;
      const newMembers = notification.recipientIds || notification.recipients || [];
      console.log('[WhatsApp] Novo(s) membro(s) entrando:', { groupId, members: newMembers });

      try {
        const { recordMemberJoin } = await import('../../services/autoModService');
        for (const memberId of newMembers) {
          console.log('[handleMemberJoin] Registrando membro:', memberId);
          recordMemberJoin(groupId, memberId);
        }
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao registrar entrada de membro para AutoMod:', err.message);
      }

      try {
        const { isUserBanned } = await import('../../services/databaseService');
        for (const memberId of newMembers) {
          const cleanMember = memberId.replace('@lid', '@c.us');
          const banned = await isUserBanned(cleanMember, groupId);
          if (banned) {
            console.log(`[handleMemberJoin] ${memberId} está BANIDO - removendo automaticamente`);
            try {
              await this.removeParticipant(groupId, memberId);
              await this.innerClient.sendMessage(groupId,
                `🚫 @${memberId.split('@')[0]} foi banido anteriormente e não pode entrar neste grupo.`,
                { mentions: [memberId] }).catch(() => {});
            } catch (rmErr: any) {
              console.error('[handleMemberJoin] Falha ao remover banido que entrou:', rmErr?.message);
            }
          }
        }
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao verificar banidos na entrada:', err.message);
      }

      let customMessage = '';
      try {
        const { getWelcomeMessage } = await import('../../bot/commands/welcome');
        customMessage = getWelcomeMessage(groupId) || '';
      } catch { /* ignora */ }

      try {
        const { getGroupMod } = await import('../../services/databaseService');
        const mod = await getGroupMod(groupId);
        if (!mod.bemvindo) {
          console.log(`[handleMemberJoin] bemvindo DESATIVADO no grupo ${groupId} - pulando saudacao`);
          return;
        }
      } catch { /* se falhar, envia mesmo assim */ }

      for (const memberId of newMembers) {
        const welcomeText = `Bem-vindo(a) @${memberId.split('@')[0]}! 🎉`;
        const fullMessage = customMessage ? `${welcomeText}\n\n${customMessage}` : welcomeText;
        await this.innerClient.sendMessage(groupId, fullMessage, { mentions: [memberId] });
        console.log(`[WhatsApp] Boas-vindas enviadas para ${memberId} no grupo ${groupId}`);
      }
    } catch (error) {
      console.error('[WhatsApp] Erro ao enviar boas-vindas:', error);
    }
  }

  private async normalizeMessage(msg: any): Promise<PlatformMessage> {
    const msgHash = Math.random().toString(36).substring(7);

    if (!msg) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg é null/undefined! msgHash: ${msgHash}`);
      throw new Error('Mensagem undefined/null em normalizeMessage - fonte desconhecida');
    }

    if (!msg.id) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg não tem id! msgHash: ${msgHash}`);
      throw new Error('Mensagem sem id em normalizeMessage');
    }

    const msgBody = msg?.body || '';
    const authorId = msg?.author?._serialized || msg?.from || '';
    const chatId = msg?.to?._serialized || msg?.chat?.id?._serialized || '';
    const authorName = msg?.author ? msg.author._serialized : msg?.from || 'unknown';
    
    // Get sender name from pushname or notifyName
    const senderName = msg?.pushName || msg?.notifyName || authorName;

    return {
      id: msg.id._serialized || msg.id.id || msgHash,
      chatId: `wpp:${chatId}`,
      userId: `wpp:${authorId}`,
      userName: senderName,
      text: msgBody,
      timestamp: new Date(msg?.timestamp * 1000 || Date.now()),
      isFromMe: msg?.isFromMe || false,
      isCommand: false,
      platform: 'whatsapp',
      raw: msg,
      hasMedia: !!msg?.mediaData,
      mediaType: msg?.mediaData ? (msg.type === 'image' ? 'image' : msg.type === 'video' ? 'video' : msg.type === 'audio' ? 'audio' : 'document') : undefined,
      replyToMessageId: msg?.quotedMsg ? `wpp:${msg.quotedMsg.id._serialized}` : undefined,
    };
  }
}
