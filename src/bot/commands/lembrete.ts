import { ICommand } from './types';

export const lembreteCommand: ICommand = {
    name: 'lembrete',
    description: 'Cria um lembrete (placeholder).',
    async execute(msg, client, args) {
        await msg.reply('📝 Sistema de lembretes ainda não implementado. Em breve você poderá criar lembretes!');
    }
};
