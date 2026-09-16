/**
 * BaileysMessageNormalizer — Normalização, dispatch e observação de mensagens Baileys.
 * Extraído de BaileysAdapter para separar responsabilidade de normalização.
 */

import { logInfo, logWarning, logError } from '../../../services/loggerService';
import { normId, toJid } from './util';
import type { WAMessage, WAMessageKey } from '@whiskeysockets/baileys';
import { capture } from '../../../../laboratorio/capture-store';

export interface NormalizedMessage {
  id: string;
  platform: string;
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: Date;
  isFromMe: boolean;
  isCommand: boolean;
  mentions: Array<{ id: string; name: string; isBot: boolean; platform: string; raw: any }>;
  replyToMessageId?: string;
  quotedFromMe: boolean;
  quotedParticipant?: string;
  quotedText?: string;
  hasMedia: boolean;
  raw: any;
  correlationId: string;
}

export interface BaileysMessageNormalizerDeps {
  sock: any;
  platform: string;
  userId: string;
  getChat: (jid: string) => Promise<any>;
  sendMessage: (jid: string, text: string, opts?: any) => Promise<any>;
  removeParticipant: (g: string, u: string) => Promise<void>;
}

export class BaileysMessageNormalizer {
  private sock: any;
  private platform: string;
  private userId: string;
  private getChat: (jid: string) => Promise<any>;
  private sendMessage: (jid: string, text: string, opts?: any) => Promise<any>;
  private removeParticipant: (g: string, u: string) => Promise<void>;
  private msgHandler: ((msg: NormalizedMessage) => Promise<void>) | null = null;
  private bootTimestamp: number = Date.now(); // timestamp de inicialização para filtrar histórico antigo

  constructor(deps: BaileysMessageNormalizerDeps) {
    this.sock = deps.sock;
    this.platform = deps.platform;
    this.userId = deps.userId;
    this.getChat = deps.getChat;
    this.sendMessage = deps.sendMessage;
    this.removeParticipant = deps.removeParticipant;
  }

  setSock(sock: any): void {
    this.sock = sock;
  }

  setMessageHandler(handler: (msg: NormalizedMessage) => Promise<void>): void {
    this.msgHandler = handler;
  }

