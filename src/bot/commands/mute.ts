import { ICommand } from './types';
import { groupTag } from './format';

export const muteCommand: ICommand = {
    name: 'mute',
    description: 'Silencia um usuário do grupo.',
    
    async execute(ctx) {
        const chat = await ctx.getChat();
        if (!chat.isGroup) {
            await ctx.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        const mentioned = ctx.msg.mentions;
        if (!mentioned || mentioned.length === 0) {
            await ctx.reply('❌ Marque o usuário a ser silenciado.');
            return;
        }
        
        const userToMute = mentioned[0].id;
        await ctx.client.mute!(userToMute, 8 * 60 * 60); // 8 horas
        await ctx.reply(`✅ Usuário silenciado por 8 horas.${groupTag(ctx)}`);
    }
};
