/**
 * $promover — correção de 25/out (auditoria): comando era QUEBRADO em
 * produção. A interface antiga promote(userId) não tinha chatId e nenhum
 * adapter a implementava, então até no WhatsApp o comando respondia
 * "❌ Promoção não suportada nesta plataforma". A partir da correção,
 * PlatformClient.promoteParticipant?(chatId, userId) é implementada pelo
 * BaileysAdapter (groupParticipantsUpdate 'promote') e o comando passa
 * o chat do grupo.
 *
 * Aqui se prova o contrato do comando nos três caminhos:
 *   - plataforma sem promoteParticipant → mensagem honesta, sem crash;
 *   - com promoteParticipant → chama (chatId, userId) e confirma;
 *   - adapter recusa (status != 200 do WhatsApp) → mensagem de erro.
 */
import { describe, expect, it, vi } from 'vitest';
import { promoteCommand } from '../../src/bot/commands/promover';

function makeCtx(client: any, overrides: Record<string, any> = {}) {
  return {
    getChat: async () => ({ isGroup: true, id: '120363410094452673@g.us' }),
    reply: vi.fn(),
    msg: { mentions: [{ id: '558899855554@s.whatsapp.net' }] },
    client,
    groupName: 'Grupo Teste',
    ...overrides,
  } as any;
}

describe('$promover — comando corrigido (25/out)', () => {
  it('sem promoteParticipant responde "não suportado" (plataforma sem moderação)', async () => {
    const ctx = makeCtx({});
    await promoteCommand.execute(ctx);
    expect(ctx.reply).toHaveBeenCalledWith('❌ Promoção não suportada nesta plataforma.');
  });

  it('com promoteParticipant chama (chatId, userId) — assinatura de grupo — e confirma', async () => {
    const promoteParticipant = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({ promoteParticipant });
    await promoteCommand.execute(ctx);
    expect(promoteParticipant).toHaveBeenCalledTimes(1);
    expect(promoteParticipant).toHaveBeenCalledWith(
      '120363410094452673@g.us',
      '558899855554@s.whatsapp.net',
    );
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('✅ Usuário promovido a administrador.');
  });

  it('adapter recusa (WhatsApp devolve status de erro) → mensagem de erro, sem throw', async () => {
    const promoteParticipant = vi.fn().mockRejectedValue(
      new Error('groupParticipantsUpdate respondeu 403'),
    );
    const ctx = makeCtx({ promoteParticipant });
    await promoteCommand.execute(ctx);
    const text = ctx.reply.mock.calls[0][0] as string;
    expect(text).toContain('❌ Não consegui promover');
    expect(text).toContain('403');
  });

  it('fora de grupo recusa antes de tocar no client', async () => {
    const promoteParticipant = vi.fn();
    const ctx = makeCtx({ promoteParticipant }, {
      getChat: async () => ({ isGroup: false, id: '558899855554@c.us' }),
    });
    await promoteCommand.execute(ctx);
    expect(ctx.reply).toHaveBeenCalledWith('❌ Este comando só funciona em grupos.');
    expect(promoteParticipant).not.toHaveBeenCalled();
  });

  it('sem menção recusa antes de tocar no client', async () => {
    const promoteParticipant = vi.fn();
    const ctx = makeCtx({ promoteParticipant }, { msg: { mentions: [] } });
    await promoteCommand.execute(ctx);
    expect(ctx.reply).toHaveBeenCalledWith('❌ Marque o usuário a ser promovido.');
    expect(promoteParticipant).not.toHaveBeenCalled();
  });
});