  async dispatchMessage(rawMsg: any): Promise<void> {
    try {
      capture(rawMsg, this.userId);

      // Observação opcional
      await this.runObservation(rawMsg);

      const hasStub = rawMsg.messageStubType || (Array.isArray(rawMsg.messageStubParameters) && rawMsg.messageStubParameters.length > 0);
      if (hasStub) return;

      const m = rawMsg.message || {};
      const key: WAMessageKey = rawMsg.key;
      const remoteJid = key.remoteJid || '';
      const isGroup = remoteJid.endsWith('@g.us');
      const fromMe = !!key.fromMe;

      // Pular mensagens do próprio bot (fromMe: true) — o anúncio do autoMod é uma nova mensagem
      // que o Baileys buffer reprocessa durante o initial sync, gerando loop infinito
      if (fromMe) {
        return;
      }

      // Pular mensagens antigas do histórico (initial sync do Baileys) — apenas processar mensagens recebidas após o boot
      const msgTimestamp = rawMsg.messageTimestamp ? Number(rawMsg.messageTimestamp) * 1000 : 0;
      if (msgTimestamp > 0 && msgTimestamp < this.bootTimestamp - 5000) {
        // Mensagem do histórico anterior ao boot — ignorar para não reprocessar loop antigo
        return;
      }

      // Resolve chatJid e senderJid (lógica de LID/@g.us)
      let chatJid: string;
      let senderJid: string;
      if (isGroup) {
        chatJid = remoteJid;
        senderJid = key.participant || '';
        // Se não há participante, é uma mensagem interna do sistema — ignora
        if (!senderJid) {
          logInfo(`[DBG-disp] mensagem sem participante (interno?) — ignorando. key=${JSON.stringify(key)}`);
          return;
        }
        // Se o participante é o próprio grupo, é um protocol message (revoke/delete) — ignora
        if (senderJid === remoteJid) {
          logInfo(`[DBG-disp] mensagem com senderJid == groupId (protocol message) — ignorando. key=${JSON.stringify(key)}`);
          return;
        }
      } else if (key.participant && key.participant.endsWith('@g.us')) {
        chatJid = key.participant;
        senderJid = remoteJid;
      } else {
        chatJid = remoteJid;
        senderJid = fromMe ? this.userId : (key.participant || remoteJid);
      }

      const from = chatJid;
      const participant = senderJid;
      const sender = senderJid;

      // Extrai texto e legendas (incluindo interactiveMessage e templateMessage)
      let body = this.extractText(m);

      // Extrai URLs e domínios do payload bruto para o AutoMod (mesmo quando body está vazio)
      const extractedUrls = this.extractUrlsFromPayload(m);

      // AutoMod fire-and-forget: avalia TODAS as mensagens (inclusive mídias e botões interativos)
      // Pula mensagens do próprio bot para evitar loop (o anúncio do autoMod é uma nova mensagem)
      // Dupla defesa: fromMe false E não é um anúncio do autoMod (evita reprocessar o anúncio que o bot enviou)
      const isAutoModAnnouncement = body && (body.startsWith('🚫 [AUTOMOD]') || body.startsWith('🤖 [AUTOMOD]') || body.startsWith('📢 [AUTOMOD]') || body.startsWith('[AUTOMOD]'));
      if (!fromMe && !isAutoModAnnouncement) {
        void this.runAutoMod(rawMsg, from, sender, fromMe);
      }

      // Se não há nenhum texto, não despacha para processamento de comandos normais
      if (!body || !body.trim()) return;

      const mentioned = m.extendedTextMessage?.contextInfo?.mentionedJidList ||
        m.imageMessage?.contextInfo?.mentionedJidList || [];
      const cinfo = m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || {};
      const quoted = cinfo.quotedMessage;
      const quotedKey = quoted ? cinfo.stanzaId : undefined;

      const quotedFromMe = !!(quoted && (fromMe || cinfo.participant === undefined ||
        cinfo.participant === this.userId || cinfo.participant === normId(this.userId)));
      const quotedParticipant = cinfo.participant
        ? normId(cinfo.participant)
        : (quotedFromMe ? normId(this.userId) : undefined);

      const quotedText = typeof quoted?.conversation === 'string'
        ? quoted.conversation
        : (typeof quoted?.extendedTextMessage?.text === 'string' ? quoted.extendedTextMessage.text : '');

      logInfo(`[DBG-disp] citação: existe=${!!quoted} texto="${quotedText}"`);

      const normMsg: NormalizedMessage = {
        id: `${this.platform}:${key.id}`,
        platform: this.platform,
        chatId: normId(from),
        userId: normId(sender),
        userName: '',
        text: body,
        timestamp: rawMsg.messageTimestamp
          ? new Date(Number(rawMsg.messageTimestamp) * 1000)
          : new Date(),
        isFromMe: fromMe,
        isCommand: body.startsWith('$'),
        mentions: mentioned.map((x: string) => ({
          id: normId(x), name: '', isBot: false, platform: this.platform, raw: {}
        })),
        replyToMessageId: quotedKey ? `${this.platform}:${quotedKey}` : undefined,
        quotedFromMe,
        quotedParticipant,
        quotedText,
        hasMedia: false,
        raw: rawMsg,
        correlationId: `msg-${key.id}-${Date.now()}`,
      };

      // Mute check
      const { handleMutedMessage } = await import('../../../bot/commands/mute.js');
      const muted = await handleMutedMessage({
        chatId: normId(from),
        userId: normId(sender),
        raw: {
          delete: async () => {
            await this.sock?.sendMessage(from, { delete: key });
          },
        },
      });
      if (muted) return;

      // Dispatch para handlers de comandos normais
      if (this.msgHandler) {
        await this.msgHandler(normMsg);
      }

    } catch (e: any) {
      logError('Baileys.normalizeMsg', e);
    }
  }

