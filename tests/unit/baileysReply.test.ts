import { describe, it, expect, vi } from 'vitest';
import { BaileysAdapter, normId, toJid } from '../../src/platforms/whatsapp/BaileysAdapter';
import { PlatformMessage, SendOptions } from '../../src/platforms/base/PlatformTypes';

/**
 * Teste da linha de REPLY no Baileys (engine ativo do WhatsApp).
 *
 * O que este teste valida:
 * 1. Quando ctx.reply(text) é chamado, o sendMessage interno do Baileys
 *    recebe replyToMessageId preenchido (a mensagem de comando é citada).
 * 2. As opções de citação (quotedFromMe, quotedParticipant, quotedText)
 *    chegam corretas no sendMessage.
 * 3. Quando quotedText não vem (mensagem própria do bot), o Baileys
 *    tenta recuperar do store local (fallback) e ainda assim monta o quoted.
 * 4. O campo quoted.key montado tem as propriedades mínimas: id, remoteJid,
 *    fromMe, participant.
 *
 * Este teste NÃO conecta no WhatsApp — usa mock do store interno do Baileys
 * e do sock.sendMessage para validar a lógica de montagem da citação.
 */

function makeBaileysAdapter() {
  const adapter = new BaileysAdapter({ authDir: './.test_auth' });
  const calls: Array<{ chatId: string; text: string; options?: SendOptions; ret?: PlatformMessage }> = [];

  // Injeta um sock mockável sem conectar.
  (adapter as any).sock = {
    store: {
      messages: {},
    },
    sendMessage: vi.fn(async (jid: string, msg: any) => {
      calls.push({ chatId: jid, text: msg.text || '', options: msg.quoted ? undefined : undefined, ret: undefined });
      return {
          key: { id: 'sent:' + Date.now(), remoteJid: jid, fromMe: true, participant: undefined },
          id: 'sent:' + Date.now(),
          mediaKey: undefined,
          participant: undefined,
          fromMe: true,
        } as any;
    }),
  };

  // Sobrescreve userId para os testes.
  adapter['userId'] = '558581344211@s.whatsapp.net';

  return { adapter, calls };
}

function makeQuotedMessage() {
  return {
    key: { id: 'original:123', remoteJid: '120363410094452673@g.us', fromMe: false, participant: '6289562706508@s.whatsapp.net' },
    message: {
      extendedTextMessage: { text: 'mensagem original citada' },
    },
    ...({} as any),
  };
}

