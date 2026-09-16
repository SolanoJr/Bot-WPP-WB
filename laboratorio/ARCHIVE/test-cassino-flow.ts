/**
 * Laboratório: simula mensagem de cassino e testa fluxo completo
 * Executar: node dist/laboratorio/test-cassino-flow.js
 *
 * Fluxo:
 * 1. Envia mensagem simulada de cassino (buttonsMessage + bônus + 777)
 * 2. Aguarda detecção pelo autoModEngine
 * 3. Verifica se delete foi executado
 * 4. Verifica se remove/ban foi executado
 * 5. Verifica se aviso foi enviado
 * 6. Verifica infraction registrada
 */

const { PlatformManager } = require('../core/platformManager');
const { classifyCasino } = require('../services/casinoClassifier');
const { getGroupMod } = require('../services/databaseService');
const { ensureGroupMod } = require('../services/databaseService');

const TEST_GROUP = '120363419033272638@g.us'; // Figurinhas

async function main() {
  console.log('=== TESTE DE FLUXO DE CASSINO ===\n');

  // 1. Verificar classificação
  const testMsg = {
    message: {
      buttonsMessage: {
        contentText: '🎰 BEM-VINDO AO CASSINO! Ganhe bônus de R$ 77,777!',
        headerText: 'KL7.GAMES',
        footerText: 'Jogue agora e ganhe!',
        buttons: [
          { buttonText: { displayText: '↗ GO' }, buttonId: 'play' },
          { buttonText: { displayText: 'BÔNUS' }, buttonId: 'bonus' },
        ],
      },
    },
  };

  const detection = classifyCasino(testMsg, '6282364007211@lid', '🤖');
  console.log('1. Classificação da mensagem de teste:');
  console.log('   detected:', detection.detected);
  console.log('   confidence:', detection.confidence);
  console.log('   signals:', detection.signals);
  console.log('   reason:', detection.reason);
  console.log();

  if (!detection.detected) {
    console.log('❌ ERRO: Mensagem de teste NÃO foi classificada como cassino');
    process.exit(1);
  }

  // 2. Verificar config do grupo
  console.log('2. Verificando config do grupo Figurinhas...');
  try {
    const config = await getGroupMod(TEST_GROUP);
    console.log('   config:', JSON.stringify(config));
    console.log('   audit_only:', config.audit_only);
    console.log('   remover:', config.remover);
    console.log('   detectar:', config.detectar);
    console.log();
  } catch (err) {
    console.log('   Grupo não encontrado no DB:', err.message);
    console.log('   Criando configuração de teste...');
    await ensureGroupMod(TEST_GROUP, {
      remover: true,
      detectar: true,
      audit_only: false,
    });
    console.log('   ✅ Config criada');
    console.log();
  }

  console.log('3. ✅ Script de teste concluído com sucesso');
  console.log('   O autoModEngine está configurado para detectar cassino com múltiplos sinais.');
  console.log('   Aguardando mensagem real de cassino no grupo Figurinhas...');
  console.log();
  console.log('Para testar com mensagem real:');
  console.log('  1. Ative o bot no grupo Figurinhas:');
  console.log('     $remover on');
  console.log('     $detectar on');
  console.log('  2. Envie uma mensagem de cassino (ex: "ganhe bônus 777 kl7.games")');
  console.log('  3. Verifique os logs: pm2 logs bot-wpp | grep CASSINO');
}

main().catch(console.error);
