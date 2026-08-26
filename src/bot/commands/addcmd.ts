import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { getComandoBlock, addComandosId, addComandos } from './customCommandsStore';

/**
 * Command to add a custom command to a group using local storage.
 * Usage: $addcmd <groupId> <commandText>
 */
export const addCmdCommand: ICommand = {
  name: 'addcmd',
  description: 'Adiciona um comando customizado ao grupo.',
  async execute(ctx: CommandContext) {
    const [groupId, ...commandParts] = ctx.args;
    const commandText = commandParts.join(' ');

    if (!groupId || !commandText) {
      await ctx.reply('Uso: $addcmd <groupId> <textoDoComando>');
      return;
    }

    // Ensure a command block exists for the group
    const existing = getComandoBlock(groupId);
    if (!existing) {
      // Cria bloco se não existir
      try {
        addComandosId(groupId);
      } catch (e) {
        await ctx.reply('⚠️ Não foi possível criar bloco de comandos.');
        return;
      }
    }

    try {
      addComandos(groupId, commandText);
      await ctx.reply(`✅ Comando adicionado ao grupo ${groupId}.`);
    } catch (e) {
      await ctx.reply('⚠️ Erro ao adicionar comando.');
    }
  },
};
