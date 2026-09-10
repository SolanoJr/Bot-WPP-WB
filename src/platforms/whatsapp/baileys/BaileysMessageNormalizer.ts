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

      // Resolve chatJid e senderJid (lógica de LID/@g.us)
      let chatJid: string;
      let senderJid: string;
      if (isGroup) {
        chatJid = remoteJid;
        senderJid = key.participant || remoteJid;
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

      // Extrai texto
      let body = this.extractText(m);
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

      // Dispatch
      if (this.msgHandler) {
        await this.msgHandler(normMsg);
      }

      // AutoMod fire-and-forget
      void this.runAutoMod(rawMsg, from, sender, fromMe);

    } catch (e: any) {
      logError('Baileys.normalizeMsg', e);
    }
  }

  private extractText(m: any): string {
    if (typeof m.conversation === 'string') return m.conversation;
    if (typeof m.extendedTextMessage?.text === 'string') return m.extendedTextMessage.text;
    if (typeof m.imageMessage?.caption === 'string') return m.imageMessage.caption;
    if (typeof m.videoMessage?.caption === 'string') return m.videoMessage.caption;
    if (typeof m.buttonsMessage?.contentText === 'string') return m.buttonsMessage.contentText;
    if (typeof m.listResponseMessage?.title === 'string') return m.listResponseMessage.title;
    if (typeof m.templateButtonReplyMessage?.selectedDisplayText === 'string')
      return m.templateButtonReplyMessage.selectedDisplayText;
    return '';
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
              log: console.log.bind(console), // autoModEngine ainda usa console; será migrado depois
              warn: console.warn.bind(console),
              error: console.error.bind(console),
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
}