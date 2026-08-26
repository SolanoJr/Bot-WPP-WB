import { ICommand } from './types';

export const alarmeCommand: ICommand = {
    name: 'alarme',
    description: 'Define um alarme (placeholder).',
    async execute(ctx: any, _client?: any, _args?: any) {
        await ctx.reply('⏰ Sistema de alarmes ainda não implementado. Em breve você poderá definir alarmes!');
    }
};
