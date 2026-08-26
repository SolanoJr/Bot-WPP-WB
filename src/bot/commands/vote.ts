import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { addVote, delVote, registrarVoto } from './voteSystem';

export const voteCommand: ICommand = {
  name: 'votar',
  description: 'Inicia uma votação. Uso: $votar <id> <motivo> <valor> <duracaoSeg>',
  async execute(ctx: CommandContext) {
    const [id, motivo, valor, duracao] = ctx.args;
    if (!id || !motivo || !valor || !duracao) {
      await ctx.reply('Uso: $votar <id> <motivo> <valor> <duracaoSeg>');
      return;
    }
    const duracaoSeg = parseInt(duracao, 10);
    if (isNaN(duracaoSeg)) {
      await ctx.reply('⚠️ Duração deve ser um número (segundos).');
      return;
    }
    await addVote(id, motivo, valor, duracaoSeg, async (replyMsg: string) => {
      await ctx.reply(replyMsg);
    });
  },
};

export const delVoteCommand: ICommand = {
  name: 'delvoto',
  description: 'Remove uma votação existente. Uso: $delvoto <id>',
  async execute(ctx: CommandContext) {
    const [id] = ctx.args;
    if (!id) {
      await ctx.reply('Uso: $delvoto <id>');
      return;
    }
    try {
      await delVote(id);
      await ctx.reply(`✅ Votação ${id} removida.`);
    } catch (e) {
      await ctx.reply('⚠️ Erro ao remover votação.');
    }
  },
};

// Comando para votar
export const votoCommand: ICommand = {
  name: 'voto',
  description: 'Vota em uma votação ativa. Uso: $voto <id> sim/não',
  async execute(ctx: CommandContext) {
    const [id, voto] = ctx.args;
    if (!id || !voto) {
      await ctx.reply('Uso: $voto <id> sim/não');
      return;
    }
    const votoLower = voto.toLowerCase();
    if (votoLower !== 'sim' && votoLower !== 'não' && votoLower !== 'nao') {
      await ctx.reply('⚠️ Voto deve ser "sim" ou "não".');
      return;
    }
    const votoNormalizado = votoLower === 'nao' ? 'não' : votoLower;
    await registrarVoto(id, ctx.userId || ctx.chatId || 'unknown', (votoLower === 'não' ? 'nao' : votoLower) as 'sim' | 'nao', async (replyMsg: string) => {
      await ctx.reply(replyMsg);
    });
  },
};
