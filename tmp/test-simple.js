// Minimal test - just send + react + quote without testServer
const startTime = Date.now();
const ts = () => `[${Date.now() - startTime}ms]`;

async function main() {
  console.log(`${ts()} === START ===`);
  
  // Manually initialize just the WhatsApp adapter
  const { PlatformManager } = require('/home/solanojr/bot-wpp/dist/platforms/PlatformManager');
  const { BaileysAdapter } = require('/home/solanojr/bot-wpp/dist/platforms/whatsapp/BaileysAdapter');
  
  const pm = PlatformManager.getInstance();
  
  // Create adapter manually
  const adapter = new BaileysAdapter({
    authDir: '/home/solanojr/bot-wpp/data/whatsapp-auth',
    sessionName: 'whatsapp'
  });
  
  await adapter.initialize();
  
  console.log(`${ts()} Adapter initialized: ${adapter.platform}`);
  
  // Send $menu
  console.log(`${ts()} Sending $menu...`);
  const sendResult = await adapter.client.sendMessage('120363410094452673@g.us', '$menu');
  
  const key = sendResult?.key || sendResult;
  
  console.log(`${ts()} WAMessageKey:`, JSON.stringify({
    id: key?.id,
    remoteJid: key?.remoteJid,
    fromMe: key?.fromMe,
    participant: key?.participant,
    participantAlt: key?.participantAlt,
    addressingMode: key?.addressingMode
  }, null, 2));
  
  const msgId = key?.id || sendResult?.id;
  const remoteJid = key?.remoteJid || '120363410094452673@g.us';
  
  // Try REACT
  console.log(`${ts()} Trying react()...`);
  const reactStart = Date.now();
  try {
    await adapter.client.react(msgId, '👍', remoteJid);
    console.log(`${ts()} react() SUCCESS in ${Date.now() - reactStart}ms`);
  } catch (err) {
    console.log(`${ts()} react() ERROR in ${Date.now() - reactStart}ms: ${err.message}`);
  }
  
  // Try REPLY/QUOTE
  console.log(`${ts()} Trying reply/quote...`);
  const replyStart = Date.now();
  try {
    const replyResult = await adapter.client.sendMessage(remoteJid, '🤖 TESTE REPLY/QUOTE', {
      replyToMessageId: msgId,
      quotedFromMe: key?.fromMe,
      quotedParticipant: key?.participant,
    });
    console.log(`${ts()} reply() SUCCESS in ${Date.now() - replyStart}ms`);
    console.log(`${ts()} reply key:`, JSON.stringify(replyResult?.key || {}));
  } catch (err) {
    console.log(`${ts()} reply() ERROR in ${Date.now() - replyStart}ms: ${err.message}`);
  }
  
  console.log(`${ts()} === COMPLETE ===`);
  process.exit(0);
}

main().catch(err => {
  console.error(`${ts()} FATAL:`, err);
  process.exit(1);
});
