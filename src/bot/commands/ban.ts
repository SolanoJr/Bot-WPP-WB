import { ICommand } from './types';

export const banCommand: ICommand = {
    name: 'ban',
    description: 'Bane um usuário do grupo, remove suas mensagens e o expulsa.',
    
    async execute(msg, client, args) {
        const chat = await msg.getChat();
        const { isGroup, participants } = chat;
        
        if (!isGroup) {
            await msg.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        // Verificar se quem mandou é admin
        const me = await client.getNumber();
        const myNumber = me.split('@')[0];
        const participant = participants.find(p => p.id._serialized === msg.author);
        const isAdmin = participant?.isAdmin || participant?.isOwner;
        
        if (!isAdmin) {
            await msg.reply('❌ Você precisa ser administrador para usar este comando.');
            return;
        }
        
        // Verificar se mencionou alguém
        const mentioned = msg.mentionedIds;
        if (!mentioned || mentioned.length === 0) {
            await msg.reply('❌ Marque o usuário a ser banido.');
            return;
        }
        
        const userToBan = mentioned[0];
        
        try {
            // Apagar mensagens do usuário no grupo
            const messages = await chat.fetchMessages({ limit: 100 });
            const userMessages = messages.filter(m => m.author === userToBan);
            
            for (const message of userMessages) {
                try {
                    await message.delete(true);
                } catch (error) {
                    console.error('Erro ao apagar mensagem:', error);
                }
            }
            
            // Remover usuário do grupo
            await chat.removeParticipants([userToBan]);
            
            // Bloquear contato
            await client.blockContact(userToBan);
            
            await msg.reply(`✅ Usuário banido, ${userMessages.length} mensagens apagadas e contato bloqueado.`);
        } catch (error: any) {
            console.error('Erro ao banir usuário:', error);
            await msg.reply(`❌ Erro ao banir usuário: ${error.message}`);
        }
    }
};