  /** Chamado quando o servidor Baileys confirma deleção de uma mensagem (messages.delete event).
   *  Registra no capture-store para auditoria do experimento de delete.
   */
  async dispatchKeyDeleted(key: any): Promise<void> {
    try {
      logInfo('[BaileysNormalizer] dispatchKeyDeleted', {
        id: key.id,
        remoteJid: key.remoteJid,
        participant: key.participant,
        participantAlt: key.participantAlt,
        addressingMode: key.addressingMode,
      });
      // Registra a deleção no JSONL para rastreamento do experimento
      if (key.id && key.remoteJid) {
        const captureEntry = {
          captureId: `del-${key.id}-${Date.now()}`,
          capturedAt: new Date().toISOString(),
          groupId: key.remoteJid.endsWith('@g.us') ? key.remoteJid : '',
          messageId: key.id,
          remoteJid: key.remoteJid,
          participant: key.participant || '',
          fromMe: !!key.fromMe,
          timestamp: Date.now(),
          messageType: 'revoked_deleted',
          contentType: 'delete_confirmation',
          senderJid: key.participant || key.remoteJid,
          isGroup: key.remoteJid?.endsWith('@g.us') || false,
          pushName: '',
          size: 0,
          event: 'key_deleted',
          key: key,
        };
        const { appendCapture } = require('../../../../laboratorio/capture-store.js');
        if (typeof appendCapture === 'function') {
          appendCapture(captureEntry);
        }
      }
    } catch (e: any) {
      logWarning('[BaileysNormalizer] dispatchKeyDeleted falhou:', e?.message);
    }
  }

  /** Chamado quando o servidor Baileys envia um evento de atualização de mensagem (messages.update).
   *  Pode conter protocolMessage (ex: revoke recebido do servidor).
   */
  async dispatchMessageUpdate(update: any): Promise<void> {
    try {
      const key = update?.key;
      const message = update?.message;
      const hasProtocol = !!(message && (message as any).protocolMessage);

      logInfo('[BaileysNormalizer] dispatchMessageUpdate', {
        id: key?.id,
        remoteJid: key?.remoteJid,
        participant: key?.participant,
        hasProtocol,
        protocolType: hasProtocol ? (message as any).protocolMessage?.type : null,
      });

      // Se é um protocol message de revoke, captura para o experimento
      if (hasProtocol && (message as any).protocolMessage?.type === 'REVOKE') {
        if (key?.id && key?.remoteJid) {
          const { appendCapture } = require('../../../../laboratorio/capture-store.js');
          if (typeof appendCapture === 'function') {
            appendCapture({
              captureId: `proto-revoke-${key.id}-${Date.now()}`,
              capturedAt: new Date().toISOString(),
              groupId: key.remoteJid.endsWith('@g.us') ? key.remoteJid : '',
              messageId: key.id,
              remoteJid: key.remoteJid,
              participant: key.participant || '',
              fromMe: !!key.fromMe,
              timestamp: Date.now(),
              messageType: 'protocol_revoke',
              contentType: 'protocolMessage',
              senderJid: key.participant || key.remoteJid,
              isGroup: key.remoteJid?.endsWith('@g.us') || false,
              pushName: '',
              size: 0,
              event: 'protocol_revoke',
              key: key,
              protocolMessage: (message as any).protocolMessage,
            });
          }
        }
      }
    } catch (e: any) {
      logWarning('[BaileysNormalizer] dispatchMessageUpdate falhou:', e?.message);
    }
  }

