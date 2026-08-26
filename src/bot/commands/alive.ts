import { ICommand } from './types';

export const aliveCommand: ICommand = {
    name: 'alive',
    description: 'Verifica se o bot está online.',
    
    async execute(ctx: any, _client?: any, _args?: any) {
        const response = [
            '✅ *BOT ONLINE*',
            '',
            'O bot está funcionando perfeitamente!',
            'Qualquer coisa, é só chamar!'
        ].join('\n');
        
        await ctx.reply(response);
    }
};