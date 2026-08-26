import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { mensagens, sortear } from './aleatoriaData';

export const aleatoriaCommand: ICommand = {
  name: 'aleatoria',
  description: 'Envia uma mensagem aleatória (texto ou número).',
  async execute(ctx: CommandContext) {
    // Se o usuário passar "num" ou "numero" retorna um número aleatório, senão texto
    const sub = ctx.args[0]?.toLowerCase();
    if (sub && (sub === 'num' || sub === 'numero')) {
      const idx = Math.floor(Math.random() * sortear.length);
      await ctx.reply(sortear[idx]);
    } else {
      const idx = Math.floor(Math.random() * mensagens.length);
      await ctx.reply(mensagens[idx]);
    }
  },
};
