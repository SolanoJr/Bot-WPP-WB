import { ICommand } from './types';
import { groupTag } from './format';

export const infoCommand: ICommand = {
    name: 'info',
    description: 'Mostra dados do contexto atual da mensagem (chat, autor, plataforma, args).',
    async execute(ctx: any, _client?: any, _args?: any) {
        // msg aqui é o CommandContext; o payload está em msg.msg
        const payload = msg.msg || msg;
        const chatId = ctx.chatId || payload.from || 'chat-desconhecido';
        const authorId = ctx.userId || payload.author || payload.from || 'autor-desconhecido';
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

        await ctx.reply(response);
    }
};
