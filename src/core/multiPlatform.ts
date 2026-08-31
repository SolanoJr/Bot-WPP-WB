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
import logger, { logError } from '../services/loggerService';

// 🕒 Logging: o loggerService (Winston) escreve no Console (com timestamp próprio)
// E em arquivos estruturados (logs/combined.log, commands.jsonl, platforms.jsonl).
// O PM2 também prefixa timestamp no log estável (log_date_format no ecosystem.config.js).

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

  logger.info('🚀 Inicializando Bot-WPP Multi-Platform...');

  // Inicializar servidor de métricas Prometheus (porta 3001, /metrics e /health)
  try {
    await metricsService.start();
    metricsService.startSystemMetricsCollection();
  } catch (error) {
    logError('Metrics', error);
  }

  // Inicializador de testes na porta 3004 (permite injetar comandos via HTTP)
  try {
    startTestServer(3004);
  } catch (e: any) {
    logError('TestServer', e);
  }

  // Carregar comandos com tratamento de erro robusto
  try {
    const commands = loadCommands();
    platformManager.loadCommands(commands);
    logger.info(`✅ ${commands.size} comandos carregados`);
  } catch (error) {
    logError('LoadCommands', error);
    // Continuar mesmo sem comandos para permitir debug
  }

  // Registrar adapters (WhatsApp: 1 sessão legada OU múltiplas via WPP_SESSIONS;
  // Telegram/Discord se token configurado)
  try {
    registerWhatsAppSessions();
  } catch (error) {
    logError('RegisterWhatsApp', error);
  }

  // Inicializar Telegram (se token configurado e válido)
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (telegramToken && telegramToken.trim() !== '' && telegramToken !== 'seu_token_aqui' && !telegramToken.startsWith('#')) {
    try {
      const telegramAdapter = new TelegramAdapter(telegramToken);
      platformManager.registerAdapter(telegramAdapter);
    } catch (error) {
      logError('RegisterTelegram', error);
    }
  } else {
    logger.warn('⚠️ Telegram não configurado (TELEGRAM_BOT_TOKEN não definido ou inválido)');
  }

  // Inicializar Discord (se token configurado e válido)
  const discordToken = process.env.DISCORD_BOT_TOKEN;
  if (discordToken && discordToken.trim() !== '' && discordToken !== 'seu_token_aqui' && !discordToken.startsWith('#')) {
    try {
      const discordAdapter = new DiscordAdapter(discordToken);
      platformManager.registerAdapter(discordAdapter);
    } catch (error) {
      logError('RegisterDiscord', error);
    }
  } else {
    logger.warn('⚠️ Discord não configurado (DISCORD_BOT_TOKEN não definido ou inválido)');
  }

  // Inicializar todas as plataformas E configurar handlers de mensagem (registra o messageHandler
  // que despacha os comandos). O startAll() faz adapter.initialize() + setupAdapterHandlers() para cada adapter.
  await platformManager.startAll();

  // Listar plataformas ativas
  const activePlatforms = platformManager.getActivePlatforms();
  logger.info(`📊 Plataformas ativas: ${activePlatforms.join(', ') || 'Nenhuma'}`);

  // Handler de desconexão
  platformManager.onDisconnected((platform, reason) => {
    logger.warn(`⚠️ ${platform} desconectado: ${reason}`);
  });

  // Handler de pronto
  platformManager.onReady(() => {
    logger.info('🎉 Todas as plataformas prontas!');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('🛑 Encerrando bot...');
    await platformManager.shutdownAll();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('🛑 Encerrando bot...');
    await platformManager.shutdownAll();
    process.exit(0);
  });
}

// Inicializar
initializePlatforms().catch(error => {
  logError('FatalInit', error);
  process.exit(1);
});
