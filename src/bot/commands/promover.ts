import { ICommand } from './types';
import { groupTag } from './format';

export const promoteCommand: ICommand = {
    name: 'promover',
    description: 'Promove um usuário a administrador.',
    
    async execute(ctx: any, _client?: any, _args?: any) {
        const { isGroup } = await ctx.getChat();
        
        if (!isGroup) {
            await ctx.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        const mentioned = (msg.mentions && msg.mentions.length) ? msg.mentions : (msg.mentionedIds || []);
        if (!mentioned || mentioned.length === 0) {
            await ctx.reply('❌ Marque o usuário a ser promovido.');
            return;
        }
        
        const userToPromote = mentioned[0].id ? mentioned[0].id.replace('wpp:', '') : mentioned[0];
        await client.promote(userToPromote);
        await ctx.reply(`✅ Usuário promovido a administrador.${groupTag(msg)}`);
    }
};