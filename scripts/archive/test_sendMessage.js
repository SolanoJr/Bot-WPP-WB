/**
 * Teste estatístico para sendMessage() undefined/false
 * Envia 10 mensagens e coleta estatísticas
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');

const testResults = {
  total: 0,
  success: 0,
  undefined: 0,
  false: 0,
  messageWithoutId: 0,
  times: [],
  retries: [],
  duplicates: 0,
  lost: 0
};

async function runTest() {
  const authPath = path.join(process.cwd(), '.wwebjs_auth_test');
  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    }
  });

  const chatId = 'SEU_CHAT_ID_AQUI@c.us'; // SUBSTITUIR

  client.on('ready', async () => {
    console.log('[TESTE] Cliente pronto como', client.info?.pushname);

    for (let i = 1; i <= 10; i++) {
      const startTime = Date.now();
      console.log(`\n[TESTE] Enviando mensagem ${i}/10...`);
      
      const result = await client.sendMessage(chatId, `Teste ${i} - ${new Date().toISOString()}`);
      const duration = Date.now() - startTime;

      testResults.total++;
      testResults.times.push(duration);

      console.log(`[TESTE] Resultado da mensagem ${i}:`);
      console.log('  typeof result:', typeof result);
      console.log('  result === undefined:', result === undefined);
      console.log('  result === false:', result === false);
      console.log('  result instanceof Message:', result?.constructor?.name === 'Message');
      console.log('  result.id:', result?.id);
      console.log('  result.id._serialized:', result?.id?._serialized);
      console.log('  result.id.id:', result?.id?.id);
      console.log('  duration:', duration, 'ms');

      if (!result) {
        testResults.undefined++;
        console.log('  [RESULTADO] undefined');
      } else if (result === false) {
        testResults.false++;
        console.log('  [RESULTADO] false');
      } else if (result instanceof require('whatsapp-web.js').Message) {
        if (!result.id) {
          testResults.messageWithoutId++;
          console.log('  [RESULTADO] Message sem id');
        } else {
          testResults.success++;
          console.log('  [RESULTADO] Success com id:', result.id._serialized);
        }
      } else {
        console.log('  [RESULTADO] Tipo inesperado:', Object.keys(result));
      }
    }

    console.log('\n=== RELATÓRIO FINAL ===');
    console.log('Total:', testResults.total);
    console.log('Sucesso:', testResults.success);
    console.log('Undefined:', testResults.undefined);
    console.log('False:', testResults.false);
    console.log('Message sem id:', testResults.messageWithoutId);
    console.log('Tempo médio:', testResults.times.reduce((a, b) => a + b, 0) / testResults.times.length, 'ms');
    console.log('Tempo máximo:', Math.max(...testResults.times), 'ms');
    console.log('Tempo mínimo:', Math.min(...testResults.times), 'ms');

    // Limpar e sair
    await client.destroy();
    console.log('[TESTE] Teste concluído');
  });

  client.on('authenticated', () => {
    console.log('[TESTE] Autenticado');
  });

  client.on('auth_failure', (msg) => {
    console.error('[TESTE] Falha na autenticação:', msg);
    process.exit(1);
  });

  client.on('disconnected', () => {
    console.log('[TESTE] Desconectado');
  });

  await client.initialize();
}

runTest().catch(console.error);
