import { ICommand } from './types';

export const muteCommand: ICommand = {
    name: 'mute',
    description: 'Silencia um usuário do grupo.',
    
    async execute(msg, client, args) {
        const { isGroup } = await msg.getChat();
        
        if (!isGroup) {
            await msg.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        const mentioned = msg.mentionedIds;
        if (!mentioned || mentioned.length === 0) {
            await msg.reply('❌ Marque o usuário a ser silenciado.');
            return;
        }
        
        const userToMute = mentioned[0];
        await client.mute(userToMute, 8 * 60 * 60); // 8 horas
        await msg.reply(`✅ Usuário silenciado por 8 horas.`);
    }
};