import { ICommand } from './types';
import { palavrasc } from './conselhos';

export const conselhoCommand: ICommand = {
  name: 'conselho',
  description: 'Envia um conselho aleatório.',
  async execute(ctx: any, _client?: any, _args?: any) {
    const random = Math.floor(Math.random() * palavrasc.length);
    const conselho = palavrasc[random];
    await ctx.reply(conselho);
  },
};
