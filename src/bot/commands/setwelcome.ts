import { ICommand } from './types';
import axios from 'axios';
import { isMaster, cleanId } from '../../services/permissions';
import { groupTag } from './format';

export const setwelcomeCommand: ICommand = {
    name: 'setwelcome',
    description: 'Configura a mensagem de boas-vindas do grupo (Apenas Admins).',
    async execute(ctx) {
        const chat = await ctx.getChat();

        if (!chat.isGroup) {
            await ctx.reply('❌ Este comando só pode ser usado em grupos.');
            return;
        }

        const authorId = ctx.userId;
        const isUserMaster = isMaster(authorId);
        
        let isGroupAdmin = false;
        if (!isUserMaster) {
            // Reutilizar o chat já obtido - não chamar getChatById() novamente
            const freshChat = chat;
            const authorClean = cleanId(authorId);
            
            const member = freshChat.participants.find((m: any) => cleanId(m.id._serialized) === authorClean);
            isGroupAdmin = member && (member.isAdmin || member.isSuperAdmin);

            console.log(`🛡️ [ADMIN-CHECK] Usuário ${authorClean} é Admin? ${isGroupAdmin ? 'SIM' : 'NÃO'}`);
        }

        if (!isUserMaster && !isGroupAdmin) {
            console.log(`🚫 [AUTH-FAIL] $setwelcome negado para ${authorId}`);
            await ctx.reply('❌ Apenas administradores do grupo ou o MASTER do bot podem usar este comando.');
            return;
        }

        if (ctx.args.length === 0) {
            await ctx.reply('❌ Por favor, digite a nova mensagem. Exemplo: `$setwelcome Bem-vindos ao nosso grupo!`');
            return;
        }

        const newWelcome = ctx.args.join(' ');
        const groupId = chat.id._serialized;
        const RELAY_URL = process.env.RELAY_URL || 'https://bot-wpp-relay.onrender.com';

        try {
            const response = await axios.post(`${RELAY_URL}/groups/${encodeURIComponent(groupId)}/config`, {
                welcomeMessage: newWelcome,
                name: chat.name
            }, {
                headers: { 'x-api-key': process.env.API_KEY || '' }
            });

            if (response.data.success) {
                await ctx.reply(`✅ Mensagem de boas-vindas atualizada com sucesso!${groupTag(ctx)}`);
            } else {
                throw new Error('Falha na resposta do Relay');
            }
        } catch (error) {
            console.error('❌ Erro ao definir welcome:', error);
            await ctx.reply('⚠️ Ocorreu um erro ao salvar a configuração. Tente novamente mais tarde.');
        }
    }
};
