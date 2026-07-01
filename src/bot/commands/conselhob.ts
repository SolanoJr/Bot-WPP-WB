import { ICommand } from './types';
import { conselhob } from './conselhobData';

export const conselhobCommand: ICommand = {
  name: 'conselhob',
  description: 'Envia um conselho aleatório (versão B).',
  async execute(msg, client, args) {
    const random = Math.floor(Math.random() * conselhob.length);
    const conselho = conselhob[random];
    await msg.reply(conselho);
  },
};
