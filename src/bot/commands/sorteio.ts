import { ICommand } from './types';

export const sorteioCommand: ICommand = {
    name: 'sorteio',
    description: 'Sorteio de participantes (placeholder).',
    async execute(ctx) {
        await ctx.reply('🎲 Sorteio ainda não implementado. Em breve!');
    }
};
