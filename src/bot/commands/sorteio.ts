import { ICommand } from './types';

export const sorteioCommand: ICommand = {
    name: 'sorteio',
    description: 'Sorteio de participantes (placeholder).',
    async execute(msg, client, args) {
        await msg.reply('🎲 Sorteio ainda não implementado. Em breve!');
    }
};