import { ICommand } from './types';

export const nickCommand: ICommand = {
    name: 'nick',
    description: 'Altera o apelido (placeholder).',
    async execute(msg, client, args) {
        await msg.reply('🪪 Alteração de apelido ainda não implementada. Em breve!');
    }
};