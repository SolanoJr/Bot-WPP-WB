import { ICommand } from './types';

export const adminCommand: ICommand = {
    name: 'admin',
    description: 'Comandos de administração do bot',
    async execute(msg, client, args) {
        void args;
        
        const response = [
            '🔧 **Painel Administrativo**',
            '',
            '📋 **Status do Sistema:**',
            '• ✅ Bot Online',
            '• ✅ WhatsApp Conectado',
            '• ✅ Comandos Funcionando',
            '',
            '📊 **Informações:**',
            `• Cliente: ${client.info?.wid?.user || 'Desconhecido'}`,
            `• Plataforma: ${client.info?.platform || 'Desconhecido'}`,
            '',
            '🔧 **Comandos Disponíveis:**',
            '• $ping - Testar conexão',
            '• $help - Lista de comandos',
            '• $info - Informações do chat',
            '',
            '🤖 **Bot v1.0**'
        ].join('\n');

        await msg.reply(response);
    }
};
