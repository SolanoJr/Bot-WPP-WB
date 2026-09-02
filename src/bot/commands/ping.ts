import { ICommand } from './types';

export const pingCommand: ICommand = {
    name: 'ping',
    description: 'Testa a conexão do bot.',
    
    async execute(ctx) {
        const startTime = Date.now();
        
        await ctx.reply('🏓 Calculando...');
        
        const latency = Date.now() - startTime;
        const platformName = ctx.platform.charAt(0).toUpperCase() + ctx.platform.slice(1);
        
        const response = [
            '🏓 *Pong!*',
            '',
            `⏱️ Latência: ${latency}ms`,
            `📱 Plataforma: ${platformName}`,
            `⏰ Horário: ${new Date().toLocaleTimeString('pt-BR')}`,
            '✅ Bot está online e funcionando!'
        ].join('\n');
        
        await ctx.reply(response);
    }
};
