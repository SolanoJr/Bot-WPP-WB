import { ICommand } from './types';
import { isMaster, cleanId } from '../../services/permissions';

export const gruposCommand: ICommand = {
    name: 'grupos',
    description: 'Lista todos os grupos em que o bot está presente (Apenas MASTER).',
    async execute(msg, client, args) {
        const authorId = msg.author || msg.from;

        if (!isMaster(authorId)) {
            await msg.reply('❌ Comando restrito ao MASTER do bot.');
            return;
        }

        try {
            const chats = await client.getChats();
            const groups = chats.filter(chat => chat.isGroup);

            if (groups.length === 0) {
                await msg.reply('❌ O bot não está em nenhum grupo no momento.');
                return;
            }

            let response = `📋 **LISTA DE GRUPOS (${groups.length})**\n\n`;

            for (const group of groups) {
                const botIdClean = cleanId(client.info.wid._serialized);
                
                const botMember = group.participants.find(p => cleanId(p.id._serialized) === botIdClean);
                const isBotAdmin = botMember && (botMember.isAdmin || botMember.isSuperAdmin);

                console.log(`[GRUPOS] Verificando ${group.name} | Eu sou admin? ${isBotAdmin ? 'true' : 'false'}`);
                
                response += `👥 **${group.name}**\n`;
                response += `🆔 \`${group.id._serialized}\`\n`;
                response += `🛡️ Admin: ${isBotAdmin ? '✅ Sim' : '❌ Não'}\n`;
                response += `👤 Membros: ${group.participants.length}\n`;
                response += `--------------------------\n`;

                if (response.length > 3500) {
                    await msg.reply(response);
                    response = '';
                }
            }

            if (response) {
                await msg.reply(response);
            }
        } catch (error) {
            console.error('❌ Erro no $grupos:', error);
            await msg.reply('⚠️ Erro ao listar grupos.');
        }
    }
};
