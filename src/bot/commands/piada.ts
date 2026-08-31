import { ICommand } from './types';

export const piadaCommand: ICommand = {
  name: 'piada',
  description: 'Envia uma piada aleatória para descontrair.',
  async execute(ctx) {
    const jokes = [
      'O que o carro falou para o motorista? – Eu fui na frente, mas eu era só uma marcha! 😂',
      'Por que o computador foi ao médico? – Porque ele estava com um vírus! 🤒',
      'Qual é o animal que come com o rabo? – Todos, porque ninguém tira o rabo para comer! 🐶',
    ];
    const choice = jokes[Math.floor(Math.random() * jokes.length)];
    await ctx.reply(choice);
  },
};
