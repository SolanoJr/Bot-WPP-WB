import { ICommand } from './types';
import { groupTag } from './format';

export const promoteCommand: ICommand = {
    name: 'promover',
    description: 'Promove um usuário a administrador.',
    
    async execute(ctx) {
        const chat = await ctx.getChat();
        if (!chat.isGroup) {
            await ctx.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        const mentioned = ctx.msg.mentions;
        if (!mentioned || mentioned.length === 0) {
            await ctx.reply('❌ Marque o usuário a ser promovido.');
            return;
        }
        
        const userToPromote = mentioned[0].id;
        if (typeof ctx.client.promoteParticipant !== 'function') {
            await ctx.reply('❌ Promoção não suportada nesta plataforma.');
            return;
        }
        try {
            await ctx.client.promoteParticipant(chat.id, userToPromote);
            await ctx.reply(`✅ Usuário promovido a administrador.${groupTag(ctx)}`);
        } catch (err: any) {
            await ctx.reply(`❌ Não consegui promover (o WhatsApp recusou): ${err?.message ?? 'erro desconhecido'}`);
        }
    }
};
