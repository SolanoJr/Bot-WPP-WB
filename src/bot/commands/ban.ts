import { ICommand } from './types';

export const banCommand: ICommand = {
    name: 'ban',
    description: 'Bane um usuário do grupo, remove suas mensagens e o expulsa.',
    
    async execute(msg, client, args) {
        try {
            const chat = await msg.getChat();
            const { isGroup, participants } = chat;
            
            if (!isGroup) {
                await msg.reply('❌ Este comando só funciona em grupos.');
                return;
            }
            
            // Verificar se o bot é admin
            const botParticipant = participants.find((p: any) => p.isMe);
            const isBotAdmin = botParticipant?.isAdmin || botParticipant?.isSuperAdmin;
            
            if (!isBotAdmin) {
                await msg.reply('❌ O bot precisa ser administrador para usar este comando.');
                return;
            }
            
            // Verificar se mencionou alguém
            const mentioned = msg.mentionedIds;
            if (!mentioned || mentioned.length === 0) {
                await msg.reply('❌ Marque o usuário a ser banido.');
                return;
            }
            
            const userToBan = mentioned[0];
            
            // Verificar se o usuário a ser banido é admin
            const userParticipant = participants.find((p: any) => p.id._serialized === userToBan);
            const isUserAdmin = userParticipant?.isAdmin || userParticipant?.isSuperAdmin;
            
            if (isUserAdmin) {
                await msg.reply('❌ Não é possível banir administradores.');
                return;
            }
            
            let deletedCount = 0;
            
            try {
                // Apagar mensagens do usuário no grupo
                const messages = await chat.fetchMessages({ limit: 100 });
                const userMessages = messages.filter((m: any) => m.author === userToBan);
                
                for (const message of userMessages) {
                    try {
                        await message.delete(true);
                        deletedCount++;
                    } catch (error) {
                        console.error('Erro ao apagar mensagem:', error);
                    }
                }
            } catch (error) {
                console.error('Erro ao buscar mensagens:', error);
            }
            
            try {
                // Remover usuário do grupo
                await chat.removeParticipants([userToBan]);
            } catch (error: any) {
                console.error('Erro ao remover usuário:', error);
                await msg.reply(`⚠️ Erro ao remover usuário: ${error.message}`);
                return;
            }
            
            try {
                // Bloquear contato
                await client.blockContact(userToBan);
            } catch (error) {
                console.error('Erro ao bloquear contato:', error);
            }
            
            await msg.reply(`✅ Usuário banido, ${deletedCount} mensagens apagadas e contato bloqueado.`);
        } catch (error: any) {
            console.error('Erro ao executar comando ban:', error);
            await msg.reply(`❌ Erro ao banir usuário: ${error.message}`);
        }
    }
};