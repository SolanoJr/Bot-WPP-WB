#!/bin/bash
# Envia "Oi" para o grupo Teste via WhatsApp
# Uso: bash tests/producao/enviar-oi.sh

CHAT_ID="120363410094452673@g.us"
MENSAGEM="Oi"

echo "Enviando '$MENSAGEM' para $CHAT_ID..."

# Usar o endpoint /test com um comando que existe (ex: $ping) mas ignorar a resposta
# O importante é que a mensagem seja enviada

# Método: usar o sendMessageAndProcess via node
cd /home/solanojr/bot-wpp
node -e "
const { platformManager } = require('./dist/platforms/PlatformManager');
const adapter = platformManager.getAdapter('whatsapp');
if (!adapter) { console.log('ERRO: adapter nao encontrado'); process.exit(1); }
console.log('Adapter:', adapter.platform);
adapter.client.sendMessage('$CHAT_ID', '$MENSAGEM')
  .then(() => { console.log('OK: Mensagem enviada'); process.exit(0); })
  .catch(e => { console.log('ERRO:', e.message); process.exit(1); });
"