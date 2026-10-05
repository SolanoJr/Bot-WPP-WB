import { ICommand } from './types';
import { getBomDiaMsg } from '../../services/bomDiaService';
import { groupTag } from './format';

export const bomDiaCommand: ICommand = {
  name: 'bomdia',
  description: 'Atualizações do dia (09h — conceito simples).',
  async execute(ctx) {
    return ctx.reply(`${getBomDiaMsg()}${groupTag(ctx)}`);
  }
};
