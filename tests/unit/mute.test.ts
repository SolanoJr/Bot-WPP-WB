import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/loggerService', () => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
}));

const CHAT = 'wpp:120363410094452673@g.us';
const USER = '5511999999999@c.us';

function makeCtx() {
  return {
    chatId: CHAT,
    groupName: 'Teste',
    args: [],
    msg: { mentions: [{ id: USER }] },
    getChat: vi.fn(async () => ({ isGroup: true })),
    reply: vi.fn(),
  } as any;
}

async function load() {
  vi.resetModules();
  return await import('../../src/bot/commands/mute');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('muteCommand', () => {
  it('reply diz "10 minutos" (não "8 horas")', async () => {
    const { muteCommand } = await load();
    const ctx = makeCtx();
    await muteCommand.execute(ctx);
    const reply = ctx.reply.mock.calls[0][0];
    expect(reply).toContain('10 minutos');
    expect(reply).not.toContain('8 horas');
  });
});

describe('handleMutedMessage', () => {
  it('com mute ativo → true, chama sendDelete com (chatId, originalKey)', async () => {
    const { muteCommand, handleMutedMessage } = await load();
    const ctx = makeCtx();
    await muteCommand.execute(ctx);

    const sendDelete = vi.fn(async () => {});
    const r = await handleMutedMessage({
      chatId: CHAT,
      userId: USER,
      originalKey: { id: 'msg-1' },
      sendDelete,
    });
    expect(r).toBe(true);
    expect(sendDelete).toHaveBeenCalledWith(CHAT, { id: 'msg-1' });
  });

  it('sem mute ativo → false, NÃO chama sendDelete', async () => {
    const { handleMutedMessage } = await load();
    const sendDelete = vi.fn(async () => {});
    const r = await handleMutedMessage({
      chatId: CHAT,
      userId: USER,
      originalKey: { id: 'msg-1' },
      sendDelete,
    });
    expect(r).toBe(false);
    expect(sendDelete).not.toHaveBeenCalled();
  });
});