describe('BaileysAdapter — linha de reply (citação de mensagem)', () => {
  it('sendMessage com replyToMessageId monta quoted corretamente (citação de msg de terceiro)', async () => {
    const { adapter, calls } = makeBaileysAdapter();
    const { sendMessage } = adapter as any;

    const chatId = '120363410094452673@g.us';
    const text = 'resposta citando';
    const options: SendOptions = {
      replyToMessageId: 'original:123',
      quotedFromMe: false,
      quotedParticipant: '6289562706508@s.whatsapp.net',
      quotedText: 'mensagem original citada',
    };

    const result = await sendMessage.call(adapter, chatId, text, options);

    expect(calls.length).toBe(1);
    const sent = calls[0];
    expect(sent.chatId).toBe(chatId);

    // O sendMessage do Baileys deve ter recebido options.replyToMessageId e montado quoted.
    // Como inspecionar o que foi passado ao sock.sendMessage em resolvedMessage?
    // Nossa implementação dentro do sendMessage() do adapter cria msgOpts.quoted antes de chamar sock.sendMessage.
    // Para verificar o quoted montado, interceptamos o que foi enviado ao sock.
    // O mock sock.sendMessage recebe o msg completo; verificamos via acesso direto ao mock.
    const mockSend = (adapter as any).sock.sendMessage as ReturnType<typeof vi.fn>;
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [jidArg, msgArg] = mockSend.mock.calls[0];
    expect(jidArg).toBe(chatId);
    expect(msgArg).toBeDefined();

    // Verifica que msgArg.quoted existe e tem as propriedades mínimas.
    const quoted = msgArg.quoted as any;
    expect(quoted).toBeDefined();
    expect(quoted.key).toBeDefined();
    // O código extrai quotedId via options.replyToMessageId.split(':').pop() → '123'.
    expect(quoted.key.id).toBe('123');
    expect(quoted.key.remoteJid).toBe(chatId);
    expect(quoted.key.fromMe).toBe(false);
    expect(quoted.key.participant).toBe('6289562706508@s.whatsapp.net');
    expect(quoted.message).toBeDefined();
    expect(String(quoted.message.conversation || quoted.message.extendedTextMessage?.text || '').trim()).toBe('mensagem original citada');
  });

  it('sendMessage com replyToMessageId e quotedText vazio cai no fallback do store (msg própria do bot)', async () => {
    const { adapter, calls } = makeBaileysAdapter();

    // Preenche o store com a mensagem original (para o fallback encontrar).
    // O código extrai quotedId via options.replyToMessageId.split(':').pop() → '123'.
    // Indexamos a store pelo ID puro '123' para o fallback encontrar.
    const storeMessages = new Map();
    storeMessages.set('123', {
      message: {
        extendedTextMessage: { text: 'mensagem do próprio bot (sem quotedText)' },
      },
    });
    (adapter as any).sock.store = { messages: { '120363410094452673@g.us': storeMessages } };

    const chatId = '120363410094452673@g.us';
    const text = 'resposta';
    const options: SendOptions = {
      replyToMessageId: 'original:123',
      quotedFromMe: true,
      // quotedText omitido (cenário real de mensagem própria do bot).
    };

    const mockSend = (adapter as any).sock.sendMessage as ReturnType<typeof vi.fn>;
    await (adapter as any).sendMessage(chatId, text, options);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [jidArg, msgArg] = mockSend.mock.calls[0];
    const quoted = (msgArg as any).quoted as any;
    expect(quoted).toBeDefined();
    expect(quoted.key.fromMe).toBe(true);
    // O quotedText deve ter sido recuperado do store pelo fallback.
    const quotedText = quoted.message?.conversation || quoted.message?.extendedTextMessage?.text || '';
    expect(quotedText.trim()).toBe('mensagem do próprio bot (sem quotedText)');
  });

  it('sendMessage SEM replyToMessageId envia sem quoted (resposta solta)', async () => {
    const { adapter, calls } = makeBaileysAdapter();
    const chatId = '120363410094452673@g.us';
    const text = 'resposta solta';

    const mockSend = (adapter as any).sock.sendMessage as ReturnType<typeof vi.fn>;
    await (adapter as any).sendMessage(chatId, text, {});

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [jidArg, msgArg] = mockSend.mock.calls[0];
    const quoted = (msgArg as any).quoted;
    expect(quoted).toBeUndefined();
    expect(msgArg.text).toBe(text);
  });

  it('toJid preserva @g.us e @lid, converte @c.us -> @s.whatsapp.net', () => {
    // toJid é função pura exportada; testa diretamente.
    expect(toJid('120363410094452673@g.us')).toBe('120363410094452673@g.us');
    expect(toJid('6289562706508@lid')).toBe('6289562706508@lid');
    expect(toJid('558581344211@c.us')).toBe('558581344211@s.whatsapp.net');
    expect(toJid('5588998314322@c.us')).toBe('5588998314322@s.whatsapp.net');
  });

  it('normId remove sufixo de device mas preserva domínio (@lid/@c.us/@g.us)', () => {
    // normId é função pura exportada; testa diretamente.
    expect(normId('2592935567439:60@lid')).toBe('2592935567439@lid');
    // Domínio interno do Baileys (@s.whatsapp.net) é convertido para @c.us — regra v1.3.0.
    expect(normId('558581344211:60@s.whatsapp.net')).toBe('558581344211@c.us');
    expect(normId('120363410094452673@g.us')).toBe('120363410094452673@g.us');
    expect(normId('558581344211@c.us')).toBe('558581344211@c.us');
    expect(normId('')).toBe('');
  });

  it('quoted.key.fromMe deve refletir a msg ORIGINAL, não o bot (regra anti-citação "sumida")', async () => {
    const { adapter } = makeBaileysAdapter();
    const chatId = '120363410094452673@g.us';
    const mockSend = (adapter as any).sock.sendMessage as ReturnType<typeof vi.fn>;

    // Cenário: bot responde a mensagem de TERCEIRO.
    await (adapter as any).sendMessage(chatId, 'resposta', {
      replyToMessageId: 'original:123',
      quotedFromMe: false,
      quotedParticipant: '6289562706508@s.whatsapp.net',
      quotedText: 'msg de terceiro',
    });

    const [, msgArg] = mockSend.mock.calls[0];
    const quoted = (msgArg as any).quoted as any;
    expect(quoted.key.fromMe).toBe(false);
    expect(quoted.key.participant).toBe('6289562706508@s.whatsapp.net');
  });
});