  private extractText(m: any): string {
    if (!m || typeof m !== 'object') return '';
    const parts: string[] = [];

    if (typeof m.conversation === 'string') parts.push(m.conversation);
    if (typeof m.extendedTextMessage?.text === 'string') parts.push(m.extendedTextMessage.text);
    if (typeof m.extendedTextMessage?.caption === 'string') parts.push(m.extendedTextMessage.caption);
    if (typeof m.imageMessage?.caption === 'string') parts.push(m.imageMessage.caption);
    if (typeof m.videoMessage?.caption === 'string') parts.push(m.videoMessage.caption);
    if (typeof m.documentMessage?.caption === 'string') parts.push(m.documentMessage.caption);
    if (typeof m.buttonsMessage?.contentText === 'string') parts.push(m.buttonsMessage.contentText);
    if (typeof m.buttonsMessage?.footerText === 'string') parts.push(m.buttonsMessage.footerText);
    if (typeof m.listResponseMessage?.title === 'string') parts.push(m.listResponseMessage.title);
    if (typeof m.templateButtonReplyMessage?.selectedDisplayText === 'string')
      parts.push(m.templateButtonReplyMessage.selectedDisplayText);

    // InteractiveMessage / NativeFlow (cards, botões de ação e links)
    const im = m.interactiveMessage;
    if (im) {
      if (typeof im.body?.text === 'string') parts.push(im.body.text);
      if (typeof im.header?.title === 'string') parts.push(im.header.title);
      if (typeof im.footer?.text === 'string') parts.push(im.footer.text);
      const buttons = im.nativeFlowMessage?.buttons || [];
      for (const b of buttons) {
        if (typeof b.buttonParamsJson === 'string') {
          try {
            const parsed = JSON.parse(b.buttonParamsJson);
            if (parsed.display_text) parts.push(parsed.display_text);
            if (parsed.url) parts.push(parsed.url);
          } catch { /* ignore */ }
        }
      }
    }

    // TemplateMessage (cards hydrated com botões CTA)
    const tm = m.templateMessage?.hydratedTemplate || m.templateMessage;
    if (tm) {
      if (typeof tm.hydratedContentText === 'string') parts.push(tm.hydratedContentText);
      if (typeof tm.hydratedTitleText === 'string') parts.push(tm.hydratedTitleText);
      if (typeof tm.hydratedFooterText === 'string') parts.push(tm.hydratedFooterText);
      const buttons = tm.hydratedButtons || [];
      for (const b of buttons) {
        if (b.urlButton?.displayText) parts.push(b.urlButton.displayText);
        if (b.urlButton?.url) parts.push(b.urlButton.url);
        if (b.quickReplyButton?.displayText) parts.push(b.quickReplyButton.displayText);
      }
    }

    return parts.join(' ').trim();
  }

  private async runObservation(rawMsg: any): Promise<void> {
    try {
      if (process.env.WPP_OBSERVATION_MODE !== '1') return;
      const obs = require('../../laboratorio/observer.js');
      if (!obs || typeof obs.callObserverHook !== 'function') return;

      const key = rawMsg.key;
      const remoteJid = key.remoteJid || '';
      const isGroup = remoteJid.endsWith('@g.us');
      let groupForObs = '';
      let isGroupMsg = false;

      if (isGroup) {
        groupForObs = remoteJid;
        isGroupMsg = true;
      } else if (key.participant && key.participant.endsWith('@g.us')) {
        groupForObs = key.participant;
        isGroupMsg = true;
      }

      if (isGroupMsg && groupForObs) {
        obs.callObserverHook({
          rawMsg,
          groupJid: groupForObs,
          senderJid: key.participant || remoteJid,
          fromMe: !!key.fromMe,
          pushName: rawMsg.pushName || '',
          messageTimestamp: rawMsg.messageTimestamp,
          eventType: 'messages.upsert',
        });
      }
    } catch { /* observação opcional */ }
  }

