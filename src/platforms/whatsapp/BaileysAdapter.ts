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
  PlatformAdapter,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  PlatformType,
  SendOptions,
  MediaPayload,
  MessageHandler,
} from '../base/PlatformTypes';

// ⚠️ NÃO defina MASTER_LID aqui com fallback hardcoded: '2592935567439@lid' é o
// LID do PRÓPRIO BOT (provado no log: myPN=558581344211 / myLID=2592935567439).
// O destino do dono é resolvido por getOwnerNotifyTarget(), que blinda esse caso
// e nunca devolve o identificador do bot.
import { getOwnerNotifyTarget } from '../../services/permissions';

// Converte ID do Baileys para formato interno.
// ⚠️ A versão anterior fazia `.replace(/:/, '@')`, o que transformava
// '558581344211:60@s.whatsapp.net' em '558581344211@60@s.whatsapp.net' (ID
// inválido). O correto é DESCARTAR o sufixo de device e preservar o domínio.
export function normId(id: string): string {
  if (!id) return '';
  // Remove prefixo de plataforma (wpp:, tg:, dc:) antes de processar
  const clean = String(id).replace(/^(wpp:|tg:|dc:)/, '');
  const s = clean;
  const at = s.indexOf('@');
  if (at === -1) return s.split(':')[0];
  const user = s.slice(0, at).split(':')[0];
  const domain = s.slice(at);
  // @s.whatsapp.net é o domínio interno do Baileys; o resto do sistema usa @c.us.
  return `${user}${domain === '@s.whatsapp.net' ? '@c.us' : domain}`;
}

