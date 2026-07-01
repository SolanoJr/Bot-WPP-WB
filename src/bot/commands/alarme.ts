import { ICommand } from './types';

export const alarmeCommand: ICommand = {
    name: 'alarme',
    description: 'Define um alarme (placeholder).',
    async execute(msg, client, args) {
        await msg.reply('⏰ Sistema de alarmes ainda não implementado. Em breve você poderá definir alarmes!');
    }
};
