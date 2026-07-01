import { ICommand } from './types';

export const infoCommand: ICommand = {
    name: 'info',
    description: 'Mostra dados do contexto atual da mensagem.',
    async execute(msg, client, args) {
        const chatId = msg.from || 'chat-desconhecido';
        const timestamp = new Date().toLocaleString('pt-BR');
        const totalArgs = args.length;
        
        const response =
            `📋 **Informações da Mensagem:**\n\n` +
            `⏰ Horário atual: ${timestamp}\n` +
            `💬 ID do chat: ${chatId}\n` +
            `📝 Número de argumentos: ${totalArgs}\n` +
            `🤖 Bot: WhatsApp Bot v1.0`;

        await msg.reply(response);
    }
};
