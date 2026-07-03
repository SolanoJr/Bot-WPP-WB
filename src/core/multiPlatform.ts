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

// Carregar variáveis de ambiente
dotenv.config();

// Helper function to add timeout to a promise
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMsg: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMsg)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function initializePlatforms() {
  console.log('🚀 Inicializando Bot-WPP Multi-Platform...');

  // Carregar comandos
  const commands = await loadCommands();
  platformManager.loadCommands(commands);
  console.log(`✅ ${commands.size} comandos carregados`);

  // Inicializar WhatsApp (sempre ativo)
  try {
    const whatsappAdapter = new WhatsAppAdapter();
    platformManager.registerAdapter(whatsappAdapter);
    await withTimeout(
      whatsappAdapter.initialize(),
      60000,
      'Timeout ao inicializar WhatsApp'
    );
    console.log('✅ WhatsApp inicializado');
  } catch (error) {
    console.error('❌ Erro ao inicializar WhatsApp:', error);
  }

  // Inicializar Telegram (se token configurado)
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramToken && telegramToken !== 'seu_token_aqui') {
    try {
      const telegramAdapter = new TelegramAdapter(telegramToken);
      platformManager.registerAdapter(telegramAdapter);
      await withTimeout(
        telegramAdapter.initialize(),
        60000, // Aumentado para 60 segundos
        'Timeout ao inicializar Telegram'
      );
      console.log('✅ Telegram inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar Telegram:', error);
    }
  } else {
    console.log('⚠️ Telegram não configurado (TELEGRAM_BOT_TOKEN não definido)');
  }

  // Inicializar Discord (se token configurado)
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken && discordToken !== 'seu_token_aqui') {
    try {
      const discordAdapter = new DiscordAdapter(discordToken);
      platformManager.registerAdapter(discordAdapter);
      await withTimeout(
        discordAdapter.initialize(),
        30000,
        'Timeout ao inicializar Discord'
      );
      console.log('✅ Discord inicializado');
    } catch (error) {
      console.error('❌ Erro ao inicializar Discord:', error);
    }
  } else {
    console.log('⚠️ Discord não configurado (DISCORD_BOT_TOKEN não definido)');
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

// Exportar para uso externo
export { initializePlatforms };
