const { initializePlatforms } = require('/home/solanojr/bot-wpp/dist/core/multiPlatform');

const log = [];

function addLog(step, data) {
  const entry = { step, timestamp: Date.now(), ...data };
  log.push(entry);
  console.log(`[${entry.timestamp}] ${step}:`, JSON.stringify(data, null, 2));
  return entry;
}

async function main() {
  try {
    addLog('INIT', { msg: 'Starting test - loading multiPlatform' });
    
    // Initialize platforms
    await initializePlatforms();
    
    addLog('PLATFORMS_INITIALIZED', { msg: 'All platforms ready' });
    
    // Get PM
    const pm = globalThis.__platformManager;
    if (!pm) {
      addLog('ERROR', { msg: 'PlatformManager not found in globalThis' });
      process.exit(1);
    }
    
    const adapter = pm.getAdapter('whatsapp:558581344211');
    if (!adapter) {
      addLog('ERROR', { msg: 'Adapter whatsapp:558581344211 not found' });
      process.exit(1);
    }
    
    addLog('ADAPTER_FOUND', { platform: adapter.platform });
    
    // Send $menu and capture WAMessageKey
    addLog('SEND_START', { chatId: '120363410094452673@g.us', text: '$menu' });
    
    const sendResult = await adapter.client.sendMessage('120363410094452673@g.us', '$menu');
    
    const key = sendResult?.key || sendResult;
    
    addLog('SEND_RESULT', {
      id: key?.id,
      remoteJid: key?.remoteJid,
      fromMe: key?.fromMe,
      participant: key?.participant,
      participantAlt: key?.participantAlt,
      addressingMode: key?.addressingMode,
      fullKey: JSON.stringify(key || {})
    });
    
    const msgId = key?.id || sendResult?.id;
    const remoteJid = key?.remoteJid || '120363410094452673@g.us';
    const chatId = remoteJid.replace('wpp:', '');
    
    // Try REACT
    addLog('REACT_START', { msgId, emoji: '👍', chatId });
    
    const reactStart = Date.now();
    let reactError = null;
    let reactSuccess = false;
    
    try {
      await adapter.client.react(msgId, '👍', chatId);
      reactSuccess = true;
    } catch (err) {
      reactError = err.message;
    }
    
    addLog('REACT_RESULT', {
      success: reactSuccess,
      durationMs: Date.now() - reactStart,
      error: reactError
    });
    
    // Try REPLY/QUOTE with the EXACT same key
    addLog('REPLY_START', {
      chatId,
      replyToMessageId: msgId,
      quotedFromMe: key?.fromMe,
      quotedParticipant: key?.participant,
    });
    
    const replyStart = Date.now();
    let replyError = null;
    let replySuccess = false;
    let replyResultKey = null;
    
    try {
      const replyResult = await adapter.client.sendMessage(chatId, '🤖 *TESTE REPLY/QUOTE* — Resposta automatica do bot citando a mensagem original.', {
        replyToMessageId: msgId,
        quotedFromMe: key?.fromMe,
        quotedParticipant: key?.participant,
      });
      replySuccess = true;
      replyResultKey = replyResult?.key || replyResult;
    } catch (err) {
      replyError = err.message;
    }
    
    addLog('REPLY_RESULT', {
      success: replySuccess,
      durationMs: Date.now() - replyStart,
      error: replyError,
      resultKey: JSON.stringify(replyResultKey || {})
    });
    
    // Summary
    addLog('SUMMARY', {
      reaction: reactSuccess ? 'PASS' : 'FAIL',
      reply: replySuccess ? 'PASS' : 'FAIL',
      reactDurationMs: Date.now() - reactStart,
      replyDurationMs: Date.now() - replyStart,
    });
    
    console.log('\n=== TEST COMPLETE ===');
    console.log(`Reaction: ${reactSuccess ? 'PASS' : 'FAIL'}`);
    console.log(`Reply/Quote: ${replySuccess ? 'PASS' : 'FAIL'}`);
    console.log(`React error: ${reactError || 'none'}`);
    console.log(`Reply error: ${replyError || 'none'}`);
    
    process.exit(0);
    
  } catch (err) {
    addLog('FATAL_ERROR', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

main();
