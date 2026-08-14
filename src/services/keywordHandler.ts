import { getSarcasticResponse } from './aiService';

// Dedup: não responde 2x a mesma mensagem (WWebJS pode emitir message + message_create).
const respondedIds = new Set<string>();

/**
 * Processa mensagens em busca de palavras-chave ou tentativas de trollagem
 * @param msg - Objeto de mensagem do WWebJS
 * @param client - Instância do client WWebJS
 * @returns Retorna true se processou algo que deve interromper o fluxo
 */
export async function handleKeywords(msg: any, client: any): Promise<boolean> {
  const body = (msg?.body || '').toLowerCase();
  const mid = msg?.id?._serialized || msg?.id?.id;

  // Dedup: se já respondemos a esta mensagem, não responde de novo.
  if (mid && respondedIds.has(mid)) return false;
  if (mid) respondedIds.add(mid);

  // 1. Detecção de Trollagem (Falso Banimento/Saída)
  const trollPatterns = [
    "removeu você",
    "saiu do grupo",
    "adicionou você",
    "foi banido"
  ];

  if (trollPatterns.some(pattern => body.includes(pattern))) {
    await msg.delete(true);
    await msg.reply("Tentativa de zoeira detectada. Hoje não, amigão. 😂");
    console.log(`🛡️ [MODERATION] Troll detectado de ${msg.author || msg.from}: ${body}`);
    return true;
  }

  // 2. Trigger Sarcástico: menção ao bot, resposta ao bot, ou palavra "bot"
  const isCommand = (msg?.body || '').startsWith('$');
  if (!isCommand) {
    // O bot no Linux tem dois IDs possíveis: número real e LID (usado em menções/reply).
    const botNumbers = ['558581344211', '2592935567439'];
    const mentionedBot = Array.isArray(msg?.mentionedIds)
      ? msg.mentionedIds.some((id: string) => {
          const clean = String(id).replace('@c.us', '').replace('@lid', '');
          return botNumbers.some((bn) => clean.includes(bn));
        })
      : false;

    // Reply em mensagem do bot: WWebJS pode não popular quotedMsg.author; buscamos a msg citada.
    const isReply = Boolean(msg?.hasQuotedMsg || msg?.type === 'reply' || msg?._data?.isQuotedMessage);
    let repliedToBot = false;
    if (isReply) {
      // Tenta o quotedMsg já disponível
      const q = msg?.quotedMsg;
      const qAuthor = String(q?.author || q?.participant || msg?._data?.quotedMsg?.author || msg?._data?.quotedMsg?.participant || '');
      const qFromMe = q?.fromMe === true || msg?._data?.quotedMsg?.fromMe === true;
      if (qFromMe || botNumbers.some((bn) => qAuthor.includes(bn))) {
        repliedToBot = true;
      } else {
        // Fallback: busca a mensagem citada de forma assíncrona (WWebJS popula sob demanda)
        try {
          const quoted = await msg.getQuotedMessage?.();
          if (quoted) {
            const qa = String(quoted.author || quoted.participant || '');
            if (quoted.fromMe === true || botNumbers.some((bn) => qa.includes(bn))) {
              repliedToBot = true;
            }
          }
        } catch { /* ignora */ }
      }
    }

    const botWord = /\bbot\b/i.test(body);

    if (mentionedBot || repliedToBot || botWord) {
      // Responde CITANDO a mensagem original (reply/quote).
      // WWebJS moderno não cita @lid -> só cita se o ID for @c.us.
      const qid = msg?.id?._serialized;
      const quotedId = qid && !qid.includes('@lid') ? qid : undefined;
      try {
        await msg.reply(getSarcasticResponse(), quotedId ? { quotedMessageId: quotedId } : undefined);
      } catch {
        await msg.reply(getSarcasticResponse());
      }
      return true;
    }
  }

  return false;
}
