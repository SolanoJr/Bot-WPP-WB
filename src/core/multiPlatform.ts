/**
 * 🔒 WarriorBlack - Multi-Platform Entry Point
 *
 * Inicializa o bot em múltiplas plataformas (WhatsApp, Telegram, Discord)
 * usando o PlatformManager unificado
 */

import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

import { platformManager } from '../platforms/PlatformManager';
import { TelegramAdapter } from '../platforms/telegram/TelegramAdapter';
import { DiscordAdapter } from '../platforms/discord/DiscordAdapter';
import { registerWhatsAppSessions } from '../services/sessionManager';
import { loadCommands } from '../bot/commands';
import metricsService from '../services/metricsService';
import { createDiscordScreenServiceFromEnv } from '../services/discord-screen/DiscordScreenService';

// Garante que WPP_AUTOSELFTEST não esteja ativo no processo
// (o valor 1 causa restart em ciclo ~2min)
if (process.env.WPP_AUTOSELFTEST === '1') {
  console.warn('⚠️ WPP_AUTOSELFTEST=1 detectado — desativando para evitar restarts em ciclo');
  delete process.env.WPP_AUTOSELFTEST;
}

let discordScreenService: ReturnType<typeof createDiscordScreenServiceFromEnv> = null;

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
    const commandsMap = await loadCommands();
    platformManager.loadCommands(commandsMap);
  } catch (error) {
    console.error('❌ Erro ao carregar comandos:', error);
  }

  // Inicializar Telegram se token configurado
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramToken) {
    try {
      const telegram = new TelegramAdapter(telegramToken);
      platformManager.registerAdapter(telegram);
      console.log('🤖 Telegram inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao inicializar Telegram:', error);
    }
  } else {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN não definido - Telegram não será iniciado');
  }

  // Inicializar Discord se token configurado
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken) {
    try {
      const discord = new DiscordAdapter(discordToken);
      platformManager.registerAdapter(discord);
      console.log('🎮 Discord inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao inicializar Discord:', error);
    }
  } else {
    console.warn('⚠️ DISCORD_BOT_TOKEN não definido - Discord não será iniciado');
  }

  // Inicializar Discord Screen Sharing (compartilhamento de tela em calls)
  // Usa as mesmas credenciais Discord do bot principal
  discordScreenService = createDiscordScreenServiceFromEnv();
  if (discordScreenService) {
    try {
      await discordScreenService.start();
      console.log('🖥️ Discord Screen Sharing inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao inicializar Discord Screen Sharing:', error);
      discordScreenService = null;
    }
  } else {
    console.log('ℹ️ Discord Screen Sharing desativado (credenciais não configuradas)');
  }

  // Registrar sessões WhatsApp (multi-número via WPP_SESSIONS)
  registerWhatsAppSessions();

  console.log('✅ Todas as plataformas inicializadas');

  console.log('🔧 Plataformas ativas:', platformManager.getActivePlatforms());

  // Iniciar todas as plataformas registradas
  try {
    await platformManager.startAll();
  } catch (error) {
    console.error('❌ Erro ao iniciar plataformas:', error);
  }
}

initializePlatforms().catch((error) => {
  console.error('❌ Erro fatal na inicialização:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('🔄 Recebido SIGINT - encerrando graceful...');
  if (discordScreenService) {
    discordScreenService.stop().catch(console.error);
  }
  platformManager.shutdown().finally(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('🔄 Recebido SIGTERM - encerrando graceful...');
  if (discordScreenService) {
    discordScreenService.stop().catch(console.error);
  }
  platformManager.shutdown().finally(() => {
    process.exit(0);
  });
});