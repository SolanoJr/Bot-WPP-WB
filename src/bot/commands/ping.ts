import { ICommand } from './types';

export const pingCommand: ICommand = {
    name: 'ping',
    description: 'Testa a conexão do bot e mede a latência real (ida e volta).',

    async execute(ctx: any, _client?: any, _args?: any) {
        // RTT real: do recebimento da mensagem até o envio da resposta.
        const receivedAt = ctx.timestamp ? new Date(ctx.timestamp).getTime() : Date.now();
        const now = Date.now();
        const rtt = Math.max(0, now - receivedAt);

        const response = [
            `🏓 *Pong!* (RTT: ${rtt}ms)`,
            '✅ Bot está online e funcionando!'
        ].join('\n');

        await ctx.reply(response);
    }
};
