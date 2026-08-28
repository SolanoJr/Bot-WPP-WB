import { ICommand } from './types';
import { pia } from './piadas';

export const jokesCommand: ICommand = {
  name: 'piada',
  description: 'Envia uma piada aleatória.',
  async execute(ctx) {
    const random = Math.floor(Math.random() * pia.length);
    await ctx.reply(pia[random]);
  },
};
