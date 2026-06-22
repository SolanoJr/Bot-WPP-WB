// Script temporário para remover usuário MI500179 do grupo "figurinhas/stickers"
// e apagar mensagens recentes dele.

const whatsappSingleton = require('../src/services/whatsappSingleton');

const TARGET_USER_ID = '639474500179@c.us'; // formato WhatsApp ID
const TARGET_GROUP_KEYWORD = 'figurinhas'; // parte do nome do grupo

async function run() {
  const client = await whatsappSingleton.getClient();
  console.log('✅ Cliente obtido');

  // Aguarda o cliente estar pronto
  if (!client.info) {
    await new Promise((resolve) => client.once('ready', resolve));
  }

  // Busca o grupo pelo nome (contendo a palavra-chave)
  const chats = await client.getChats();
  const targetChat = chats.find((c) => c.isGroup && c.name && c.name.toLowerCase().includes(TARGET_GROUP_KEYWORD));

  if (!targetChat) {
    console.error('❌ Grupo alvo não encontrado. Verifique o nome.');
    process.exit(1);
  }

  console.log(`✅ Grupo encontrado: ${targetChat.name} (${targetChat.id._serialized})`);

  // Deleta mensagens recentes do usuário (últimas 100 mensagens)
  const messages = await targetChat.fetchMessages({ limit: 100 });
  const userMessages = messages.filter((m) => m.author === TARGET_USER_ID || m.from === TARGET_USER_ID);
  console.log(`🧹 Encontradas ${userMessages.length} mensagens do usuário para deletar.`);
  for (const msg of userMessages) {
    try {
      await msg.delete(true);
    } catch (e) {
      // ignore errors
    }
  }

  // Remove o usuário do grupo
  try {
    await targetChat.removeParticipants([TARGET_USER_ID]);
    console.log('🚪 Usuário removido do grupo.');
  } catch (e) {
    console.error('❌ Falha ao remover usuário:', e.message);
  }

  // Bloqueia o contato (opcional)
  try {
    await client.blockContact(TARGET_USER_ID);
    console.log('🔒 Contato bloqueado.');
  } catch (e) {
    console.error('⚠️ Falha ao bloquear contato:', e.message);
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Erro inesperado:', err);
  process.exit(1);
});
