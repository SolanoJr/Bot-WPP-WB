import { ICommand } from './types';

export const sorteioCommand: ICommand = {
    name: 'sorteio',
    description: 'Sorteio de participantes (placeholder).',
    async execute(ctx: any, _client?: any, _args?: any) {
        await ctx.reply('🎲 Sorteio ainda não implementado. Em breve!');
    }
};