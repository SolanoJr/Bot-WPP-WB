import { ICommand } from './types';

export const kickCommand: ICommand = {
    name: 'kick',
    description: 'Remove um usuário do grupo.',
    
    async execute(msg, client, args) {
        const { isGroup } = await msg.getChat();
        
        if (!isGroup) {
            await msg.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        const mentioned = msg.mentionedIds;
        if (!mentioned || mentioned.length === 0) {
            await msg.reply('❌ Marque o usuário a ser removido.');
            return;
        }
        
        const userToKick = mentioned[0];
        await client.kick(userToKick);
        await msg.reply(`✅ Usuário removido com sucesso.`);
    }
};