import { ICommand } from './types';
import { palavrasc } from './conselhos';

export const conselhoCommand: ICommand = {
  name: 'conselho',
  description: 'Envia um conselho aleatório.',
  async execute(msg, client, args) {
    const random = Math.floor(Math.random() * palavrasc.length);
    const conselho = palavrasc[random];
    await msg.reply(conselho);
  },
};