  private async runAutoMod(rawMsg: any, from: string, sender: string, fromMe: boolean): Promise<void> {
    try {
      const { evaluate } = await import('../../../services/autoModEngine.js');
      void (async () => {
        try {
          // display name do remetente
          let senderName = '';
          // Baileys v7: sock.store não existe; obtém via getChat ou waitForMessage
          try {
            const chat = await this.getChat(sender);
            senderName = chat?.name || chat?.subject || '';
          } catch { /* ignorar */ }
          if (!senderName) {
            try {
              // Fallback: tenta buscar a mensagem mais recente do remetente
              const recent = await this.sock.waitForMessage(from, '');
              if (recent?.pushName) senderName = recent.pushName;
            } catch { /* ignorar */ }
          }

          await evaluate(
            rawMsg,
            {
              sock: this.sock,
              userId: this.userId,
              fromMe: fromMe,  // passa para o evaluate saber se é mensagem do bot
              groupName: from.endsWith('@g.us')
                ? (this.sock?.store?.chats?.[from]?.subject || from)
                : from,
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
              sendMessage: async (jid: string, text: string, opts: any) => {
                try { await this.sendMessage(jid, text, opts); return {} as any; }
                catch { return null as any; }
              },
              removeParticipant: async (g: string, u: string) => {
                try { await this.removeParticipant(g, u); } catch { /* ignorar */ }
              },
              log: logInfo,
              warn: logWarning,
              error: logError,
            },
            from,
            sender,
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

  /** Extrai URLs e domínios do payload bruto da mensagem para uso no AutoMod.
   *  Chamado mesmo quando body está vazio (mensagens interativas, imagens sem legenda, etc.)
   */
  private extractUrlsFromPayload(m: any): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    function tryAdd(url: string): void {
      if (!url || seen.has(url)) return;
      try {
        const p = new URL(url.startsWith('www.') ? 'http://' + url : url);
        const normalized = p.href.toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          urls.push(normalized);
        }
      } catch { /* ignore invalid URLs */ }
    }

    // Captions de mídia
    if (typeof m.imageMessage?.caption === 'string') tryAdd(m.imageMessage.caption);
    if (typeof m.videoMessage?.caption === 'string') tryAdd(m.videoMessage.caption);
    if (typeof m.documentMessage?.caption === 'string') tryAdd(m.documentMessage.caption);

    // Botões (extrai URLs dos params JSON)
    if (m.buttonsMessage) {
      const bm = m.buttonsMessage as any;
      const buttons = bm.buttons || [];
      for (const b of buttons) {
        try {
          if (b.buttonParamsJson) {
            const params = JSON.parse(String(b.buttonParamsJson));
            if (params.url) tryAdd(params.url);
          }
        } catch { /* ignore */ }
      }
    }

    // Interactive message
    if (m.interactiveMessage) {
      const im = m.interactiveMessage as any;
      const buttons = im.nativeFlowMessage?.buttons || [];
      for (const b of buttons) {
        try {
          if (b.buttonParamsJson) {
            const params = JSON.parse(String(b.buttonParamsJson));
            if (params.url) tryAdd(params.url);
          }
        } catch { /* ignore */ }
      }
    }

    // Template message
    if (m.templateMessage) {
      const tm = (m.templateMessage as any).hydratedTemplate || m.templateMessage;
      const buttons = tm.hydratedButtons || [];
      for (const b of buttons) {
        if (b.urlButton?.url) tryAdd(b.urlButton.url);
      }
    }

    // Product message
    if (m.productMessage) {
      const pm = m.productMessage as any;
      const buttons = pm.buttons || [];
      for (const b of buttons) {
        try {
          if (b.buttonParamsJson) {
            const params = JSON.parse(String(b.buttonParamsJson));
            if (params.url) tryAdd(params.url);
          }
        } catch { /* ignore */ }
      }
    }

    // Extended text com link preview
    if (m.extendedTextMessage) {
      const etm = m.extendedTextMessage as any;
      try {
        const lp = etm['linkPreview'];
        if (lp && typeof lp === 'object' && lp['canonical-url']) {
          tryAdd(lp['canonical-url']);
        }
      } catch { /* ignore */ }
    }

    // Conversa (texto direto pode conter URLs)
    if (typeof m.conversation === 'string') tryAdd(m.conversation);

    return urls;
  }
}