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

describe('$delete — dry-run por quote', () => {
  it('registra a chave candidata e não executa exclusão', async () => {
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
    const ctx = makeCtx({ quoted, userId: DONO });

    await deleteMsgCommand.execute(ctx);

    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies).toEqual([]);
    expect(logInfoSpy).toHaveBeenCalledWith('[delete] DRY-RUN quote key capture', expect.objectContaining({
      mode: 'log-only',
      keySource: 'captured-original',
      keyComplete: true,
      stanzaId: originalKey.id,
      remoteJid: GROUP,
      participant: ALVO,
      fromMe: false,
      originalWAMessageKey: originalKey,
    }));
  });

  it('NÃO apaga se não houver mensagem citada (pede para citar)', async () => {
    const ctx = makeCtx({ quoted: null });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies.join()).toContain('Responda');
  });

  it('mantém alvo protegido em inspeção sem executar ação', async () => {
    const quoted = {
      key: { id: 'MSG-DONO', remoteJid: GROUP, participant: DONO },
      author: DONO,
      text: 'msg do dono',
    };
    const ctx = makeCtx({ quoted, userId: ALVO }); // quem manda o $delete NÃO é dono
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies).toEqual([]);
  });

  it('não executa ação contra mensagem do próprio bot', async () => {
    const quoted = {
      key: { id: 'MSG-BOT', remoteJid: GROUP, participant: BOT },
      author: BOT,
      text: 'msg do bot',
    };
    const ctx = makeCtx({ quoted, userId: ALVO });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies).toEqual([]);
  });

  it('também mantém a exclusão desativada para o dono', async () => {
    const quoted = {
      key: { id: 'MSG-TERCEIRO', remoteJid: GROUP, participant: ALVO },
      author: ALVO,
      text: 'qualquer',
    };
    const ctx = makeCtx({ quoted, userId: DONO });
    await deleteMsgCommand.execute(ctx);
    expect(ctx.__sendMessage).not.toHaveBeenCalled();
    expect(ctx.replies).toEqual([]);
  });
});
