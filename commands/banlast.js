const { requirePermission, PERMISSIONS } = require('../services/permissions');

module.exports = {
    name: 'banlast',
    description: 'Apaga a última mensagem de um usuário e o bane do grupo (MASTER only)',

    async execute(msg, client, args) {
        // Verificar permissão MASTER
        if (!requirePermission(PERMISSIONS.MASTER)(msg, client, args)) {
            return;
        }

        const chat = await msg.getChat();
        
        if (!chat.isGroup) {
            await msg.reply('❌ Este comando só pode ser usado em grupos.');
            return;
        }

        // Obter o número do usuário a ser banido (argumento ou responder mensagem)
        let targetUser;
        if (args.length > 0) {
            targetUser = args[0];
        } else if (msg.hasQuotedMsg) {
            const quotedMsg = await msg.getQuotedMessage();
            targetUser = quotedMsg.author || quotedMsg.from;
        } else {
            await msg.reply('❌ Use: !banlast <número> ou responda à mensagem do usuário');
            return;
        }

        try {
            // Limpar o ID do usuário
            const cleanTarget = targetUser.replace(/\D/g, '');
            const targetId = cleanTarget.includes('@') ? targetUser : `${cleanTarget}@c.us`;

            console.log(`🎯 [BANLAST] Alvo: ${targetId}`);

            // Obter mensagens recentes do chat
            const messages = await chat.fetchMessages({ limit: 50 });
            
            // Encontrar a última mensagem do alvo
            const lastMessage = messages.find(m => {
                const author = m.author || m.from;
                return author === targetId || author.replace(/\D/g, '') === cleanTarget;
            });

            if (!lastMessage) {
                await msg.reply('❌ Nenhuma mensagem recente encontrada deste usuário.');
                return;
            }

            // Deletar a mensagem
            try {
                await lastMessage.delete(true);
                console.log(`✅ [BANLAST] Mensagem deletada de ${targetId}`);
            } catch (error) {
                console.log(`⚠️ [BANLAST] Falha ao deletar mensagem: ${error.message}`);
            }

            // Banir o usuário
            try {
                await chat.removeParticipants([targetId]);
                await msg.reply(`✅ Usuário ${targetId} banido e última mensagem removida.`);
                console.log(`✅ [BANLAST] Usuário ${targetId} banido do grupo`);
            } catch (error) {
                await msg.reply(`⚠️ Mensagem deletada, mas falha ao banir: ${error.message}`);
                console.error(`❌ [BANLAST] Falha ao banir: ${error.message}`);
            }

        } catch (error) {
            console.error(`❌ [BANLAST] Erro: ${error.message}`);
            await msg.reply(`❌ Erro ao executar comando: ${error.message}`);
        }
    }
};
