import { ICommand } from './types';
import { isFiltered, addFilter } from './antispamStore';

export const antispamCommand: ICommand = {
  name: 'antispam',
  description: 'Verifica se o usuário está dentro do limite de uso (5s).',
  async execute(msg, client, args) {
    const sender = msg.author || msg.from;
    if (!sender) {
      await msg.reply('⚠️ Não foi possível identificar o remetente.');
      return;
    }
    if (isFiltered(sender)) {
      // permite uso e adiciona filtro
      addFilter(sender);
      await msg.reply('✅ Você pode usar o comando agora.');
    } else {
      await msg.reply('⏳ Aguarde alguns segundos antes de usar outro comando.');
    }
  },
};
