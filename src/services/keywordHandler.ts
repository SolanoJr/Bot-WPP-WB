import { getSarcasticResponse } from './aiService';

/**
 * Processa mensagens em busca de palavras-chave ou tentativas de trollagem
 * @param msg - Objeto de mensagem do WWebJS
 * @param client - Instância do client WWebJS
 * @returns Retorna true se processou algo que deve interromper o fluxo
 */
export async function handleKeywords(msg: any, client: any): Promise<boolean> {
  const body = (msg?.body || '').toLowerCase();

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
    const botNumber = '558581344211';
    const mentionedBot = Array.isArray(msg?.mentionedIds)
      ? msg.mentionedIds.some((id: string) => String(id).replace('@c.us', '').replace('@lid', '').includes(botNumber))
      : false;
    const isReply = Boolean(msg?.hasQuotedMsg || msg?.type === 'reply' || msg?._data?.isQuotedMessage);
    const quotedAuthor = String(msg?.quotedMsg?.author || msg?.quotedMsg?.participant || msg?._data?.quotedMsg?.author || '');
    const repliedToBot = isReply && (msg?.quotedMsg?.fromMe === true || quotedAuthor.includes(botNumber) || quotedAuthor.includes('558581344211'));
    const botWord = /\bbot\b/i.test(body);

    console.log(`[KW2] isReply=${isReply} fromMe=${msg?.quotedMsg?.fromMe} repliedToBot=${repliedToBot} botWord=${botWord} mentionedBot=${mentionedBot}`);

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
