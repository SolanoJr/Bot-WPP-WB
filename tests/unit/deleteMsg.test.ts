import { beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readCaptures: vi.fn(() => [] as any[]),
}));

vi.mock('../../src/services/captureStore', () => ({ readCaptures: mocks.readCaptures }));

import { deleteMsgCommand } from '../../src/bot/commands/deleteMsg';
import { isMaster } from '../../src/services/permissions';
import * as loggerService from '../../src/services/loggerService';
const logInfoSpy = vi.spyOn(loggerService, 'logInfo');

const GROUP = '120363410094452673@g.us';      // grupo Teste
const DONO = '5588998314322@c.us';
const BOT = '558581344211@c.us';
const ALVO = '559999999999@c.us';              // quem mandou "apague isso"

beforeEach(() => {
  mocks.readCaptures.mockReset().mockReturnValue([]);
  logInfoSpy.mockClear();
});

function makeCtx(over: any = {}) {
  const replies: string[] = [];
  const sendMessage = vi.fn(async () => ({ id: 'wpp:deleted', raw: {} }));
  const userId = over.userId ?? DONO;
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
    userId,
    userName: 'SolanoJr',
    isGroup: true,
    isMaster: over.isMaster ?? isMaster(userId),
    isAdmin: over.isAdmin ?? false,
    reply: async (t: string) => { replies.push(t); return {} as any; },
    replyPrivate: async () => {},
    replies,
    __sendMessage: sendMessage,
  };
  return ctx;
}

describe('$delete — exclusão autorizada por quote', () => {
  it('dono envia ao sender a WAMessageKey original capturada', async () => {
    const quoted = {
      key: { id: 'MSG-ID-123', remoteJid: GROUP, participant: ALVO },
      author: ALVO,
      text: 'apague isso',
    };
    const originalKey = {
      id: 'MSG-ID-123', remoteJid: GROUP, fromMe: false, participant: ALVO,
      participantAlt: '559999999999@s.whatsapp.net', addressingMode: 'lid',
    };
    mocks.readCaptures.mockReturnValue([{
      source: 'messages.upsert', messageId: originalKey.id, remoteJid: GROUP, key: originalKey,
    }]);
    const ctx = makeCtx({
      quoted,
      userId: DONO,
      raw: { key: { id: 'command', remoteJid: GROUP }, message: { extendedTextMessage: { contextInfo: { stanzaId: originalKey.id, participant: ALVO } } } },
    });

    await deleteMsgCommand.execute(ctx);

    expect(ctx.__sendMessage).toHaveBeenCalledWith(GROUP, '', { delete: originalKey });
    expect(ctx.replies).toEqual([]);
    expect(logInfoSpy).toHaveBeenCalledWith('[delete] mensagem removida', expect.objectContaining({
      stanzaId: originalKey.id,
      originalWAMessageKey: originalKey,
    }));
  });

  it('admin do grupo pode apagar mensagem de usuário comum', async () => {
    const targetKey = { id: 'MSG-ADMIN-1', remoteJid: GROUP, fromMe: false, participant: ALVO };
    mocks.readCaptures.mockReturnValue([{ source: 'messages.upsert', messageId: targetKey.id, remoteJid: GROUP, key: targetKey }]);
    const ctx = makeCtx({
      userId: ALVO,
      isAdmin: true,
      raw: { key: { remoteJid: GROUP }, message: { extendedTextMessage: { contextInfo: { stanzaId: targetKey.id } } } },
    });

    await deleteMsgCommand.execute(ctx);

    expect(ctx.__sendMessage).toHaveBeenCalledWith(GROUP, '', { delete: targetKey });
  });

  it('nega execução para usuário sem papel de dono ou admin', async () => {
    const ctx = makeCtx({ userId: ALVO, isAdmin: false });
    await deleteMsgCommand.execute(ctx);
    expect(mocks.readCaptures).not.toHaveBeenCalled();
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('dono ou por um admin');
  });

  it('NÃO apaga se não houver mensagem citada (pede para citar)', async () => {
    const ctx = makeCtx({ quoted: null });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('Responda');
  });

  it('admin não pode apagar mensagem de alvo protegido', async () => {
    const quoted = {
      key: { id: 'MSG-DONO', remoteJid: GROUP, participant: DONO },
      author: DONO,
      text: 'msg do dono',
    };
    mocks.readCaptures.mockReturnValue([{ source: 'messages.upsert', messageId: 'MSG-DONO', remoteJid: GROUP, key: { id: 'MSG-DONO', remoteJid: GROUP, fromMe: false, participant: DONO } }]);
    const ctx = makeCtx({ quoted, userId: ALVO, isAdmin: true, raw: { key: { remoteJid: GROUP }, message: { extendedTextMessage: { contextInfo: { stanzaId: 'MSG-DONO' } } } } });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('dono ou do próprio bot');
  });

  it('não executa ação contra mensagem do próprio bot', async () => {
    const quoted = {
      key: { id: 'MSG-BOT', remoteJid: GROUP, participant: BOT },
      author: BOT,
      text: 'msg do bot',
    };
    const ctx = makeCtx({ quoted, userId: ALVO, isAdmin: true, raw: { key: { remoteJid: GROUP }, message: { extendedTextMessage: { contextInfo: { stanzaId: 'MSG-BOT' } } } } });
    mocks.readCaptures.mockReturnValue([{ source: 'messages.upsert', messageId: 'MSG-BOT', remoteJid: GROUP, key: { id: 'MSG-BOT', remoteJid: GROUP, fromMe: true } }]);
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('dono ou do próprio bot');
  });

  it('não usa id solto quando não há captura original exata', async () => {
    const quoted = {
      key: { id: 'MSG-TERCEIRO', remoteJid: GROUP, participant: ALVO },
      author: ALVO,
      text: 'qualquer',
    };
    const ctx = makeCtx({ quoted, userId: DONO, raw: { key: { remoteJid: GROUP }, message: { extendedTextMessage: { contextInfo: { stanzaId: 'MSG-TERCEIRO' } } } } });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('captura original');
  });
});
