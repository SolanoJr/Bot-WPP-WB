import { ICommand } from './types';

export const helpCommand: ICommand = {
    name: 'help',
    description: 'Lista os comandos disponíveis.',
    
    async execute(msg, client, args) {
        const response = [
            '🤖 *Comandos Disponíveis:*',
            '',
            'Digite $ seguido do nome do comando.',
            '',
            '📋 Comandos Principais:',
            '  $help - Lista os comandos',
            '  $menu - Menu principal',
            '  $ping - Testa conexão',
            '  $alive - Verifica se o bot está online',
            '  $ondeestou - Gera link de localização',
            '  $pergunta - Pergunta para a IA',
            '  $jogos - Lista jogos e diversão',
            '',
            'Use $menu para ver a lista completa.'
        ].join('\n');
        
        await msg.reply(response);
    }
};
