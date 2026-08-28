import { ICommand } from './types';

export const pingCommand: ICommand = {
    name: 'ping',
    description: 'Testa a conexão do bot.',
    
    async execute(ctx) {
        const startTime = Date.now();
        const latency = Date.now() - startTime;
        const platformName = ctx.platform.charAt(0).toUpperCase() + ctx.platform.slice(1);
        
        const response = [
            '🏓 *Pong!*',
            '',
            `Latência: ${latency}ms`,
            `Plataforma: ${platformName}`,
            '✅ Bot está online e funcionando!'
        ].join('\n');
        
        await ctx.reply(response);
    }
};