export function toJid(id: string): string {
  // Remove prefixo de plataforma (wpp:, tg:, dc:) antes de processar
  const clean = String(id).replace(/^(wpp:|tg:|dc:)/, '');
  // PlatformMessage usa @c.us / @g.us / @lid; Baileys quer @s.whatsapp.net / @g.us / @lid
  if (clean.includes('@g.us')) return clean;
  if (clean.includes('@lid')) return clean; // Baileys v7 entende @lid diretamente
  return clean.replace('@c.us', '@s.whatsapp.net');
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
  private _loggedOutNotified = false;

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
        printQRInTerminal: true,
        connectTimeoutMs: 120000,
        keepAliveIntervalMs: 30000,
        // ⚠️ NÃO definir `browser` custom: o user-agent ['Ubuntu','Chrome','20.0.0']
        // fazia o servidor WA tratar a sessão como companion "mudo" (não entregava
        // messages.upsert de terceiros). Com config mínima, o bot recebe msgs normalmente.
        emitOwnEvents: true,
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
          if (statusCode === DisconnectReason.loggedOut || statusCode === 428) {
            console.log(`[Baileys] 🚪 Deslogado — precisa escanear QR novamente.`);
            // Notifica o dono UMA vez e para de reconectar em loop.
            // O servidor WA invalidou a sessão — sem novo QR, reconectar não resolve.
            // printQRInTerminal=false, então o QR não aparece no terminal.
            // O dono precisa escanear o QR que será enviado via sendQrToOwner().
            if (!this._loggedOutNotified) {
              this._loggedOutNotified = true;
              this.notifyOwner(`🚪 *Sessão WhatsApp encerrada*\nO servidor desconectou o bot (sessão expirada).\n\n⚠️ Novo QR code necessário. Reconnectando em 30s para gerar...`).catch(() => {});
              // Força re-init completo após 30s para gerar novo QR
              setTimeout(() => {
                console.log(`[Baileys] 🔄 Reconectando (loggedOut - tentativa única)...`);
                this.connect();
              }, 30000);
            } else {
              console.log(`[Baileys] ⏸️ loggedOut já notificado — aguardando QR manual. Não reconectando em loop.`);
            }
          } else if (reason.includes('Stream Errored') || reason.includes('conflict')) {
            // Sessão inválida no servidor — força re-init completo do socket
            console.log(`[Baileys] 🔄 Stream Errored — forçando re-init completo...`);
            try { this.sock?.end?.(new Error('force-reinit')); } catch {}
            // Reconecta após breve delay
            setTimeout(() => {
              console.log(`[Baileys] 🔄 Reconectando...`);
              this.connect();
            }, 2000);
          } else if (reason.includes('Connection Failure') || reason.includes('Timed Out') || reason.includes('socket hang up')) {
            // Falha de handshake/rede — reconecta com backoff
            console.log(`[Baileys] 🔄 ${reason} — reconectando em 5s...`);
            this.notifyOwner(`⚠️ *WhatsApp desconectado*: ${reason}\nReconectando automaticamente...`).catch(() => {});
            setTimeout(() => {
              console.log(`[Baileys] 🔄 Reconectando (connection failure)...`);
              this.connect();
            }, 5000);
          } else {
            // Qualquer outro motivo não mapeado — tenta reconectar com backoff longo
            console.log(`[Baileys] ⚠️ Desconhecido (${reason}) — reconectando em 10s...`);
            setTimeout(() => {
              console.log(`[Baileys] 🔄 Reconectando (unknown reason)...`);
              this.connect();
            }, 10000);
          }
        }
      });

      this.sock.ev.on('creds.update', saveCreds);

      // MODERAÇÃO DE ENTRADA (ban persistente, antibots, boas-vindas).
      // Antes isso existia SÓ no WhatsAppAdapter (WWebJS/legado), então com
      // WPP_ENGINE=baileys nada disso rodava em produção.
      this.sock.ev.on('group-participants.update', async (ev: any) => {
        try {
          if (ev?.action !== 'add') return;
          const { handleMemberJoin } = await import('../../services/memberJoinService');
          await handleMemberJoin(
            {
              removeParticipant: (groupId, userId) => this.removeParticipant(groupId, userId),
              sendMessage: (groupId, text, mentions) =>
                this.sendMessage(groupId, text, mentions ? ({ mentionedIds: mentions } as any) : undefined),
            },
            {
              groupId: normId(ev.id),
              members: (ev.participants || []).map((p: string) => normId(p)),
            }
          );
        } catch (e: any) {
          console.error('[Baileys] erro em group-participants.update:', e?.message);
        }
      });

      // TEMP: verifica se a citacao foi aplicada pelo servidor WA
      this.sock.ev.on('messages.update', (updates: any) => {
        for (const u of updates || []) {
          const ctxInfo = u?.update?.message?.extendedTextMessage?.contextInfo
            || u?.message?.extendedTextMessage?.contextInfo;
          if (ctxInfo?.quotedMessage) {
            console.log(`[DBG-update] CITACAO APLICADA id=${u?.key?.id} texto="${String(ctxInfo.quotedMessage?.conversation || ctxInfo.quotedMessage?.extendedTextMessage?.text || '').slice(0,20)}"`);
          }
        }
      });

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
      const remoteJid = key.remoteJid || '';
      const isGroup = remoteJid.endsWith('@g.us');
      const fromMe = !!key.fromMe;
      // No Baileys rc14 com sessao LID, mensagens de grupo podem chegar com
      // key.remoteJid = LID do usuario e key.participant = JID do grupo.
      // O chat real é: grupo se remoteJid é @g.us, senao o participant (se for @g.us), senao o remoteJid.
      let chatJid: string;
      let senderJid: string;
      if (isGroup) {
        chatJid = remoteJid;
        senderJid = key.participant || remoteJid;
      } else if (key.participant && key.participant.endsWith('@g.us')) {
        // Mensagem de grupo entregue com remoteJid = LID e participant = grupo
        chatJid = key.participant;
        senderJid = remoteJid;
      } else {
        chatJid = remoteJid;
        senderJid = fromMe ? this.userId : (key.participant || remoteJid);
      }
      const from = chatJid;
      const participant = senderJid;
      const sender = senderJid;

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
      const cinfo = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || {};
      const quoted = cinfo.quotedMessage;
      const quotedKey = quoted ? cinfo.stanzaId : undefined;
      // Metadados da mensagem citada (quem a enviou) — essenciais para o reply
      // re-citar corretamente no Baileys.
      const quotedFromMe = !!(quoted && (fromMe || cinfo.participant === undefined || cinfo.participant === this.userId || cinfo.participant === normId(this.userId)));
      const quotedParticipant = cinfo.participant
        ? normId(cinfo.participant)
        : (quotedFromMe ? normId(this.userId) : undefined);
      // Texto da mensagem citada — o Baileys PRECISA do conteúdo real da msg
      // original para montar a citação (senão manda solto).
      const quotedText = typeof quoted?.conversation === 'string'
        ? quoted.conversation
        : (typeof quoted?.extendedTextMessage?.text === 'string' ? quoted.extendedTextMessage.text : '');
      console.log(`[DBG-disp] quotedExiste=${!!quoted} quotedText="${quotedText}" stanzaId=${quotedKey}`);

      const platformMsg: PlatformMessage = {
        id: `${this.platform}:${key.id}`,
        platform: this.platform,
        chatId: normId(from),
        userId: normId(sender),
        userName: '',
        text: body,
        timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
        isFromMe: fromMe,
        isCommand: body.startsWith('$'),
        mentions: mentioned.map((x: string) => ({ id: normId(x), name: '', isBot: false, platform: this.platform, raw: {} })),
        replyToMessageId: quotedKey ? `${this.platform}:${quotedKey}` : undefined,
        quotedFromMe,
        quotedParticipant,
        quotedText,
        hasMedia: false,
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
  // REAÇÃO
  // ============================================================
  async react(messageId: string, emoji: string): Promise<void> {
    if (!this.sock) return;
    try {
      const msgId = messageId.split(':').pop();
      // Buscar a mensagem no store para obter a key
      const store = this.sock.store as any;
      const messages = Object.values(store.messages || {});
      for (const chat of messages as any[]) {
        const msg = chat?.get?.(msgId) || chat?.[msgId];
        if (msg) {
          await this.sock.sendMessage(msg.key.remoteJid, {
            react: { text: emoji, key: msg.key },
          });
          return;
        }
      }
    } catch (e: any) {
      console.error(`[Baileys] ❌ erro ao reagir: ${e?.message}`);
    }
  }
  async sendMessage(chatId: string, text: string, options?: any): Promise<PlatformMessage> {
    if (!this.sock) throw new Error('Baileys não conectado');
    const jid = toJid(chatId);
    const msgOpts: any = { text };

    // Suporte a exclusão de mensagem (usado pelo $delete e pelo autoMod silencioso):
    // sendMessage(jid, '', { delete: { id, fromMe, participant } })
    if (options?.delete) {
      const del = options.delete;
      const deleteMsg: any = { id: del.id, fromMe: !!del.fromMe };
      if (del.participant) deleteMsg.participant = toJid(del.participant);
      const res = await this.sock.sendMessage(jid, { delete: deleteMsg });
      return {
        id: `${this.platform}:${res.key?.id || del.id}`,
        platform: this.platform,
        chatId: normId(jid),
        userId: this.userId,
        userName: '',
        text: '',
        isFromMe: true,
        isCommand: false,
        hasMedia: false,
        timestamp: Date.now(),
        raw: res,
      };
    }

    if (options?.replyToMessageId) {
      const quotedId = options.replyToMessageId.split(':').pop();
      // fromMe/participant da mensagem ORIGINAL citada (não do bot). Quando o
      // humano marca uma msg de OUTRO e o bot responde, o quoted.key.fromMe deve
      // refletir a msg original — senão o WA rejeita a citação e a resposta some.
      const quotedFromMe = options.quotedFromMe ?? false;
      const quotedParticipant = options.quotedParticipant ? toJid(options.quotedParticipant) : undefined;
      let quotedText = options.quotedText || '';
      // Se o quotedText não veio (ex: echo do próprio bot não traz quotedMessage),
      // tenta recuperar a msg citada do store local do Baileys pelo id.
      if (!quotedText && this.sock?.store) {
        try {
          const store = this.sock.store as any;
          const chatMsgs = store.messages?.[jid] || store.messages?.[`${jid}`];
          const candidates = [
            chatMsgs?.get?.(quotedId),
            chatMsgs?.get?.(`${jid}:${quotedId}`),
            chatMsgs?.[quotedId],
            chatMsgs?.[`${jid}:${quotedId}`],
          ];
          for (const msg of candidates) {
            if (!msg) continue;
            const mm = msg.message || msg;
            const t = typeof mm?.conversation === 'string' ? mm.conversation
              : (typeof mm?.extendedTextMessage?.text === 'string' ? mm.extendedTextMessage.text : '');
            if (t) { quotedText = t; break; }
          }
        } catch { /* ignora */ }
      }
      msgOpts.quoted = {
        key: { id: quotedId, remoteJid: jid, fromMe: quotedFromMe, participant: quotedFromMe ? undefined : quotedParticipant },
        message: { conversation: quotedText, extendedTextMessage: { text: quotedText } },
      };
      console.log(`[DBG-quoted] enviando quoted: ${JSON.stringify(msgOpts.quoted.key)} fromMe=${quotedFromMe} text="${quotedText.slice(0,20)}" recoverStore=${!options.quotedText && !!quotedText}`);
    }
    // Suporte a citar mensagem arbitrária (usado pelo selftest e por comandos):
    // sendMessage(jid, text, { quoteMessage: { id, remoteJid, participant, fromMe } })
    if (options?.quoteMessage) {
      const q = options.quoteMessage;
      const quotedParticipant = q.participant ? toJid(q.participant) : (q.fromMe ? toJid(this.userId) : undefined);
      msgOpts.quoted = {
        key: {
          id: q.id,
          remoteJid: q.remoteJid ? toJid(q.remoteJid) : jid,
          participant: quotedParticipant,
          fromMe: !!q.fromMe,
        },
        message: q.message || { conversation: '' },
        participant: quotedParticipant,
      };
    }
    if (options?.mentionedIds?.length) {
      msgOpts.mentions = (options.mentionedIds as string[]).map((x: string) => toJid(x));
    }
    const sendTs = Date.now();
    const res = await this.sock.sendMessage(jid, msgOpts);
    const sentTs = Date.now();
    return {
      id: `${this.platform}:${res.key.id}`,
      platform: this.platform,
      chatId: normId(jid),
      userId: this.userId,
      userName: '',
      text,
      isFromMe: true,
      isCommand: false,
      hasMedia: false,
      timestamp: Date.now(),
      raw: res,
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
      platform: this.platform,
      chatId: normId(jid),
      userId: this.userId,
      userName: '',
      text: caption || '',
      isFromMe: true,
      isCommand: false,
      hasMedia: true,
      timestamp: Date.now(),
      raw: res,
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
    const metadata = await withTimeout<any>(this.sock.groupMetadata(jid).catch(() => null), 5000);
    return {
      id: normId(jid),
      platform: this.platform,
      name: metadata?.subject || '',
      isGroup: jid.endsWith('@g.us'),
      participants: metadata?.participants?.map((p: any) => normId(p.id)) || [],
      raw: metadata || {},
    };
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const jid = toJid(userId);
    const contact = await this.sock.contactFetch?.(jid).catch(() => null);
    return {
      id: normId(jid),
      platform: this.platform,
      name: contact?.name || contact?.notify || '',
      isBot: false,
      raw: contact || {},
    };
  }

  async getChats(): Promise<PlatformChat[]> {
    const chats = await this.sock.groupFetchAllParticipating?.().catch(() => ({}));
    return Object.values(chats || {}).map((c: any) => ({
      id: normId(c.id ?? ''),
      platform: this.platform,
      name: c.subject || c.name || '',
      isGroup: true,
      participants: (c.participants || []).map((p: any) => normId(p.id ?? p)),
      raw: c,
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
    const ownerId = getOwnerNotifyTarget();
    if (!ownerId) {
      console.error('[Baileys][notifyOwner] ❌ destino do dono não resolvido (configure MASTER_USER/MASTER_LID) — alerta descartado');
      return;
    }
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
        const ownerTarget = getOwnerNotifyTarget();
        try {
          if (!ownerTarget) throw new Error('destino do dono não resolvido');
          await this.sock.sendMessage(toJid(ownerTarget), {
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