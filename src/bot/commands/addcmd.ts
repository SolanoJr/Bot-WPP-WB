import { ICommand } from './types';
import { getComandoBlock, addComandosId, addComandos } from './customCommandsStore';
import { isMaster } from '../../services/permissions';

/** Adiciona um comando customizado ao grupo. Só o dono (isMaster) pode usar. */
export const addCmdCommand: ICommand = {
  name: 'addcmd',
  description: 'Adiciona um comando customizado ao grupo (somente dono).',
  async execute(ctx) {
    if (!isMaster(ctx.userId)) {
      await ctx.reply('⛔ Este comando é restrito ao dono do bot.');
      return;
    }

    const [groupId, ...commandParts] = ctx.args;
    const commandText = commandParts.join(' ');

    if (!groupId || !commandText) {
      await ctx.reply('Uso: $addcmd <groupId> <textoDoComando>');
      return;
    }

    // Cria bloco se não existir
    const existing = getComandoBlock(groupId);
    if (!existing) {
      try {
        addComandosId(groupId);
      } catch {
        await ctx.reply('⚠️ Não foi possível criar bloco de comandos.');
        return;
      }
    }

    try {
      addComandos(groupId, commandText);
      await ctx.reply(`✅ Comando adicionado ao grupo ${groupId}.`);
    } catch {
      await ctx.reply('⚠️ Erro ao adicionar comando.');
    }
  },
};
