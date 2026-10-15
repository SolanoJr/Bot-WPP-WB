import { ICommand } from './types';
import { getAleatorio } from '../../services/aleatorioService';
import { groupTag } from './format';

export const aleatorioCommand: ICommand = {
  name: 'aleatorio',
  description: 'Responde aleatoriamente com porcentagem de acerto.',
  async execute(ctx) {
    const r = getAleatorio(ctx.args?.join(' '));
    return ctx.reply(`🎲 ${r.result} (${r.percent}%)${groupTag(ctx)}`);
  }
};
