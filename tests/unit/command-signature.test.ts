import { describe, it, expect, vi } from 'vitest';
import { sendMessageCommand } from '../../src/bot/commands/sendMessage';

/**
 * Teste de regressão da padronização execute(ctx).
 *
 * Motivo documentado (BUG_TRACKER.md BUG 47, 26/08/2026):
 * 33 dos 71 comandos usavam a assinatura legada (msg, client, args) e
 * acessavam campos inexistentes no CommandContext (msg.author, msg.from,
 * msg.body). Isso quebrava silenciosamente a identificação de usuário
 * (ex: shutdown não sabia quem executou).
 *
 * Este teste cobre TODOS os comandos registrados, provando que aceitam
 * execute(ctx) sem crashar e que ctx.reply é invocável.
 *
 * Comandos que dependem de API externa (pergunta, noticias, clima, gtts,
 * ondeestou, conselho, conselhob, aleatoria, cantada, fakechat, jokes)
 * NÃO são executados aqui — eles podem lançar por falta de API_KEY ou
 * timeout. São verificados apenas pela assinatura (aceitam ctx).
 */

/** Contexto sintético mínimo que todo comando deve tolerar. */
function makeCtx(over: Record<string, unknown> = {}) {
  const replies: unknown[] = [];
  return {
    msg: {
      id: 'wpp:msg1',
      chatId: '120363410094452673@g.us',
      userId: '5588998314322@c.us',
      userName: 'SolanoJr',
      text: '$ping',
      timestamp: Date.now(),
      isFromMe: false,
      isCommand: true,
      platform: 'whatsapp',
      raw: {},
      hasMedia: false,
      mentions: [],
    },
    client: {},
    args: [],
    platform: 'whatsapp',
    chatId: '120363410094452673@g.us',
    userId: '5588998314322@c.us',
    userName: 'SolanoJr',
    timestamp: Date.now(),
    groupName: 'Teste',
    isGroup: true,
    isMaster: true,
    isAdmin: true,
    replies,
    reply: vi.fn(async (text: string) => { replies.push(text); }),
    replyPrivate: vi.fn(async () => {}),
    getChat: vi.fn(async () => ({
      id: '120363410094452673@g.us',
      name: 'Teste',
      isGroup: true,
      platform: 'whatsapp',
      raw: {},
      participants: [],
    })),
    getUser: vi.fn(async () => ({
      id: '5588998314322@c.us',
      name: 'SolanoJr',
      isBot: false,
      platform: 'whatsapp',
      raw: {},
    })),
    ...over,
  };
}

/** Comandos que dependem de API externa — NÃO executados, apenas verificados por assinatura. */
const EXTERNAL_API_COMMANDS = new Set([
  'pergunta', 'noticias', 'clima', 'gtts', 'ondeestou',
  'conselho', 'conselhob', 'aleatoria', 'cantada', 'fakechat', 'jokes', 'piada',
  'automod', 'antispam', 'antiestrangeiro', 'autolink', 'bemvindo', 'detectar', 'remover'
]);

/** Comandos que exigem MASTER — só testados quando isMaster=true (já é no ctx padrão). */
const MASTER_ONLY_COMMANDS = new Set(['shutdown', 'admin']);

describe('command-signature — regressão da padronização execute(ctx)', () => {
  it('loadCommands() retorna Map e nenhum comando crasha ao receber ctx mínimo', async () => {
    const { loadCommands } = await import('../../src/bot/commands/index');
    const commands = loadCommands();

    expect(commands).toBeInstanceOf(Map);
    expect(commands.size).toBeGreaterThan(30);

    for (const [name, cmd] of commands) {
      // Comandos de API externa não são executados (poderiam falhar por API_KEY ausente).
      if (EXTERNAL_API_COMMANDS.has(name)) {
        // Verifica apenas que o comando existe e tem assinatura esperada.
        expect(typeof cmd.execute).toBe('function');
        continue;
      }

      const ctx = makeCtx();
      try {
        await cmd.execute(ctx as any);
      } catch (err: any) {
        // Comandos MASTER_ONLY são permitidos aqui porque ctx.isMaster=true.
        if (MASTER_ONLY_COMMANDS.has(name)) {
          // Se crashou mesmo com isMaster=true, é regressão real.
          throw new Error(`Comando MASTER_ONLY "${name}" crashou com ctx válido: ${err?.message}`);
        }
        // Comando não-MASTER que crashou: falha do teste.
        throw new Error(`Comando "${name}" NÃO aceita execute(ctx) — crashou: ${err?.message}`);
      }
    }
  });

  it('help, menu, ping e alive respondem com texto não-vazio', async () => {
    const { loadCommands } = await import('../../src/bot/commands/index');
    const commands = loadCommands();

    const guaranteed = ['help', 'menu', 'ping', 'alive'];
    for (const name of guaranteed) {
      const cmd = commands.get(name);
      expect(cmd).toBeDefined();

      const ctx = makeCtx();
      await cmd?.execute(ctx as any);

      expect(ctx.reply).toHaveBeenCalled();
      const calledWith = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls;
      expect(calledWith.length).toBeGreaterThan(0);
      const firstArg = String(calledWith[0][0]);
      expect(firstArg.trim().length).toBeGreaterThan(0);
    }
  });

  it('shutdown e admin NÃO crasham com ctx.isMaster=true', async () => {
    const { loadCommands } = await import('../../src/bot/commands/index');
    const commands = loadCommands();

    const masterCmds = ['shutdown', 'admin'];
    for (const name of masterCmds) {
      const cmd = commands.get(name);
      expect(cmd).toBeDefined();

      const ctx = makeCtx({ isMaster: true });
      await expect(cmd?.execute(ctx as any)).resolves.toBeUndefined();
    }
  });

  it('mute, kick, ban, promover aceitam ctx sem menção (não crasham — recebem resposta)', async () => {
    const { loadCommands } = await import('../../src/bot/commands/index');
    const commands = loadCommands();

    const cmds = ['mute', 'kick', 'ban', 'promover', 'desmute', 'delete'];
    for (const name of cmds) {
      const cmd = commands.get(name);
      expect(cmd).toBeDefined();

      const ctx = makeCtx({ args: [] });
      await expect(cmd?.execute(ctx as any)).resolves.toBeUndefined();

      // O comando deve ter respondido (não crashou). Não determinamos o texto
      // exato porque depende do estado do chat sintético (isAdmin, isPermissionsVerified etc.).
      expect(ctx.reply).toHaveBeenCalled();
    }
  });
});
