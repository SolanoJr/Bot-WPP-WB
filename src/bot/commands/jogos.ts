import { ICommand } from './types';

export const jogosCommand: ICommand = {
  name: 'jogos',
  description: 'Lista os jogos e comandos de diversão disponíveis.',
  async execute(msg, client, args) {
    const response = [
      '🎮 *Jogos e diversão*',
      '',
      '$forca - inicia ou continua o jogo da forca',
      '$velha - inicia ou continua o jogo da velha',
      '$sorteio - sorteio simples',
      '$piada - piada aleatória',
      '$conselho - conselho aleatório',
      '$conselhob - conselho alternativo',
      '$aleatoria - mensagem aleatória',
      '$votar - inicia uma votação',
      '$voto - vota em uma votação ativa',
      '$delvoto - remove uma votação'
    ].join('\n');

    await msg.reply(response);
  }
};
