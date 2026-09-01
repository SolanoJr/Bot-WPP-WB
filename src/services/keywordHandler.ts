import { getSarcasticResponse } from './aiService';
import logger from './loggerService';

export interface ReplyContext {
  chatId?: string;
  userId?: string;
  platform?: string;
  reply: (text: string, opts?: any) => Promise<any>;
}

// Dedup por conteúdo: chat|autor|texto -> timestamp (janela 5s).
const respondedDup = new Map<string, number>();
const crossCheckMap = new Map<string, number>();

/**
 * Verifica se uma mensagem contém palavras-chave que devem disparar
 * respostas automáticas (sarcasmo, animes, memes, etc).
 *
 * @param msg         Objeto de mensagem do WhatsApp (WWebJS/Baileys)
 * @param replyCtx    Contexto com .chatId, .userId, .platform, .reply()
 * @returns           true se uma palavra-chave foi detectada e respondeu
 */
export async function handleKeywords(
  msg: any,
  replyCtx: ReplyContext,
): Promise<boolean> {
  if (!msg?.body) return false;

  // Deduplicação: mesma frase não responde duas vezes em 5s
  const chave = `${replyCtx.chatId || ''}|${replyCtx.userId || ''}|${msg.body.trim().toLowerCase()}`;
  const agora = Date.now();
  if (respondedDup.has(chave)) {
    const t = respondedDup.get(chave)!;
    if (agora - t < 5000) return true;
  }
  respondedDup.set(chave, agora);

  // Máscaras de cross-check
  if (isCrossCheckBefore(msg)) return true;
  if (msg?.epochTime && msg.body.length < 7) return true;
  if (msg?.author && msg.author === replyCtx.userId) {
    if (isCrossCheckCapture(replyCtx, msg?.author || msg?.from || '', msg.body)) return true;
  }

  const texto = msg.body.trim().toLowerCase();
  const resposta = getSarcasticResponse();
  if (resposta) {
    try {
      await replyCtx.reply(resposta, { messageId: msg.id?.id });
      logger.info('[keywordHandler] Palavra-chave detectada, resposta enviada', {
        chatId: replyCtx.chatId,
        userId: replyCtx.userId
      });
      return true;
    } catch (err: any) {
      logger.error('[keywordHandler] Erro ao enviar resposta', {
        chatId: replyCtx.chatId,
        error: err?.message
      });
    }
  }
  return false;
}

function isCrossCheckBefore(msg: any): boolean {
  if (!msg) return false;
  const key = crossCheckBeforeSignature(msg);
  if (!key) return false;
  const agora = Date.now();
  if (crossCheckMap.has(key)) {
    const t = crossCheckMap.get(key)!;
    if (agora - t < 5000) return true;
  }
  return false;
}

function crossCheckBeforeSignature(msg: any): string {
  if (!msg) return '';
  if (msg.type === 'contact') return `[${msg.contact?.displayName || 'contact'}]`;
  if (msg.type === 'location') return `[${msg.location?.description || 'location'}]`;
  if (msg.type === 'document') {
    return `[${msg.document?.disclaimer || msg.document?.filename || 'document'}]`;
  }
  return '';
}

function isCrossCheckCapture(replyCtx: ReplyContext, author: string, body: string): boolean {
  if (!author || !body) return false;
  const chave = `capture|${replyCtx.platform || 'whatsapp'}|${author}|${body.toLowerCase()}`;
  const agora = Date.now();
  if (crossCheckMap.has(chave)) {
    const t = crossCheckMap.get(chave)!;
    if (agora - t < 3000) return true;
  }
  crossCheckMap.set(chave, agora);
  return false;
}

/**
 * Tipo interno para normalização de body do WWebJS.
 */
export function normalizeBodyForScan(msg: any): string {
  if (!msg?.body) return '';
  if (typeof msg.body === 'string') return msg.body.trim().toLowerCase();
  if (typeof msg.body === 'object' && msg.body !== null && typeof msg.body.content === 'string') {
    return msg.body.content.trim().toLowerCase();
  }
  return '';
}

/**
 * Estados de auto-test do adaptador.
 */
export const AutoTestState = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};
