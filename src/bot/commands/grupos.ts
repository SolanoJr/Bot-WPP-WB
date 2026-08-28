import { ICommand } from './types';
import { isMaster, cleanId } from '../../services/permissions';

export const gruposCommand: ICommand = {
    name: 'grupos',
    description: 'Lista todos os grupos em que o bot está presente (Apenas MASTER).',
    async execute(ctx) {
        const authorId = ctx.userId;

        if (!isMaster(authorId)) {
            await ctx.reply('❌ Comando restrito ao MASTER do bot.');
            return;
        }

        try {
            const chats = await ctx.client.getChats();
            const groups = chats.filter(chat => chat.isGroup);

            if (groups.length === 0) {
                await ctx.reply('❌ O bot não está em nenhum grupo no momento.');
                return;
            }

            let response = `📋 **LISTA DE GRUPOS (${groups.length})**\n\n`;

            for (const group of groups) {
                const botIdClean = cleanId(ctx.client.userId);
                
                const botMember = group.participants.find(p => cleanId(p.id._serialized) === botIdClean);
                const isBotAdmin = botMember && (botMember.isAdmin || botMember.isSuperAdmin);

                console.log(`[GRUPOS] Verificando ${group.name} | Eu sou admin? ${isBotAdmin ? 'true' : 'false'}`);
                
                response += `👥 **${group.name}**\n`;
                response += `🆔 \`${group.id._serialized}\`\n`;
                response += `🛡️ Admin: ${isBotAdmin ? '✅ Sim' : '❌ Não'}\n`;
                response += `👤 Membros: ${group.participants.length}\n`;
                response += `--------------------------\n`;

                if (response.length > 3500) {
                    await ctx.reply(response);
                    response = '';
                }
            }

            if (response) {
                await ctx.reply(response);
            }
        } catch (error) {
            console.error('❌ Erro no $grupos:', error);
            await ctx.reply('⚠️ Erro ao listar grupos.');
        }
    }
};
