import { ICommand } from './types';
import { addVote, delVote, registrarVoto } from './voteSystem';

export const voteCommand: ICommand = {
  name: 'votar',
  description: 'Inicia uma votação. Uso: $votar <id> <motivo> <valor> <duracaoSeg>',
  async execute(msg, client, args) {
    const [id, motivo, valor, duracao] = args;
    if (!id || !motivo || !valor || !duracao) {
      await msg.reply('Uso: $votar <id> <motivo> <valor> <duracaoSeg>');
      return;
    }
    const duracaoSeg = parseInt(duracao, 10);
    if (isNaN(duracaoSeg)) {
      await msg.reply('⚠️ Duração deve ser um número (segundos).');
      return;
    }
    await addVote(id, motivo, valor, duracaoSeg, async (replyMsg: string) => {
      await msg.reply(replyMsg);
    });
  },
};

export const delVoteCommand: ICommand = {
  name: 'delvoto',
  description: 'Remove uma votação existente. Uso: $delvoto <id>',
  async execute(msg, client, args) {
    const [id] = args;
    if (!id) {
      await msg.reply('Uso: $delvoto <id>');
      return;
    }
    try {
      await delVote(id);
      await msg.reply(`✅ Votação ${id} removida.`);
    } catch (e) {
      await msg.reply('⚠️ Erro ao remover votação.');
    }
  },
};

// Comando para votar
export const votoCommand: ICommand = {
  name: 'voto',
  description: 'Vota em uma votação ativa. Uso: $voto <id> sim/não',
  async execute(msg, client, args) {
    const [id, voto] = args;
    if (!id || !voto) {
      await msg.reply('Uso: $voto <id> sim/não');
      return;
    }
    const votoLower = voto.toLowerCase();
    if (votoLower !== 'sim' && votoLower !== 'não' && votoLower !== 'nao') {
      await msg.reply('⚠️ Voto deve ser "sim" ou "não".');
      return;
    }
    const votoNormalizado = votoLower === 'nao' ? 'não' : votoLower;
    await registrarVoto(id, msg.author || msg.from || 'unknown', votoNormalizado as 'sim' | 'não', async (replyMsg: string) => {
      await msg.reply(replyMsg);
    });
  },
};
