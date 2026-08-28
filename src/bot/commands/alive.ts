import { ICommand } from './types';

export const aliveCommand: ICommand = {
    name: 'alive',
    description: 'Verifica se o bot está online.',
    
    async execute(ctx) {
        const uptime = Math.floor(process.uptime() / 60);
        const response = [
            '✅ *BOT ONLINE*',
            '',
            `Uptime: ${uptime}min`,
            'O bot está funcionando perfeitamente!',
            'Qualquer coisa, é só chamar!'
        ].join('\n');
        
        await ctx.reply(response);
    }
};
