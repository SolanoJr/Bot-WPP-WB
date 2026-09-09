import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { logInfo, logWarning, logError } from '../../services/loggerService';

export const shutdownCommand: ICommand = {
    name: 'shutdown',
    description: 'Desliga o bot (apenas MASTER).',
    async execute(ctx) {
        void ctx.args;
        
        const executorId = ctx.userId;
        if (!isMaster(executorId)) {
            await ctx.reply('🚫 **Acesso negado!**\n\nEste comando só pode ser usado pelo **MASTER** do bot.');
            return;
        }

        try {
            logInfo(`🛑 [SHUTDOWN] Comando executado por: ${executorId}`);
            
            await ctx.reply('🛑 **DESLIGANDO BOT...**\n\nO bot será desligado em 3 segundos.\n\n⚠️ Use `pm2 restart bot-wpp` no servidor para reiniciar.');
            
            setTimeout(() => {
                logInfo('🛑 [SHUTDOWN] Encerrando processo...');
                process.exit(0);
            }, 3000);
            
        } catch (error) {
            logError('❌ [SHUTDOWN] Erro:', error);
            await ctx.reply('⚠️ Erro ao tentar desligar o bot.');
        }
    }
};
