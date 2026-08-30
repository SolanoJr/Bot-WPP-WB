/**
 * 🔒 WarriorBlack - Multi-Platform Entry Point
 *
 * Inicializa o bot em múltiplas plataformas (WhatsApp, Telegram, Discord)
 * usando o PlatformManager unificado
 */

import dotenv from 'dotenv';
import { platformManager } from '../platforms/PlatformManager';
import { registerWhatsAppSessions } from '../services/sessionManager';
import { TelegramAdapter } from '../platforms/telegram/TelegramAdapter';
import { DiscordAdapter } from '../platforms/discord/DiscordAdapter';
import { loadCommands } from '../bot/commands';
import metricsService from '../services/metricsService';
import { startTestServer } from '../services/testServer';

// 🕒 Timestamps nos logs: agora são prefixados pelo PM2 (log_date_format no
// ecosystem.config.js). Removido o override de console.* daqui para evitar
// timestamp duplicado (BUG 33 / melhoria de legibilidade).

// Carregar variáveis de ambiente
dotenv.config();

// DNS fixo de processo: contorna o /etc/resolv.conf do servidor quando o DNS
// do PVE/Tailscale (100.100.100.100) cai. Sem isso o Node não resolve
// web.whatsapp.com e o bot fica mudo (ERR_NAME_NOT_RESOLVED). (BUG 36)
import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']); } catch { /* ignore */ }

export async function initializePlatforms() {
  // Expõe o singleton do PlatformManager no global para que o testServer
  // (que é empacotado num escopo de módulo separado pelo bundler) compartilhe
  // a mesma instância com adapters registrados.
  (globalThis as any).__platformManager = platformManager;

  console.log('🚀 Inicializando Bot-WPP Multi-Platform...');

  // Inicializar servidor de métricas Prometheus (porta 3001, /metrics e /health)
  try {
    await metricsService.start();
    metricsService.startSystemMetricsCollection();
  } catch (error) {
    console.error('❌ Erro ao iniciar métricas:', error);
  }

  // Inicializador de testes na porta 3004 (permite injetar comandos via HTTP)
  try {
    startTestServer(3004);
  } catch (e: any) {
    console.error('❌ Erro ao iniciar servidor de testes:', e.message);
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

  // Registrar adapters (WhatsApp: 1 sessão legada OU múltiplas via WPP_SESSIONS;
  // Telegram/Discord se token configurado)
  try {
    registerWhatsAppSessions();
  } catch (error) {
    console.error('❌ Erro ao registrar WhatsApp:', error);
  }

  // Inicializar Telegram (se token configurado e válido)
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramToken && telegramToken.trim() !== '' && telegramToken !== 'seu_token_aqui' && !telegramToken.startsWith('#')) {
    try {
      const telegramAdapter = new TelegramAdapter(telegramToken);
      platformManager.registerAdapter(telegramAdapter);
    } catch (error) {
      console.error('❌ Erro ao registrar Telegram:', error);
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
    } catch (error) {
      console.error('❌ Erro ao registrar Discord:', error);
    }
  } else {
    console.log('⚠️ Discord não configurado (DISCORD_BOT_TOKEN não definido ou inválido)');
  }

  // Inicializar todas as plataformas E configurar handlers de mensagem (registra o messageHandler
  // que despacha os comandos). O startAll() faz adapter.initialize() + setupAdapterHandlers() para cada adapter.
  await platformManager.startAll();

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
