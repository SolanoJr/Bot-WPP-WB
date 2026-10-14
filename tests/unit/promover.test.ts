import { describe, expect, it, vi } from 'vitest';
import { promoteCommand } from '../../src/bot/commands/promover';

/**
 * ctx mínimo — sem mock pesado. `promover.ts` só usa getChat(), msg.mentions,
 * client.promote e reply.
 */
function makeCtx(client: any) {
  return {
    getChat: async () => ({ isGroup: true, participants: [] }),
    msg: { mentions: [{ id: 'user-1' }] },
    client,
    reply: vi.fn(),
    groupName: 'Grupo Teste',
  } as any;
}

describe('$promover', () => {
  it('responde "não suportada" quando o adapter não implementa promote', async () => {
    const ctx = makeCtx({}); // sem promote — estado real dos 3 adapters hoje

    await promoteCommand.execute(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('não suportada'));
  });

  it('não estoura TypeError quando promote é undefined', async () => {
    const ctx = makeCtx({ promote: undefined });

    await expect(promoteCommand.execute(ctx)).resolves.toBeUndefined();
  });

  it('chama client.promote com o userId quando implementado', async () => {
    const promote = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({ promote });

    await promoteCommand.execute(ctx);

    expect(promote).toHaveBeenCalledWith('user-1');
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('promovido'));
  });

  it('não chama promote quando não há menção', async () => {
    const promote = vi.fn();
    const ctx = makeCtx({ promote });
    ctx.msg.mentions = [];

    await promoteCommand.execute(ctx);

    expect(promote).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Marque o usuário'));
  });

  it('recusa fora de grupo', async () => {
    const promote = vi.fn();
    const ctx = makeCtx({ promote });
    ctx.getChat = async () => ({ isGroup: false });

    await promoteCommand.execute(ctx);

    expect(promote).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('só funciona em grupos'));
  });
});
