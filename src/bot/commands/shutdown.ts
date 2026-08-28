import { ICommand } from './types';
import { isMaster } from '../../services/permissions';

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
            console.log(`🛑 [SHUTDOWN] Comando executado por: ${executorId}`);
            
            await ctx.reply('🛑 **DESLIGANDO BOT...**\n\nO bot será desligado em 3 segundos.\n\n⚠️ Use `pm2 restart bot-wpp` no servidor para reiniciar.');
            
            setTimeout(() => {
                console.log('🛑 [SHUTDOWN] Encerrando processo...');
                process.exit(0);
            }, 3000);
            
        } catch (error) {
            console.error('❌ [SHUTDOWN] Erro:', error);
            await ctx.reply('⚠️ Erro ao tentar desligar o bot.');
        }
    }
};
