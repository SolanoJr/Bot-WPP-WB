// Bot automatic test: send $menu, capture real key, try react + quote
const startTime = Date.now();
const ts = () => `[${Date.now() - startTime}ms]`;

async function run() {
  console.log(`${ts()} === AUTOMATIC BOT TEST ===`);

  // Access the existing adapter from PM2's running instance
  // We can't create a new instance (port 3004 conflict), so we access globals
  const pm = globalThis.__platformManager;
  if (!pm) {
    console.error(`${ts()} ERROR: globalThis.__platformManager not found. Run via PM2 exec.`);
    process.exit(1);
  }
  console.log(`${ts()} PlatformManager found`);

  const adapter = pm.getAdapter('whatsapp:558581344211');
  if (!adapter) {
    console.error(`${ts()} ERROR: Adapter not found`);
    process.exit(1);
  }
  console.log(`${ts()} Adapter: ${adapter.platform}`);

  // Step 1: Send $menu and capture WAMessageKey
  console.log(`${ts()} STEP 1: Sending $menu...`);
  const sendStart = Date.now();
  let sendResult;
  try {
    sendResult = await adapter.client.sendMessage('120363410094452673@g.us', '$menu');
    console.log(`${ts()} STEP 1 DONE: sendMessage() took ${Date.now() - sendStart}ms`);
  } catch (err) {
    console.error(`${ts()} STEP 1 FAILED: ${err.message}`);
    process.exit(1);
  }

  // Extract WAMessageKey
  const key = sendResult?.key || sendResult;
  console.log(`${ts()} WAMessageKey returned:`);
  console.log(`${ts()}   id:         ${key?.id}`);
  console.log(`${ts()}   remoteJid:  ${key?.remoteJid}`);
  console.log(`${ts()}   fromMe:     ${key?.fromMe}`);
  console.log(`${ts()}   participant:${key?.participant}`);
  console.log(`${ts()}   full JSON:  ${JSON.stringify(key)}`);

  const msgId = key?.id || sendResult?.id;
  const remoteJid = key?.remoteJid || '120363410094452673@g.us';

  // Step 2: Try REACT with real key
  console.log(`${ts()} STEP 2: react() with real key...`);
  const reactStart = Date.now();
  try {
    await adapter.client.react(msgId, '👍', remoteJid);
    console.log(`${ts()} STEP 2 DONE: react() took ${Date.now() - reactStart}ms`);
  } catch (err) {
    console.error(`${ts()} STEP 2 FAILED: ${err.message}`);
  }

  // Step 3: Try REPLY/QUOTE with real key
  console.log(`${ts()} STEP 3: sendMessage() with quoted...`);
  const replyStart = Date.now();
  try {
    const replyResult = await adapter.client.sendMessage(remoteJid, '🤖 *TESTE REPLY/QUOTE* — Citacao automatica.', {
      replyToMessageId: msgId,
      quotedFromMe: key?.fromMe,
      quotedParticipant: key?.participant,
    });
    console.log(`${ts()} STEP 3 DONE: sendMessage() (reply) took ${Date.now() - replyStart}ms`);
    console.log(`${ts()}   reply result key: ${JSON.stringify(replyResult?.key || {})}`);
  } catch (err) {
    console.error(`${ts()} STEP 3 FAILED: ${err.message}`);
  }

  console.log(`${ts()} === TEST COMPLETE ===`);
  process.exit(0);
}

run().catch(err => {
  console.error(`${ts()} FATAL ERROR:`, err);
  process.exit(1);
});
