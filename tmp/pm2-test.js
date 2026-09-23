const pm2 = require('pm2');

pm2.connect(function(err) {
  if (err) {
    console.error('PM2 connect error:', err);
    process.exit(1);
  }

  // Execute code in the running bot-wpp process
  const testCode = `
    (async () => {
      const pm = globalThis.__platformManager;
      if (!pm) return JSON.stringify({error: 'NO_PM'});
      const adapter = pm.getAdapter('whatsapp:558581344211');
      if (!adapter) return JSON.stringify({error: 'NO_ADAPTER'});
      
      // Send $menu
      const result = await adapter.client.sendMessage('120363410094452673@g.us', '$menu');
      const key = result?.key || result;
      const msgId = key?.id || result?.id;
      const remoteJid = key?.remoteJid || '120363410094452673@g.us';
      
      // Try react
      let reactResult = 'not_attempted';
      try {
        await adapter.client.react(msgId, '👍', remoteJid);
        reactResult = 'success';
      } catch(e) {
        reactResult = 'error: ' + e.message;
      }
      
      // Try reply
      let replyResult = 'not_attempted';
      try {
        const reply = await adapter.client.sendMessage(remoteJid, 'TESTE REPLY', {
          replyToMessageId: msgId,
          quotedFromMe: key?.fromMe,
          quotedParticipant: key?.participant,
        });
        replyResult = 'success: ' + JSON.stringify(reply?.key || {});
      } catch(e) {
        replyResult = 'error: ' + e.message;
      }
      
      return JSON.stringify({
        sent: { id: msgId, key: key },
        react: reactResult,
        reply: replyResult
      });
    })()
  `;

  pm2.list((err, processes) => {
    if (err) {
      console.error('PM2 list error:', err);
      process.exit(1);
    }
    const bot = processes.find(p => p.name === 'bot-wpp');
    if (!bot) {
      console.error('bot-wpp not found in PM2');
      process.exit(1);
    }
    console.log('Found bot-wpp, PID:', bot.pid);

    // Send a message to the bot via stdin (if it reads from stdin)
    // Or use pm2 trigger if available
    // Alternative: use pm2 programmatic to send data to the process
    
    // Since pm2 trigger is not available, let's try a different approach:
    // Use the /test endpoint but with sendOnly=true
    
    pm2.disconnect();
  });
});
