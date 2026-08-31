import { describe, it, expect, beforeEach, vi } from 'vitest';
import { muteCommand, handleMutedMessage, unmuteUser } from '../../src/bot/commands/mute';
import { normalizeTargetId, resolveTargetId, getMentionedIds } from '../../src/bot/commands/targetResolver';

const GROUP = '120363410094452673@g.us';
const ALVO_LID = '6289562706508@lid';

function makeCtx(over: any = {}) {
  const replies: string[] = [];
  const ctx: any = {
    msg: { mentions: [], raw: {}, ...(over.msg || {}) },
    client: {},
    args: over.args ?? [],
    platform: 'whatsapp',
    chatId: over.chatId ?? GROUP,
    userId: over.userId ?? '5588998314322@c.us',
    userName: 'SolanoJr',
    isGroup: over.isGroup ?? true,
    isMaster: true,
    isAdmin: true,
    replies,
    reply: async (t: string) => { replies.push(t); return {} as any; },
    replyPrivate: async () => {},
    getChat: async () => ({ id: GROUP, name: 'Teste', isGroup: over.isGroup ?? true, platform: 'whatsapp', raw: {}, participants: [] }),
    getUser: async () => ({ id: ctx.userId, name: 'SolanoJr', isBot: false, platform: 'whatsapp', raw: {} }),
  };
  return ctx;
}

describe('normalizeTargetId — @lid NUNCA vira @c.us', () => {
  it('preserva o domínio @lid', () => {
    expect(normalizeTargetId('6289562706508@lid')).toBe('6289562706508@lid');
  });

  it('remove sufixo de device mas mantém o domínio', () => {
    expect(normalizeTargetId('2592935567439:60@lid')).toBe('2592935567439@lid');
    expect(normalizeTargetId('558581344211:60@s.whatsapp.net')).toBe('558581344211@s.whatsapp.net');
  });

  it('remove prefixo de plataforma', () => {
    expect(normalizeTargetId('wpp:5588998314322@c.us')).toBe('5588998314322@c.us');
  });

  it('é idempotente', () => {
    const once = normalizeTargetId('wpp:6289562706508:12@lid');
    expect(normalizeTargetId(once)).toBe(once);
  });
});

describe('getMentionedIds — lê todas as fontes de menção', () => {
  it('lê de ctx.msg.mentions (contrato oficial)', () => {
    const ctx = makeCtx({ msg: { mentions: [{ id: ALVO_LID }] } });
    expect(getMentionedIds(ctx)).toEqual([ALVO_LID]);
  });

  it('lê de raw.mentionedIds (WWebJS)', () => {
    const ctx = makeCtx({ msg: { mentions: [], raw: { mentionedIds: [ALVO_LID] } } });
    expect(getMentionedIds(ctx)).toEqual([ALVO_LID]);
  });

  it('lê de contextInfo.mentionedJid (Baileys)', () => {
    const ctx = makeCtx({
      msg: { mentions: [], raw: { message: { extendedTextMessage: { contextInfo: { mentionedJid: [ALVO_LID] } } } } },
    });
    expect(getMentionedIds(ctx)).toEqual([ALVO_LID]);
  });

  it('cai para o autor da mensagem citada quando não há menção', () => {
    const ctx = makeCtx({ msg: { mentions: [], raw: { quotedParticipant: ALVO_LID } } });
    expect(resolveTargetId(ctx)).toBe(ALVO_LID);
  });

  it('devolve vazio quando não há alvo algum', () => {
    expect(resolveTargetId(makeCtx())).toBe('');
  });
});

describe('$mute — ciclo completo mute -> handler apaga -> desmute', () => {
  beforeEach(() => { unmuteUser(GROUP, ALVO_LID); });

  it('grava o mute e o handler encontra a MESMA chave (bug do @lid)', async () => {
    const ctx = makeCtx({ msg: { mentions: [{ id: ALVO_LID }] } });
    await muteCommand.execute(ctx);
    expect(ctx.replies.join()).toContain('silenciado');

    // O handler recebe o ID no formato original @lid; antes a chave era gravada
    // com @c.us e este lookup falhava (mute "funcionava" sem apagar nada).
    const del = vi.fn().mockResolvedValue(undefined);
    const apagou = await handleMutedMessage({
      chatId: GROUP,
      userId: ALVO_LID,
      raw: { delete: del },
    });
    expect(apagou).toBe(true);
    expect(del).toHaveBeenCalledWith(true);
  });

  it('não apaga mensagem de quem não está mutado', async () => {
    const del = vi.fn();
    const apagou = await handleMutedMessage({
      chatId: GROUP,
      userId: '559999999999@c.us',
      raw: { delete: del },
    });
    expect(apagou).toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it('$mute off desmuta e o handler volta a liberar', async () => {
    const ctx = makeCtx({ msg: { mentions: [{ id: ALVO_LID }] } });
    await muteCommand.execute(ctx);

    const off = makeCtx({ args: ['off'], msg: { mentions: [{ id: ALVO_LID }] } });
    await muteCommand.execute(off);
    expect(off.replies.join()).toContain('desmutado');

    const del = vi.fn();
    expect(await handleMutedMessage({ chatId: GROUP, userId: ALVO_LID, raw: { delete: del } })).toBe(false);
  });

  it('reclama quando não há alvo marcado', async () => {
    const ctx = makeCtx();
    await muteCommand.execute(ctx);
    expect(ctx.replies.join()).toContain('Marque o usuário');
  });
});

describe('$mute — proteção do MASTER e do bot', () => {
  it('recusa silenciar o dono', async () => {
    const ctx = makeCtx({ msg: { mentions: [{ id: '5588998314322@c.us' }] } });
    await muteCommand.execute(ctx);
    expect(ctx.replies.join()).toContain('🛡️');
  });

  it('recusa silenciar o próprio bot (telefone e LID)', async () => {
    for (const id of ['558581344211@c.us', '2592935567439@lid']) {
      const ctx = makeCtx({ msg: { mentions: [{ id }] } });
      await muteCommand.execute(ctx);
      expect(ctx.replies.join()).toContain('🛡️');
    }
  });

  it('recusa fora de grupo', async () => {
    const ctx = makeCtx({ isGroup: false, msg: { mentions: [{ id: ALVO_LID }] } });
    await muteCommand.execute(ctx);
    expect(ctx.replies.join()).toContain('só funciona em grupos');
  });
});
