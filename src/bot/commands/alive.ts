import { ICommand } from './types';

export const aliveCommand: ICommand = {
    name: 'alive',
    description: 'Verifica se o bot está online.',
    
    async execute(msg, client, args) {
        const response = [
            '✅ *BOT ONLINE*',
            '',
            'O bot está funcionando perfeitamente!',
            'Qualquer coisa, é só chamar!'
        ].join('\n');
        
        await msg.reply(response);
    }
};