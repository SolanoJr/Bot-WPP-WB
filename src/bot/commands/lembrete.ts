import { ICommand } from './types';

export const lembreteCommand: ICommand = {
    name: 'lembrete',
    description: 'Cria um lembrete (placeholder).',
    async execute(ctx: any, _client?: any, _args?: any) {
        await ctx.reply('📝 Sistema de lembretes ainda não implementado. Em breve você poderá criar lembretes!');
    }
};
