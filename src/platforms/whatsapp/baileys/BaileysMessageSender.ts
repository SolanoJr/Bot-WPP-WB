/** BaileysMessageSender — Envio de mensagens, mídia, reações e lógica de quoting.
 * Extraído de BaileysAdapter.
 */

import { logInfo, logError } from '../../../services/loggerService';
import { normId, toJid } from './util';
import type { WAMessageKey } from '@whiskeysockets/baileys';
import type { MediaPayload, SendOptions, PlatformMessage } from '../../base/PlatformTypes';
import fs from 'fs';

export interface BaileysMessageSenderDeps {
  sock: any;
  platform: string;
  userId: string;
  userName: string;
  getNumberId: (phone: string) => Promise<{ serialized: string; lid?: string } | null>;
  getContactById: (id: string) => Promise<any>;
}

export class BaileysMessageSender {
  private sock: any;
  private platform: string;
  private userId: string;
  private userName: string;
  private getNumberId: (phone: string) => Promise<{ serialized: string; lid?: string } | null>;
  private getContactById: (id: string) => Promise<any>;

  constructor(deps: BaileysMessageSenderDeps) {
    this.sock = deps.sock;
    this.platform = deps.platform;
    this.userId = deps.userId;
    this.userName = deps.userName;
    this.getNumberId = deps.getNumberId;
    this.getContactById = deps.getContactById;
  }

  setSock(sock: any): void {
    this.sock = sock;
  }

  async sendMessage(chatId: string, text: string, options?: any): Promise<any> {
    if (!this.sock) throw new Error('Baileys não conectado');
    const jid = toJid(chatId);
    const msgOpts: any = { text };

    // Delete message support
    if (options?.delete) {
      const del = options.delete;
      const deleteMsg: any = { id: del.id, fromMe: !!del.fromMe };
      if (del.participant) deleteMsg.participant = toJid(del.participant);
      const res = await this.sock.sendMessage(jid, { delete: deleteMsg });
      return {
        id: `${this.platform}:${res.key?.id || del.id}`,
        platform: this.platform,
        chatId: chatId,
        userId: this.userId,
        userName: '',
        text: '',
        isFromMe: true,
        isCommand: false,
        hasMedia: false,
        timestamp: new Date(),
        raw: res,
      };
    }

    // Reply handling
    if (options?.replyToMessageId) {
      const quotedId = options.replyToMessageId.split(':').pop();
      const quotedFromMe = options.quotedFromMe ?? false;
      const quotedParticipant = options.quotedParticipant ? toJid(options.quotedParticipant) : undefined;
      let quotedText = options.quotedText || '';

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
        key: {
          id: quotedId,
          remoteJid: jid,
          fromMe: quotedFromMe,
          participant: quotedFromMe ? undefined : quotedParticipant,
        },
        message: { conversation: quotedText, extendedTextMessage: { text: quotedText } },
      };
    }

    // Arbitrary quoteMessage
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
      // handled in caller
    }

    const res = await this.sock.sendMessage(toJid(chatId), msgOpts);
    return {
      id: `${this.platform}:${res.key.id}`,
      platform: this.platform,
      chatId: chatId,
      userId: this.userId,
      userName: '',
      text,
      isFromMe: true,
      isCommand: false,
      hasMedia: false,
      timestamp: new Date(),
      raw: res,
    };
  }

  async sendMedia(chatId: string, media: any, caption?: string, options?: any): Promise<any> {
    if (!this.sock) throw new Error('Baileys não conectado');
    const jid = toJid(chatId);
    const msgOpts: any = { caption: caption || '' };
    if (options?.sendAudioAsVoice && media.type === 'audio') msgOpts.ptt = true;

    if (typeof media.data === 'string' && fs.existsSync(media.data)) {
      msgOpts[media.type] = fs.readFileSync(media.data);
      if (media.filename) msgOpts.mimetype = media.mimetype;
    } else if (Buffer.isBuffer(media.data)) {
      msgOpts[media.type] = media.data;
    } else {
      msgOpts[media.type] = { url: media.data as string };
    }
    const res = await this.sock.sendMessage(toJid(chatId), msgOpts);
    return {
      id: `${this.platform}:${res.key.id}`,
      platform: this.platform,
      chatId: chatId,
      userId: this.userId,
      userName: '',
      text: caption || '',
      isFromMe: true,
      isCommand: false,
      hasMedia: true,
      timestamp: new Date(),
      raw: res,
    };
  }

  async react(messageId: string, emoji: string): Promise<void> {
    if (!this.sock) return;
    try {
      const msgId = messageId.split(':').pop() || '';
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
      logError('Baileys.react', e);
    }
  }
}
