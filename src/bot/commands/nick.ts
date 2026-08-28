import { ICommand } from './types';
import { isMaster } from '../../services/permissions';

export const nickCommand: ICommand = {
    name: 'nick',
    description: 'Altera o apelido (placeholder).',
    async execute(ctx) {
        await ctx.reply('🪪 Alteração de apelido ainda não implementada. Em breve!');
    }
};
