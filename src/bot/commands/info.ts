import { ICommand } from './types';
import { groupTag } from './format';

export const infoCommand: ICommand = {
    name: 'info',
    description: 'Mostra dados do contexto atual da mensagem (chat, autor, plataforma, args).',
    async execute(msg: any, client: any, args: any[]) {
        // msg aqui é o CommandContext; o payload está em msg.msg
        const payload = msg.msg || msg;
        const chatId = msg.chatId || payload.from || 'chat-desconhecido';
        const authorId = msg.userId || payload.author || payload.from || 'autor-desconhecido';
        const platform = msg.platform || (client?.platform) || 'desconhecida';
        const timestamp = new Date().toLocaleString('pt-BR');
        const totalArgs = args.length;

        const response =
            `📋 **Informações da Mensagem:**\n\n` +
            `⏰ Horário atual: ${timestamp}\n` +
            `💬 ID do chat: ${chatId}\n` +
            `👤 Autor: ${authorId}\n` +
            `🌐 Plataforma: ${platform}\n` +
            `📝 Número de argumentos: ${totalArgs}\n` +
            `🤖 Bot: WarriorBlack${groupTag(msg)}`;

        await msg.reply(response);
    }
};
