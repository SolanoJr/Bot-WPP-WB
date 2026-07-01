import { ICommand } from './types';

export const pingCommand: ICommand = {
    name: 'ping',
    description: 'Testa a conexão do bot.',
    
    async execute(msg, client, args) {
        const startTime = Date.now();
        const latency = Date.now() - startTime;
        
        const response = [
            '🏓 *Pong!*',
            '',
            `Latência: ${latency}ms`,
            '✅ Bot está online e funcionando!'
        ].join('\n');
        
        await msg.reply(response);
    }
};