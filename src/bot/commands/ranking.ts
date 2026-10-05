import { ICommand } from './types';
import { rankAleatorio } from '../../services/rankingService';
import { groupTag } from './format';

export const rankingCommand: ICommand = {
  name: 'ranking',
  description: 'Ranqueia aleatórios simples.',
  async execute(ctx) {
    const r = rankAleatorio();
    return ctx.reply(`🏆 Ranking aleatório:\n${r.map((item, i) => `${i+1}. ${item}`).join('\n')}${groupTag(ctx)}`);
  }
};
