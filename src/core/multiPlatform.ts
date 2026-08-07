/**
 * 🔒 WarriorBlack - Multi-Platform Entry Point
 *
 * Inicializa o bot em múltiplas plataformas (WhatsApp, Telegram, Discord)
 * usando o PlatformManager unificado
 */

import dotenv from 'dotenv';
import { platformManager } from '../platforms/PlatformManager';
import { WhatsAppAdapter } from '../platforms/whatsapp/WhatsAppAdapter';
import { TelegramAdapter } from '../platforms/telegram/TelegramAdapter';
import { DiscordAdapter } from '../platforms/discord/DiscordAdapter';
import { loadCommands } from '../bot/commands';
import metricsService from '../services/metricsService';

// Carregar variáveis de ambiente
dotenv.config();

async function initializePlatforms() {
  console.log('🚀 Inicializando Bot-WPP Multi-Platform...');

  // Inicializar servidor de métricas Prometheus (porta 3001, /metrics e /health)
  try {
    await metricsService.start();
    metricsService.startSystemMetricsCollection();
  } catch (error) {
    console.error('❌ Erro ao iniciar métricas:', error);
  }

  // Carregar comandos com tratamento de erro robusto
  try {
    const commands = loadCommands();
    platformManager.loadCommands(commands);
    console.log(`✅ ${commands.size} comandos carregados`);
  } catch (error) {
    console.error('❌ Erro ao carregar comandos:', error);
    // Continuar mesmo sem comandos para permitir debug
  }

  // Inicializar WhatsApp (sempre ativo)
  try {
    const whatsappAdapter = new WhatsAppAdapter();
    platformManager.registerAdapter(whatsappAdapter);
    await whatsappAdapter.initialize();
    console.log('✅ WhatsApp inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar WhatsApp:', error);
  }

  // Inicializar Telegram (se token configurado e válido)
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramToken && telegramToken.trim() !== '' && telegramToken !== 'seu_token_aqui' && !telegramToken.startsWith('#')) {
    try {
      const telegramAdapter = new TelegramAdapter(telegramToken);
      platformManager.registerAdapter(telegramAdapter);
      await telegramAdapter.initialize();
      console.log('✅ Telegram inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar Telegram:', error);
    }
  } else {
    console.log('⚠️ Telegram não configurado (TELEGRAM_BOT_TOKEN não definido ou inválido)');
  }

  // Inicializar Discord (se token configurado e válido)
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken && discordToken.trim() !== '' && discordToken !== 'seu_token_aqui' && !discordToken.startsWith('#')) {
    try {
      const discordAdapter = new DiscordAdapter(discordToken);
      platformManager.registerAdapter(discordAdapter);
      await discordAdapter.initialize();
      console.log('✅ Discord inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar Discord:', error);
    }
  } else {
    console.log('⚠️ Discord não configurado (DISCORD_BOT_TOKEN não definido ou inválido)');
  }

  // Listar plataformas ativas
  const activePlatforms = platformManager.getActivePlatforms();
  console.log(`📊 Plataformas ativas: ${activePlatforms.join(', ') || 'Nenhuma'}`);

  // Handler de desconexão
  platformManager.onDisconnected((platform, reason) => {
    console.log(`⚠️ ${platform} desconectado: ${reason}`);
  });

  // Handler de pronto
  platformManager.onReady(() => {
    console.log('🎉 Todas as plataformas prontas!');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Encerrando bot...');
    await platformManager.shutdownAll();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Encerrando bot...');
    await platformManager.shutdownAll();
    process.exit(0);
  });
}

// Inicializar
initializePlatforms().catch(error => {
  console.error('💥 Erro fatal na inicialização:', error);
  process.exit(1);
});
