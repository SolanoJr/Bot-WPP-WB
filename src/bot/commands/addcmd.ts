import { ICommand } from './types';
import { getComandoBlock, addComandosId, addComandos } from './customCommandsStore';

/**
 * Command to add a custom command to a group using local storage.
 * Usage: $addcmd <groupId> <commandText>
 */
export const addCmdCommand: ICommand = {
  name: 'addcmd',
  description: 'Adiciona um comando customizado ao grupo.',
  async execute(msg, client, args) {
    const [groupId, ...commandParts] = args;
    const commandText = commandParts.join(' ');

    if (!groupId || !commandText) {
      await msg.reply('Uso: $addcmd <groupId> <textoDoComando>');
      return;
    }

    // Ensure a command block exists for the group
    const existing = getComandoBlock(groupId);
    if (!existing) {
      // Cria bloco se não existir
      try {
        addComandosId(groupId);
      } catch (e) {
        await msg.reply('⚠️ Não foi possível criar bloco de comandos.');
        return;
      }
    }

    try {
      addComandos(groupId, commandText);
      await msg.reply(`✅ Comando adicionado ao grupo ${groupId}.`);
    } catch (e) {
      await msg.reply('⚠️ Erro ao adicionar comando.');
    }
  },
};
