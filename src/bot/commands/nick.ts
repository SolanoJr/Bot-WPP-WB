import { ICommand } from './types';

export const nickCommand: ICommand = {
    name: 'nick',
    description: 'Altera o apelido (placeholder).',
    async execute(ctx: any, _client?: any, _args?: any) {
        await ctx.reply('🪪 Alteração de apelido ainda não implementada. Em breve!');
    }
};