import { ICommand } from './types';

export const infoCommand: ICommand = {
    name: 'info',
    description: 'Mostra dados do contexto atual da mensagem.',
    
    async execute(ctx) {
        const chatId = ctx.chatId || 'chat-desconhecido';
        const timestamp = new Date().toLocaleString('pt-BR');
        const platformName = ctx.platform.charAt(0).toUpperCase() + ctx.platform.slice(1);
        const argsLen = ctx.args?.length ?? 0;
        
        const response =
            `📋 **Informações da Mensagem:**\n\n` +
            `⏰ Horário atual: ${timestamp}\n` +
            `💬 ID do chat: ${chatId}\n` +
            `🔧 Plataforma: ${platformName}\n` +
            `📝 Argumentos: ${argsLen}\n`;
        
        await ctx.reply(response);
    }
};
