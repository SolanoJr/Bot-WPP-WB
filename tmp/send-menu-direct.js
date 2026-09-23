const { PlatformManager } = require('./dist/platforms/PlatformManager');
const pm = PlatformManager.getInstance();
const adapter = pm.getAdapter('whatsapp:558581344211');
if (!adapter) { console.log('ADAPTER_NAO_ENCONTRADO'); process.exit(1); }
console.log('Adapter encontrado:', adapter.platform);
adapter.client.sendMessage('120363410094452673@g.us', '$menu')
  .then(r => {
    console.log('Mensagem enviada via WhatsApp. ID:', r?.key?.id || r?.id);
    console.log('Key completa:', JSON.stringify(r?.key || r));
    process.exit(0);
  })
  .catch(e => { console.log('Erro:', e.message); process.exit(1); });
