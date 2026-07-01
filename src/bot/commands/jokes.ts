import { ICommand } from './types';
import { pia } from './piadas';

export const jokesCommand: ICommand = {
  name: 'piada',
  description: 'Envia uma piada aleatória.',
  async execute(msg, client, args) {
    // Seleciona aleatoriamente uma piada
    const random = Math.floor(Math.random() * pia.length);
    const joke = pia[random];
    await msg.reply(joke);
  },
};
