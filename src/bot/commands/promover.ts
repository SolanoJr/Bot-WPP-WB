import { ICommand } from './types';

export const promoteCommand: ICommand = {
    name: 'promover',
    description: 'Promove um usuário a administrador.',
    
    async execute(msg, client, args) {
        const { isGroup } = await msg.getChat();
        
        if (!isGroup) {
            await msg.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        const mentioned = msg.mentionedIds;
        if (!mentioned || mentioned.length === 0) {
            await msg.reply('❌ Marque o usuário a ser promovido.');
            return;
        }
        
        const userToPromote = mentioned[0];
        await client.promote(userToPromote);
        await msg.reply(`✅ Usuário promovido a administrador.`);
    }
};