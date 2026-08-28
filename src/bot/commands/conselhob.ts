import { ICommand } from './types';
import { conselhob } from './conselhobData';

export const conselhobCommand: ICommand = {
  name: 'conselhob',
  description: 'Envia um conselho aleatório (versão B).',
  async execute(ctx) {
    const random = Math.floor(Math.random() * conselhob.length);
    await ctx.reply(conselhob[random]);
  },
};
