#!/bin/bash
# Script de teste: Remover bot spammer do grupo
# Uso: bash laboratorio/test-remover-bot.sh

BOT_NUMBER="5563961512178"
BOT_JID="${BOT_NUMBER}@c.us"
GROUP_ID="202658048684056@lid"

echo "🧪 [TESTE] Removendo bot spammer do grupo"
echo "Bot: $BOT_JID"
echo "Grupo: $GROUP_ID"
echo ""

# 1. Verificar se bot está no grupo
echo "1️⃣ Verificando se bot está no grupo..."
cd /home/solanojr/bot-wpp
node -e "
const { platformManager } = require('./dist/platforms/PlatformManager');
(async () => {
  const whatsapp = platformManager.getAdapter('whatsapp');
  if (whatsapp) {
    const participants = await whatsapp.getGroupParticipants('${GROUP_ID}');
    const botExists = participants.some(p => p.id === '${BOT_JID}');
    console.log(botExists ? '✅ Bot encontrado no grupo' : '❌ Bot não está no grupo');
  }
})();
"

# 2. Banir permanentemente
echo ""
echo "2️⃣ Banindo bot permanentemente..."
node -e "
const { banUser } = require('./dist/services/databaseService');
(async () => {
  await banUser({ 
    groupId: '${GROUP_ID}', 
    userId: '${BOT_JID}', 
    reason: 'bot-spammer-teste-manual' 
  });
  console.log('✅ Bot banido com sucesso');
})();
"

# 3. Remover do grupo
echo ""
echo "3️⃣ Removendo bot do grupo..."
node -e "
const { platformManager } = require('./dist/platforms/PlatformManager');
(async () => {
  const whatsapp = platformManager.getAdapter('whatsapp');
  if (whatsapp) {
    await whatsapp.removeParticipant('${GROUP_ID}', '${BOT_JID}');
    console.log('✅ Bot removido do grupo');
  }
})();
"

echo ""
echo "✅ TESTE CONCLUÍDO!"
echo ""
echo "📊 Verificar nos logs do PM2:"
echo "pm2 logs bot-wpp --lines 50 | grep -i '${BOT_NUMBER}'"
