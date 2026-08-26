import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { groupTag } from './format';
import { cleanId, isMaster, isProtectedTarget } from '../../services/permissions';

export const promoteCommand: ICommand = {
    name: 'promover',
    description: 'Promove um usuário a administrador do grupo.',

    async execute(ctx: CommandContext) {
        try {
            const chat = await ctx.getChat();
            if (!chat.isGroup) {
                await ctx.reply('❌ Este comando só funciona em grupos.');
                return;
            }

            const participants = chat.participants || [];
            const senderClean = cleanId(ctx.userId);

            // Só admin do grupo ou MASTER pode promover alguém.
            const senderPart = participants.find(p => cleanId(p.id) === senderClean);
            let senderIsAdmin = Boolean(senderPart?.isAdmin || senderPart?.isSuperAdmin);
            if (!senderIsAdmin && !isMaster(ctx.userId) && (ctx.client as any).isParticipantAdmin) {
                try {
                    senderIsAdmin = await (ctx.client as any).isParticipantAdmin(ctx.chatId, ctx.userId);
                } catch {
                    senderIsAdmin = false;
                }
            }
            if (!senderIsAdmin && !isMaster(ctx.userId)) {
                await ctx.reply('❌ Você não tem permissão para usar este comando.');
                return;
            }

            const mentioned = ctx.msg.mentions;
            if (!mentioned || mentioned.length === 0) {
                await ctx.reply('❌ Marque o usuário a ser promovido. Ex: $promover @usuario');
                return;
            }

            // ⚠️ NÃO converter @lid -> @c.us: o WhatsApp moderno exige o @lid original.
            const targetId = mentioned[0].id;

            // PROTEÇÃO: mudança de cargo do MASTER/bot só pelo próprio dono.
            if (isProtectedTarget(targetId) && !isMaster(ctx.userId)) {
                await ctx.reply('🛡️ Você não pode alterar o cargo do dono (MASTER) ou do próprio bot.');
                return;
            }

            const promote = (ctx.client as any).promoteParticipant || (ctx.client as any).promote;
            if (typeof promote !== 'function') {
                await ctx.reply('⚠️ Promover não é suportado nesta plataforma.');
                return;
            }
            await promote.call(ctx.client, ctx.chatId, targetId);

            const numero = String(targetId).replace('@c.us', '').replace('@lid', '');
            await ctx.reply(
                `✅ ${ctx.platform === 'whatsapp' ? '@' + numero : numero} foi promovido a administrador.${groupTag(ctx)}`,
                { ...(ctx.platform === 'whatsapp' ? { mentions: [targetId] } : {}) } as any
            );
        } catch (error: any) {
            console.error('[promover] Erro:', error);
            await ctx.reply(`❌ Falha ao promover: ${error?.message || error}`);
        }
    }
};
