import { ICommand } from './types';
import { isMaster } from '../../services/permissions';

export const promoteCommand: ICommand = {
    name: 'promover',
    description: 'Promove um usuário a administrador.',
    
    async execute(ctxOrMsg: any, maybeClient?: any, maybeArgs?: any) {
        // Compatibilidade com CommandContext e formato legado
        const isContext = ctxOrMsg && typeof ctxOrMsg === 'object' && 'msg' in ctxOrMsg;
        const msg = isContext ? ctxOrMsg.msg : ctxOrMsg;
        const client = isContext ? (ctxOrMsg.client as any).getClient?.() || ctxOrMsg.client : maybeClient;
        const args = isContext ? ctxOrMsg.args : maybeArgs;

        try {
            if (!msg || typeof msg.getChat !== 'function') {
                if (isContext) await ctxOrMsg.reply('❌ Erro: contexto de mensagem inválido.');
                else if (msg && typeof msg.reply === 'function') await msg.reply('❌ Erro: mensagem inválida.');
                return;
            }

            const chat = await msg.getChat();
            if (!chat || !chat.isGroup) {
                await msg.reply('❌ Este comando só funciona em grupos.');
                return;
            }

            // Permissões: permitir MASTER ou administradores do grupo
            const senderId = msg.userId || msg.author || msg.from;
            if (!isMaster(senderId) && !(msg.raw && msg.raw.author && msg.raw.isAdmin)) {
                // Not strictly checking group admin here for compatibility—fallback to MASTER only
                await msg.reply('❌ Apenas o MASTER pode usar este comando por enquanto.');
                return;
            }

            // Identificar alvo (menção ou reply)
            let targetId = '';
            if (msg.mentionedIds && msg.mentionedIds.length > 0) {
                targetId = msg.mentionedIds[0];
            } else if (msg.hasQuotedMsg) {
                const quoted = await msg.getQuotedMessage();
                targetId = quoted.author || quoted.from;
            } else if (args && args.length > 0) {
                targetId = args[0].replace(/\D/g, '') + '@c.us';
            }

            if (!targetId) {
                await msg.reply('❌ Marque ou responda à mensagem do usuário a ser promovido.');
                return;
            }

            // Executar promoção via cliente legad ou context
            if (client && typeof client.promote === 'function') {
                await client.promote(targetId);
            } else if (isContext && ctxOrMsg.client && typeof ctxOrMsg.client.promote === 'function') {
                await ctxOrMsg.client.promote(targetId);
            } else {
                // Fallback: tentar usar chat.raw.promote
                try {
                    if (chat.raw && typeof (chat.raw as any).promote === 'function') {
                        await (chat.raw as any).promote(targetId);
                    } else {
                        throw new Error('Método de promoção não disponível no adaptador');
                    }
                } catch (e: any) {
                    console.error('[promover] Erro ao promover:', e);
                    await msg.reply('❌ Não foi possível promover o usuário (limitação da plataforma).');
                    return;
                }
            }

            await msg.reply(`✅ Usuário promovido a administrador.`, { mentions: [targetId] });
        } catch (error: any) {
            console.error('[promover] Erro:', error);
            try { await msg.reply('❌ Erro ao executar promover: ' + (error?.message || '')); } catch {};
        }
    }
};