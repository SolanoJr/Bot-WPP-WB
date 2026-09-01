/**
 * Script de teste para remover bot spammer do grupo
 * Executa: ban + kick + delete message
 */
import { banUser } from './src/services/databaseService';
import { platformManager } from './src/platforms/PlatformManager';

const BOT_JID = '5563961512178@c.us'; // Bot spammer
const GROUP_ID = '202658048684056@lid'; // Grupo Figurinhas/Stickers
const MESSAGE_ID = 'WAMSG.HBF7CQAAAAAAAAAAGJTU3JHTJEEQGQ'; // ID da mensagem (placeholder)

async function testBotRemoval() {
    console.log('🧪 [TEST] Iniciando teste de remoção de bot...');
    
    try {
        // 1. BAN PERMANENTE
        console.log(`\n1️⃣ Banindo ${BOT_JID}...`);
        await banUser({ 
            groupId: GROUP_ID, 
            userId: BOT_JID, 
            reason: 'bot-spammer-teste-manual' 
        });
        console.log('✅ Bot banido com sucesso');
        
        // 2. REMOVER DO GRUPO
        console.log(`\n2️⃣ Removendo ${BOT_JID} do grupo...`);
        const whatsapp = platformManager.getAdapter('whatsapp');
        if (whatsapp) {
            await whatsapp.removeParticipant(GROUP_ID, BOT_JID);
            console.log('✅ Bot removido do grupo');
        } else {
            console.error('❌ WhatsApp adapter não disponível');
        }
        
        // 3. DELETAR MENSAGEM (se tiver ID)
        console.log(`\n3️⃣ Deletando mensagem ${MESSAGE_ID}...`);
        if (whatsapp && MESSAGE_ID !== 'PLACEHOLDER') {
            await whatsapp.sendMessage(GROUP_ID, '', {
                delete: {
                    id: MESSAGE_ID,
                    fromMe: false,
                    participant: BOT_JID
                }
            });
            console.log('✅ Mensagem deletada');
        } else {
            console.log('⚠️ ID da mensagem não disponível, pulando delete');
        }
        
        console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!');
        
    } catch (error: any) {
        console.error('\n❌ ERRO NO TESTE:', error.message);
        console.error(error);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    testBotRemoval().then(() => process.exit(0)).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}

export { testBotRemoval };
