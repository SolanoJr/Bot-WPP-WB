// Standalone test: send message, capture real key, test react + quote
const startTime = Date.now();
const ts = () => `[${Date.now() - startTime}ms]`;

async function main() {
  try {
    console.log(`${ts()} === START ===`);
    
    // Load only the adapter, not the full platform manager
    const { BaileysAdapter } = require('/home/solanojr/bot-wpp/dist/platforms/whatsapp/BaileysAdapter');
    
    const adapter = new BaileysAdapter({
      authDir: '/home/solanojr/bot-wpp/data/whatsapp-auth',
      sessionName: 'whatsapp'
    });
    
    console.log(`${ts()} Initializing adapter...`);
    await adapter.initialize();
    console.log(`${ts()} Adapter ready: ${adapter.platform}`);
    
    // Step 1: Send $menu and capture WAMessageKey
    console.log(`${ts()} STEP 1: Sending $menu...`);
    const sendResult = await adapter.client.sendMessage('120363410094452673@g.us', '$menu');
    
    const key = sendResult?.key || sendResult;
    
    console.log(`${ts()} WAMessageKey returned by Baileys:`);
    console.log(`${ts()}   id:         ${key?.id}`);
    console.log(`${ts()}   remoteJid:  ${key?.remoteJid}`);
    console.log(`${ts()}   fromMe:     ${key?.fromMe}`);
    console.log(`${ts()}   participant:${key?.participant}`);
    console.log(`${ts()}   full JSON:  ${JSON.stringify(key || {})}`);
    
    const msgId = key?.id || sendResult?.id;
    const remoteJid = key?.remoteJid || '120363410094452673@g.us';
    
    // Step 2: Try REACT with exact key from sendResult
    console.log(`${ts()} STEP 2: react() with msgId=${msgId}, chatId=${remoteJid}`);
    const reactStart = Date.now();
    let reactSuccess = false;
    let reactError = null;
    try {
      await adapter.client.react(msgId, '👍', remoteJid);
      reactSuccess = true;
    } catch (err) {
      reactError = err.message;
    }
    console.log(`${ts()} react() result: ${reactSuccess ? 'SUCCESS' : 'FAIL'} in ${Date.now() - reactStart}ms ${reactError ? 'error: ' + reactError : ''}`);
    
    // Step 3: Try REPLY/QUOTE with exact key from sendResult
    console.log(`${ts()} STEP 3: sendMessage() with quoted...`);
    const replyStart = Date.now();
    let replySuccess = false;
    let replyError = null;
    let replyKey = null;
    try {
      const replyResult = await adapter.client.sendMessage(remoteJid, '🤖 *TESTE REPLY/QUOTE* — Citacao automatica.', {
        replyToMessageId: msgId,
        quotedFromMe: key?.fromMe,
        quotedParticipant: key?.participant,
      });
      replySuccess = true;
      replyKey = replyResult?.key || replyResult;
    } catch (err) {
      replyError = err.message;
    }
    console.log(`${ts()} reply() result: ${replySuccess ? 'SUCCESS' : 'FAIL'} in ${Date.now() - replyStart}ms ${replyError ? 'error: ' + replyError : ''}`);
    if (replyKey) {
      console.log(`${ts()}   reply result key: ${JSON.stringify(replyKey)}`);
    }
    
    console.log(`${ts()} === COMPLETE ===`);
    console.log(`Summary: reaction=${reactSuccess ? 'PASS' : 'FAIL'} reply=${replySuccess ? 'PASS' : 'FAIL'}`);
    
    // Keep alive briefly to see if async errors come
    setTimeout(() => process.exit(0), 2000);
    
  } catch (err) {
    console.error(`${ts()} FATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
