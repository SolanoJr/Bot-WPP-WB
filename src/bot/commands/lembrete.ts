import { ICommand } from './types';

export const lembreteCommand: ICommand = {
    name: 'lembrete',
    description: 'Cria um lembrete (placeholder).',
    async execute(ctx) {
        await ctx.reply('📝 Sistema de lembretes ainda não implementado. Em breve você poderá criar lembretes!');
    }
};
