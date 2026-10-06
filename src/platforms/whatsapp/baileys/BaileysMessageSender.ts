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

    /** Verifica se o socket está efetivamente conectado (WebSocket OPEN). */
    private isSocketReady(): boolean {
      if (!this.sock) return false;
      // Baileys v7: sock.ws é o WebSocketClient, sock.ws.socket é o WebSocket nativo
      const wsClient = this.sock.ws;
      if (!wsClient) return false;
      // WebSocketClient tem getter isOpen (verifica socket.readyState === OPEN)
      if (typeof wsClient.isOpen === 'boolean') return wsClient.isOpen;
      // Fallback: verificar WebSocket nativo diretamente
      const ws = wsClient.socket;
      if (!ws) return false;
      // WebSocket.OPEN = 1
      return ws.readyState === 1;
    }

    async sendMessage(chatId: string, text: string, options?: any): Promise<any> {
      if (!this.sock) throw new Error('Baileys não conectado');
      if (!this.isSocketReady()) {
        logWarning('[BaileysSender] sendMessage: socket existe mas NÃO está pronto (readyState !== OPEN)');
      }
      const jid = toJid(chatId);
      const msgOpts: any = { text };

    // ─── Delete message support ───
    // Preserve the COMPLETE WAMessageKey — do NOT reconstruct a truncated key.
    if (options?.delete) {
      const del = options.delete;

      logInfo('[BaileysSender] delete request — complete original key', {
        stanzaId: del.id || null,
        remoteJid: del.remoteJid || jid,
        participant: del.participant || null,
        fromMe: typeof del.fromMe === 'boolean' ? del.fromMe : null,
        originalWAMessageKey: del,
      });

      if (!del.id || !del.remoteJid) {
        throw new Error('Delete Baileys recusado: WAMessageKey sem id ou remoteJid');
      }

      const res = await this.sock.sendMessage(jid, { delete: del });
      logInfo('[BaileysSender] delete response', {
        stanzaId: del.id,
        key: res?.key,
        protocolMessageType: res?.message?.protocolMessage?.type ?? null,
        status: res?.status ?? null,
      });
      return {
        id: `${this.platform}:${res?.key?.id || del.id}`,
        platform: this.platform,
        chatId,
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
    // ⚠️ REGRA CRÍTICA (commit 25de193): quoted deve ser passado como 3º argumento (options), NUNCA dentro do 2º argumento (content).
    // Se quoted estiver em content, o Baileys ignora e envia mensagem sem citação.
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

    const { quoted, ...content } = msgOpts;
    const res = await this.sock.sendMessage(toJid(chatId), content, quoted ? { quoted } : undefined);
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

    // Baileys v7 expects: sendMessage(jid, content, options)
    // 'quoted' must go in options (3rd arg), NOT in content (2nd arg)
    // ⚠️ REGRA CRÍTICA (commit 25de193): quoted em content = ignorado
    const { quoted, ...content } = msgOpts;
    const res = await this.sock.sendMessage(toJid(chatId), content, quoted ? { quoted } : undefined);
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
      if (!this.isSocketReady()) {
        logWarning('[BaileysSender] react: socket existe mas NÃO está pronto (readyState !== OPEN)');
      }
      try {
        // CORREÇÃO: Usar WAMessageKey original se disponível — participant vem do remetente real,
        // NÃO derivado do JID do grupo (extractLidFromGroupJid estava incorreto).
        if (originalKey && originalKey.id) {
          logInfo(`[Baileys.react] Usando WAMessageKey original`, {
            id: originalKey.id,
            remoteJid: originalKey.remoteJid,
            fromMe: originalKey.fromMe,
            participant: originalKey.participant,
          });
          await this.sock.sendMessage(originalKey.remoteJid, {
            react: {
              text: emoji,
              key: {
                id: originalKey.id,
                remoteJid: originalKey.remoteJid,
                fromMe: originalKey.fromMe,
                participant: originalKey.participant, // ← remetente real da mensagem
              },
            },
          });
          logInfo(`[Baileys.react] ✅ Reação enviada com sucesso`);
          return;
        }

        // Fallback: reconstruir (sem participant — pode falhar em grupos)
        const parts = messageId.split(':');
        const msgId = parts[parts.length - 1];
        const remoteJid = chatId || '';

        logInfo(`[Baileys.react] Fallback: reconstruindo chave (sem participant)`);
        await this.sock.sendMessage(remoteJid, {
          react: {
            text: emoji,
            key: { id: msgId, remoteJid, fromMe: true, participant: undefined },
          },
        });
      } catch (err: any) {
        logError('[Baileys.react] erro', err);
        throw err;
      }
    }
  }
