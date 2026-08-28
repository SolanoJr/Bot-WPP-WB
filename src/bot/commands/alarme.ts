import { ICommand } from './types';

export const alarmeCommand: ICommand = {
    name: 'alarme',
    description: 'Define um alarme (placeholder).',
    async execute(ctx) {
        await ctx.reply('⏰ Sistema de alarmes ainda não implementado. Em breve você poderá definir alarmes!');
    }
};
