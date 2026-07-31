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
import { logHealthCheck } from '../services/loggerService';
import { runPreFlightCheck, startMetrics, startLocationPolling } from './bootServices';

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

  await startMetrics();
  runPreFlightCheck().catch((error) => {
    console.error('❌❌❌ [ERRO CRÍTICO NO PREFLIGHT] ❌❌❌');
    console.error(error);
  });

  // Carregar comandos
  const commands = await loadCommands();
  platformManager.loadCommands(commands);
  console.log(`✅ ${commands.size} comandos carregados`);

  // Inicializar WhatsApp
  const whatsappAdapter = new WhatsAppAdapter();
  platformManager.registerAdapter(whatsappAdapter);
  try {
    await withTimeout(
      whatsappAdapter.initialize(),
      120000,
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
      console.log('[Telegram] Iniciando com token:', telegramToken.substring(0, 10) + '...');
      const telegramAdapter = new TelegramAdapter(telegramToken);
      platformManager.registerAdapter(telegramAdapter);
      await withTimeout(
        telegramAdapter.initialize(),
        30000, // Reduzido para 30 segundos para não bloquear outras plataformas
        'Timeout ao inicializar Telegram'
      );
      console.log('✅ Telegram inicializado');
    } catch (error: any) {
      console.error('❌ Erro ao inicializar Telegram:', error.message);
      console.error('❌ Stack:', error.stack);
      // Não falhar completamente se Telegram falhar - continuar com outras plataformas
      console.log('⚠️ Continuando sem Telegram (pode ser restrição de rede/firewall)');
    }
  } else {
    console.log('⚠️ Telegram não configurado (TELEGRAM_BOT_TOKEN não definido)');
  }

  console.log('[DEBUG] Iniciando bloco do Discord...');

  // Inicializar Discord (se token configurado)
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  console.log('[Discord] Verificando token:', discordToken ? discordToken.substring(0, 10) + '...' : 'NÃO DEFINIDO');
  console.log('[Discord] Condição de inicialização:', discordToken && discordToken !== 'seu_token_aqui');
  if (discordToken && discordToken !== 'seu_token_aqui') {
    try {
      console.log('[Discord] Iniciando com token:', discordToken.substring(0, 10) + '...');
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

  // Configurar handlers de mensagem para todos os adapters registrados
  console.log('[PlatformManager] Configurando handlers de mensagem para todos os adapters...');
  const activePlatforms = platformManager.getActivePlatforms();
  for (const platform of activePlatforms) {
    const adapter = platformManager.getClient(platform);
    if (adapter) {
      console.log(`[PlatformManager] Configurando handlers para ${platform}...`);
      // Conectar handler de mensagem ao PlatformManager
      adapter.onMessage(async (msg: any) => {
        msg.platform = platform;
        await (platformManager as any).handleIncomingMessage(msg);
      });
    }
  }

  // Listar plataformas ativas
  const activePlatformsList = platformManager.getActivePlatforms();
  console.log(`📊 Plataformas ativas: ${activePlatformsList.join(', ') || 'Nenhuma'}`);

  // Handler de desconexão
  platformManager.onDisconnected((platform, reason) => {
    console.log(`⚠️ ${platform} desconectado: ${reason}`);
  });

  // Handler de pronto
  platformManager.onReady(() => {
    console.log('🎉 Todas as plataformas prontas!');
    setTimeout(() => startLocationPolling(), 15000);
  });

  // Health check periódico a cada 5 minutos
  const startTime = Date.now();
  setInterval(() => {
    const platforms: Record<string, { online: boolean; uptime?: number }> = {};
    for (const p of ['whatsapp', 'telegram', 'discord'] as const) {
      platforms[p] = {
        online: platformManager.isReady(p),
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };
    }
    logHealthCheck(platforms);
  }, 5 * 60 * 1000);

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
