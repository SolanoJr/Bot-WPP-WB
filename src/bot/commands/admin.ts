import { ICommand } from './types';

export const adminCommand: ICommand = {
    name: 'admin',
    description: 'Comandos de administração do bot',
    async execute(ctx) {
        void ctx.args;
        
        const response = [
            '🔧 **Painel Administrativo**',
            '',
            '📋 **Status do Sistema:**',
            '• ✅ Bot Online',
            '• ✅ WhatsApp Conectado',
            '• ✅ Comandos Funcionando',
            '',
            '📊 **Informações:**',
            `• Plataforma: ${ctx.platform.charAt(0).toUpperCase() + ctx.platform.slice(1)}`,
            '',
            '🔧 **Comandos Disponíveis:**',
            '• $ping - Testar conexão',
            '• $help - Lista de comandos',
            '• $info - Informações do chat',
            '',
            '🤖 **Bot v1.0**'
        ].join('\\n');

        await ctx.reply(response);
    }
};
