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

    // Reply handling — preservar WAMessageKey original sem reconstrução
    // Baileys v7 exige: msgOpts.quoted = mensagemOriginal.raw (ou pelo menos { key, message })
    const quotedRaw = options?.originalRawMessage || options?.quoteMessage?.message;
    logInfo(`[BaileysSender.sendMessage] Reply: quotedRaw=${!!quotedRaw}, replyTo=${options?.replyToMessageId}, originalKey=${options?.originalKey?.id || 'NAO'}`);
    if (quotedRaw || options?.replyToMessageId) {
      const quotedId = options.replyToMessageId?.split(':').pop() || quotedRaw?.key?.id;
      const quotedFromMe = options.quotedFromMe ?? false;
      const quotedParticipant = options.quotedParticipant;
      let quotedText = options.quotedText || '';

      // Recuperar texto original via waitForMessage se necessário
      if (!quotedText && this.sock && quotedId) {
        try {
          const foundMsg = await this.sock.waitForMessage(jid, quotedId);
          if (foundMsg) {
            const mm = foundMsg.message || foundMsg;
            const t = typeof mm?.conversation === 'string' ? mm.conversation
              : (typeof mm?.extendedTextMessage?.text === 'string' ? mm.extendedTextMessage.text : '');
            if (t) { quotedText = t; }
          }
        } catch { /* ignora falha na recuperação */ }
      }

      // Usar key original se disponível (sem reconstrução/truncação)
      const quotedKey = options.originalKey || {
        id: quotedId,
        remoteJid: jid,
        participant: quotedFromMe ? undefined : quotedParticipant,
        fromMe: !!quotedFromMe,
      };

      msgOpts.quoted = quotedRaw || {
        key: quotedKey,
        message: { conversation: quotedText, extendedTextMessage: { text: quotedText } },
      };
      logInfo(`[BaileysSender.sendMessage] Quoted payload construído: keyId=${msgOpts.quoted?.key?.id || 'NAO'}, hasMessage=${!!msgOpts.quoted?.message}`);
    }

    // PROBLEMA 6 — LOG TEMPORÁRIO: mostrar exatamente o que Baileys recebe antes de sendMessage
    // NÃO ALTERAR — apenas auditoria para distinguir A/B/C/D
    logInfo(`[AUDIT] BaileysSender.sendMessage — ANTES de sock.sendMessage`);
    logInfo(`[AUDIT]  msgOpts.text: ${String(msgOpts.text)?.substring(0,30)}`);
    if (msgOpts.quoted) {
      logInfo(`[AUDIT]  msgOpts.quoted presente: SIM`);
      logInfo(`[AUDIT]    quoted.type: ${(msgOpts.quoted as any)?.message ? 'message_object' : 'other'}`);
      logInfo(`[AUDIT]    quoted.key.id: ${(msgOpts.quoted as any)?.key?.id || 'N/A'}`);
      logInfo(`[AUDIT]    quoted.key.remoteJid: ${(msgOpts.quoted as any)?.key?.remoteJid || 'N/A'}`);
      logInfo(`[AUDIT]    quoted.key.fromMe: ${(msgOpts.quoted as any)?.key?.fromMe}`);
      logInfo(`[AUDIT]    quoted.key.participant: ${(msgOpts.quoted as any)?.key?.participant || 'undefined'}`);
      logInfo(`[AUDIT]    quoted.key.participantAlt: ${(msgOpts.quoted as any)?.key?.participantAlt || 'undefined'}`);
      logInfo(`[AUDIT]    quoted.key.addressingMode: ${(msgOpts.quoted as any)?.key?.addressingMode || 'undefined'}`);
      logInfo(`[AUDIT]    quoted.message present: ${!!(msgOpts.quoted as any)?.message}`);
      logInfo(`[AUDIT]    quoted.message keys: ${(msgOpts.quoted as any)?.message ? Object.keys((msgOpts.quoted as any)?.message || {}).join(',') : 'N/A'}`);
      logInfo(`[AUDIT]    msgOpts.quoted === originalRawMessage: ${(msgOpts.quoted === options?.originalRawMessage || msgOpts.quoted === (options?.originalRawMessage || null))}`);
    } else {
      logInfo(`[AUDIT]  msgOpts.quoted: NAO PRESENTE (envio sem quote)`);
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

  async react(messageId: string, emoji: string, chatId?: string, originalKey?: any): Promise<void> {
    if (!this.sock) return;
    try {
      // CORREÇÃO 2026-09-17: Usar WAMessageKey original se disponível (sem reconstrução)
      if (originalKey && originalKey.id) {
        logInfo(`[Baileys.react] Usando WAMessageKey original`, {
          id: originalKey.id,
          remoteJid: originalKey.remoteJid,
          fromMe: originalKey.fromMe,
          participant: originalKey.participant
        });
        await this.sock.sendMessage(originalKey.remoteJid, {
          react: {
            text: emoji,
            key: {
              id: originalKey.id,
              remoteJid: originalKey.remoteJid,
              fromMe: originalKey.fromMe,
              participant: originalKey.participant
            }
          }
        });
        logInfo(`[Baileys.react] ✅ Reação enviada com sucesso`);
        return;
      }
      
      // Fallback: reconstruir (pode falhar com prefixos)
      const parts = messageId.split(':');
      const msgId = parts[parts.length - 1];
      const remoteJid = chatId || '';
      
      logInfo(`[Baileys.react] Fallback: reconstruindo chave`);
      await this.sock.sendMessage(remoteJid, {
        react: {
          text: emoji,
          key: { id: msgId, remoteJid, fromMe: true, participant: undefined }
        }
      });
    } catch (err: any) {
      logError('[Baileys.react] erro', err);
      throw err;
    }
  }
}
