import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { groupTag } from './format';

export const infoCommand: ICommand = {
    name: 'info',
    description: 'Mostra dados do contexto atual da mensagem (chat, autor, plataforma, args).',

    async execute(ctx: CommandContext) {
        const chatId = ctx.chatId || 'chat-desconhecido';
        const authorId = ctx.userId || 'autor-desconhecido';
        const platform = ctx.platform || 'desconhecida';
        const timestamp = new Date().toLocaleString('pt-BR');
        const totalArgs = (ctx.args || []).length;

        const response =
            `📋 **Informações da Mensagem:**\n\n` +
            `⏰ Horário atual: ${timestamp}\n` +
            `💬 ID do chat: ${chatId}\n` +
            `👤 Autor: ${authorId}\n` +
            `🌐 Plataforma: ${platform}\n` +
            `📝 Número de argumentos: ${totalArgs}\n` +
            `🤖 Bot: WarriorBlack${groupTag(ctx)}`;

        await ctx.reply(response);
    }
};
