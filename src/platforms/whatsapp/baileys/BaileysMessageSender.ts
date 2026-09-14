/** BaileysMessageSender — Envio de mensagens, mídia, reações e lógica de quoting.
 * Extraído de BaileysAdapter.
 *
 * CORREÇÃO (2026-09-14): o bloco de delete agora preserva a WAMessageKey completa
 * em vez de reconstruir uma chave truncada. Campos como participantAlt e
 * addressingMode chegam ao sock.sendMessage() intactos.
 */

import { logInfo, logWarning, logError } from '../../../services/loggerService';
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

    // ─── Delete message support ───
    // Preserve the COMPLETE WAMessageKey — do NOT reconstruct a truncated key.
    if (options?.delete) {
      const del = options.delete;

      // Log completo da chave antes de enviar — para auditoria do experimento.
      logInfo('[BaileysSender] delete request — complete key (antes de sock.sendMessage)', {
        id: del.id,
        remoteJid: del.remoteJid,
        fromMe: del.fromMe,
        participant: del.participant,
        participantAlt: del.participantAlt,
        addressingMode: del.addressingMode,
      });

      // validaremoteJid obrigatório para grupos
      if (!del.remoteJid) {
        logWarning('[BaileysSender] delete key SEM remoteJid — o revoke pode ser rejeitado pelo servidor');
      }

      // WARN: não converter participant LID→PN; usar del.participant como está.
      // O Baileys v7 rc14 aceita participant no formato LID para grupos.
      const deletePayload: any = { delete: del };

      const res = await this.sock.sendMessage(jid, deletePayload);

      logInfo('[BaileysSender] delete response', {
        key: res?.key,
        protocolMessage: res?.message?.protocolMessage
          ? {
              type: res.message.protocolMessage.type,
            }
          : null,
        status: res?.status,
      });

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

      if (!quotedText && this.sock) {
        try {
          // Baileys v7: store.messages não existe; usa waitForMessage para recuperar a mensagem original
          const foundMsg = await this.sock.waitForMessage(jid, quotedId);
          if (foundMsg) {
            const mm = foundMsg.message || foundMsg;
            const t = typeof mm?.conversation === 'string' ? mm.conversation
              : (typeof mm?.extendedTextMessage?.text === 'string' ? mm.extendedTextMessage.text : '');
            if (t) { quotedText = t; }
          }
        } catch { /* ignora falha na recuperação */ }
      }

      msgOpts.quoted = {
        key: {
          id: quotedId,
          remoteJid: jid,
          participant: quotedFromMe ? undefined : quotedParticipant,
          fromMe: !!quotedFromMe,
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
      // Baileys v7: sock.store não existe; usa waitForMessage para localizar a mensagem
      const foundMsg: any = await this.sock.waitForMessage('', msgId);
      if (foundMsg && foundMsg.key) {
        await this.sock.sendMessage(foundMsg.key.remoteJid, {
          react: { text: emoji, key: foundMsg.key },
        });
      } else {
        logWarning('Baileys.react', `mensagem não encontrada para reagir: ${messageId}`);
      }
    } catch (e: any) {
      logError('Baileys.react', e);
    }
  }
}
