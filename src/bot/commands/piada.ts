import { ICommand } from './types';

/**
 * Comando que devolve uma piada aleatória.
 * Uso: `/piada`
 */
export const piadaCommand: ICommand = {
  name: 'piada',
  description: 'Envia uma piada aleatória para descontrair.',
  async execute(msg: any) {
    const jokes = [
      'O que o carro falou para o motorista? – Eu fui na frente, mas eu era só uma marcha! 😂',
      'Por que o computador foi ao médico? – Porque ele estava com um vírus! 🤒',
      'Qual é o animal que come com o rabo? – Todos, porque ninguém tira o rabo para comer! 🐶',
    ];
    const choice = jokes[Math.floor(Math.random() * jokes.length)];
    if (msg.reply) await msg.reply(choice);
    return choice;
  },
};
