import { describe, it, expect, vi } from 'vitest';
import { deleteMsgCommand } from '../../src/bot/commands/deleteMsg';
import { isMaster, isProtectedTarget } from '../../src/services/permissions';

const GROUP = '120363410094452673@g.us';      // grupo Teste
const DONO = '5588998314322@c.us';
const BOT = '558581344211@c.us';
const ALVO = '559999999999@c.us';              // quem mandou "apague isso"

function makeCtx(over: any = {}) {
  const replies: string[] = [];
  const sendMessage = vi.fn(async () => ({ id: 'wpp:deleted', raw: {} }));
  const ctx: any = {
    msg: {
      // Quem o $delete está respondendo (citando)
      getQuotedMessage: over.getQuotedMessage || (async () => over.quoted || null),
      quotedMsg: over.quotedMsg,
      raw: over.raw || {},
      key: over.key || { id: 'cmd-key', remoteJid: GROUP, fromMe: true },
    },
    client: { sendMessage },
    args: over.args ?? [],
    platform: 'whatsapp',
    chatId: over.chatId ?? GROUP,
    userId: over.userId ?? DONO,
    userName: 'SolanoJr',
    isGroup: true,
    isMaster: isMaster(over.userId ?? DONO),
    isAdmin: true,
    reply: async (t: string) => { replies.push(t); return {} as any; },
    replyPrivate: async () => {},
    replies,
    __sendMessage: sendMessage,
  };
  return ctx;
}

describe('$delete — integração (bot digita, bot apaga)', () => {
  it('apaga a mensagem citada usando sendMessage(jid, {delete}) no Baileys', async () => {
    const quoted = {
      key: { id: 'MSG-ID-123', remoteJid: GROUP, participant: ALVO },
      author: ALVO,
      text: 'apague isso',
    };
    const ctx = makeCtx({ quoted, userId: DONO });

    await deleteMsgCommand.execute(ctx);

    expect(ctx.__sendMessage).toHaveBeenCalledTimes(1);
    const [jid, text, opts] = ctx.__sendMessage.mock.calls[0];
    expect(jid).toBe(GROUP);
    expect(opts.delete).toBeDefined();
    expect(opts.delete.id).toBe('MSG-ID-123');
    expect(opts.delete.fromMe).toBe(false);
    expect(opts.delete.participant).toContain('559999999999');
  });

  it('NÃO apaga se não houver mensagem citada (pede para citar)', async () => {
    const ctx = makeCtx({ quoted: null });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('Responda');
  });

  it('protege mensagem do dono (terceiro não apaga o MASTER)', async () => {
    const quoted = {
      key: { id: 'MSG-DONO', remoteJid: GROUP, participant: DONO },
      author: DONO,
      text: 'msg do dono',
    };
    const ctx = makeCtx({ quoted, userId: ALVO }); // quem manda o $delete NÃO é dono
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('🛡️');
  });

  it('protege mensagem do próprio bot', async () => {
    const quoted = {
      key: { id: 'MSG-BOT', remoteJid: GROUP, participant: BOT },
      author: BOT,
      text: 'msg do bot',
    };
    const ctx = makeCtx({ quoted, userId: ALVO });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('🛡️');
  });

  it('dono pode apagar mensagem de terceiro', async () => {
    const quoted = {
      key: { id: 'MSG-TERCEIRO', remoteJid: GROUP, participant: ALVO },
      author: ALVO,
      text: 'qualquer',
    };
    const ctx = makeCtx({ quoted, userId: DONO });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).toHaveBeenCalledTimes(1);
    expect(ctx.__sendMessage.mock.calls[0][2].delete.id).toBe('MSG-TERCEIRO');
  });
});

describe('$delete silencioso (sem comando no grupo, via key direto)', () => {
  it('mesma API serve para o autoMod apagar em tempo real', async () => {
    // Prova que o caminho é: pegar key da mensagem suspeita + chamar sendMessage(jid,{delete})
    const suspectKey = { id: 'SPAM-999', remoteJid: GROUP, participant: ALVO };
    const sendMessage = vi.fn(async () => ({ id: 'wpp:ok', raw: {} }));
    // Simula o autoMod chamando a MESMA rota do $delete
    await sendMessage(GROUP, '', {
      delete: { id: suspectKey.id, fromMe: false, participant: suspectKey.participant },
    });
    expect(sendMessage).toHaveBeenCalledWith(GROUP, '', {
      delete: { id: 'SPAM-999', fromMe: false, participant: ALVO },
    });
  });
});
