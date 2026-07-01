import { ICommand } from './types';
import { mensagens, sortear } from './aleatoriaData';

export const aleatoriaCommand: ICommand = {
  name: 'aleatoria',
  description: 'Envia uma mensagem aleatória (texto ou número).',
  async execute(msg, client, args) {
    // Se o usuário passar "num" ou "numero" retorna um número aleatório, senão texto
    const sub = args[0]?.toLowerCase();
    if (sub && (sub === 'num' || sub === 'numero')) {
      const idx = Math.floor(Math.random() * sortear.length);
      await msg.reply(sortear[idx]);
    } else {
      const idx = Math.floor(Math.random() * mensagens.length);
      await msg.reply(mensagens[idx]);
    }
  },
};
