import { describe, expect, it, vi } from 'vitest';
import { loadCommands } from '../../src/bot/commands/index';

function makeCtx(overrides: any = {}) {
  const client = {
    userId: 'wpp:558581344211@c.us',
    removeParticipant: vi.fn().mockResolvedValue(undefined),
    banParticipant: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
  const reply = vi.fn().mockResolvedValue(undefined);
  return {
    msg: { mentions: [], replyToMessageId: undefined, raw: {} },
    client,
    args: [],
    platform: 'whatsapp',
    chatId: 'wpp:558581344211-123456@g.us',
    userId: 'wpp:558899834322@c.us',
    userName: 'Solano',
    isGroup: true,
    isMaster: false,
    isAdmin: false,
    reply,
    replyPrivate: vi.fn(),
    getChat: vi.fn().mockResolvedValue({
      isGroup: true,
      participants: [
        { id: 'wpp:558581344211@c.us', isAdmin: true, isSuperAdmin: false },
        { id: 'wpp:558899834322@c.us', isAdmin: true, isSuperAdmin: false },
        { id: 'wpp:559999999999@c.us', isAdmin: false, isSuperAdmin: false },
      ],
    }),
    getUser: vi.fn(),
    ...overrides,
  };
}

describe('comandos de grupo (multiplataforma)', () => {
  it('$kick usa client.removeParticipant (nao API crua do whatsapp-web.js)', async () => {
    const commands = loadCommands();
    const ctx = makeCtx({
      msg: { mentions: [{ id: 'wpp:559999999999@c.us' }], raw: {} },
    });
    await commands.get('kick')?.execute(ctx as any);
    expect(ctx.client.removeParticipant).toHaveBeenCalledWith(
      'wpp:558581344211-123456@g.us',
      'wpp:559999999999@c.us'
    );
  });

  it('$ban usa client.banParticipant', async () => {
    const commands = loadCommands();
    const ctx = makeCtx({
      msg: { mentions: [{ id: 'wpp:559999999999@c.us' }], raw: {} },
    });
    await commands.get('ban')?.execute(ctx as any);
    expect(ctx.client.banParticipant).toHaveBeenCalledWith(
      'wpp:558581344211-123456@g.us',
      'wpp:559999999999@c.us'
    );
  });

  it('$kick bloqueia nao-admin', async () => {
    const commands = loadCommands();
    const ctx = makeCtx({
      userId: 'wpp:550000000000@c.us',
      msg: { mentions: [{ id: 'wpp:559999999999@c.us' }], raw: {} },
      getChat: vi.fn().mockResolvedValue({
        isGroup: true,
        participants: [
          { id: 'wpp:558581344211@c.us', isAdmin: true },
          { id: 'wpp:550000000000@c.us', isAdmin: false },
        ],
      }),
    });
    await commands.get('kick')?.execute(ctx as any);
    expect(ctx.client.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('permissão'));
  });
});
