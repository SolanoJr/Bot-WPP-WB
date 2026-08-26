import { ICommand } from './types';
import { isFiltered, addFilter } from './antispamStore';

export const antispamCommand: ICommand = {
  name: 'antispam',
  description: 'Verifica se o usuário está dentro do limite de uso (5s).',
  async execute(ctx: any, _client?: any, _args?: any) {
    const sender = ctx.userId || ctx.chatId;
    if (!sender) {
      await ctx.reply('⚠️ Não foi possível identificar o remetente.');
      return;
    }
    if (isFiltered(sender)) {
      // permite uso e adiciona filtro
      addFilter(sender);
      await ctx.reply('✅ Você pode usar o comando agora.');
    } else {
      await ctx.reply('⏳ Aguarde alguns segundos antes de usar outro comando.');
    }
  },
};
