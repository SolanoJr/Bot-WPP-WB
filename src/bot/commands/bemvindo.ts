import { ICommand } from './types';

export const bemvindoCommand: ICommand = {
    name: 'bemvindo',
    description: 'Configura mensagem de boas-vindas (placeholder).',
    async execute(msg, client, args) {
        await msg.reply('👋 Sistema de boas-vindas ainda não implementado. Em breve você poderá configurar mensagens de boas-vindas!');
    }
};
