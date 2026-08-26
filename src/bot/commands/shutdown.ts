import { ICommand } from './types';
import { isMaster } from '../../services/permissions';

export const shutdownCommand: ICommand = {
    name: 'shutdown',
    description: 'Desliga o bot (apenas MASTER).',
    async execute(ctx: any, _client?: any, _args?: any) {
        void args;
        
        // BUG 2: Em grupos, ctx.chatId é o ID do grupo. Usar ctx.userId para identificar quem executou
        const isGroup = ctx.chatId?.endsWith('@g.us');
        const executorId = ctx.userId || (isGroup ? null : ctx.chatId);
        
        if (!isMaster(executorId)) {
            await ctx.reply('🚫 **Acesso negado!**\n\nEste comando só pode ser usado pelo **MASTER** do bot.');
            return;
        }

        try {
            console.log(`🛑 [SHUTDOWN] Comando executado por: ${executorId}`);
            
            await ctx.reply('🛑 **DESLIGANDO BOT...**\n\nO bot será desligado em 3 segundos.\n\n⚠️ Use `pm2 restart bot-wpp` no servidor para reiniciar.');
            
            setTimeout(() => {
                console.log('🛑 [SHUTDOWN] Encerrando processo...');
                process.exit(0);
            }, 3000);
            
        } catch (error) {
            console.error('❌ [SHUTDOWN] Erro:', error);
            await ctx.reply('❌ **Erro ao desligar bot.**\n\nVerifique o console para mais detalhes.');
        }
    }
};
