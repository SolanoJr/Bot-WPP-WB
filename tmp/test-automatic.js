// Teste automático: envia $menu e tenta react + quote com a WAMessageKey real
const startTime = Date.now();
const ts = () => `[${(Date.now() - startTime)}ms]`;

async function run() {
  console.log(`${ts()} === INICIO DO TESTE AUTOMATICO ===`);

  // 1. Acessar platformManager global
  const pm = globalThis.__platformManager;
  if (!pm) {
    console.error(`${ts()} ERRO: globalThis.__platformManager nao encontrado`);
    process.exit(1);
  }
  console.log(`${ts()} PlatformManager encontrado`);

  // 2. Obter adapter do WhatsApp
  const adapter = pm.getAdapter('whatsapp:558581344211');
  if (!adapter) {
    console.error(`${ts()} ERRO: Adapter whatsapp:558581344211 nao encontrado`);
    process.exit(1);
  }
  console.log(`${ts()} Adapter encontrado: ${adapter.platform}`);

  // 3. Enviar "$menu" e capturar WAMessageKey real
  console.log(`${ts()} Enviando "$menu" para 120363410094452673@g.us...`);
  const sendStart = Date.now();
  let sendResult;
  try {
    sendResult = await adapter.client.sendMessage('120363410094452673@g.us', '$menu');
    console.log(`${ts()} sendMessage() retornou em ${Date.now() - sendStart}ms`);
  } catch (err) {
    console.error(`${ts()} ERRO no sendMessage(): ${err.message}`);
    process.exit(1);
  }

  // 4. Registrar WAMessageKey retornada
  const key = sendResult?.key || sendResult;
  console.log(`${ts()} WAMessageKey retornada:`);
  console.log(`${ts()}   id: ${key?.id}`);
  console.log(`${ts()}   remoteJid: ${key?.remoteJid}`);
  console.log(`${ts()}   fromMe: ${key?.fromMe}`);
  console.log(`${ts()}   participant: ${key?.participant}`);
  console.log(`${ts()}   participantAlt: ${key?.participantAlt}`);
  console.log(`${ts()}   addressingMode: ${key?.addressingMode}`);
  console.log(`${ts()}   JSON completo: ${JSON.stringify(key)}`);

  // 5. Tentar REACT com a key real
  console.log(`${ts()} Tentando react() com a key real...`);
  const reactStart = Date.now();
  try {
    await adapter.client.react(key?.id || sendResult?.id, '👍', '120363410094452673@g.us');
    console.log(`${ts()} react() retornou em ${Date.now() - reactStart}ms`);
  } catch (err) {
    console.error(`${ts()} ERRO no react(): ${err.message}`);
  }

  // 6. Tentar REPLY/QUOTE com a key real
  console.log(`${ts()} Tentando sendMessage() com quoted usando a key real...`);
  const replyStart = Date.now();
  try {
    const replyResult = await adapter.client.sendMessage('120363410094452673@g.us', '🤖 *TESTE REPLY/QUOTE* — Isso eh um teste de citacao.', {
      replyToMessageId: key?.id,
      quotedFromMe: key?.fromMe,
      quotedParticipant: key?.participant,
    });
    console.log(`${ts()} sendMessage() (reply) retornou em ${Date.now() - replyStart}ms`);
    console.log(`${ts()}   reply result key: ${JSON.stringify(replyResult?.key || {})}`);
  } catch (err) {
    console.error(`${ts()} ERRO no sendMessage() (reply): ${err.message}`);
  }

  console.log(`${ts()} === FIM DO TESTE ===`);
  process.exit(0);
}

run().catch(err => {
  console.error(`${ts()} ERRO FATAL:`, err);
  process.exit(1);
});
