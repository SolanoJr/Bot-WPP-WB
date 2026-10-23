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
import { runPeriodicCleanup } from '../services/autoModEngine';
import { memoryMonitor } from '../services/memoryMonitor';
import { startPeriodicCleanup } from '../services/cleanupService';
import { startNewsScheduler } from '../services/newsScheduler';
import { startFeedbackWorker } from '../services/feedbackWorker';
import { setResponseNotifier } from '../services/feedbackService';
import { createDiscordScreenServiceFromEnv } from '../services/discord-screen/DiscordScreenService';
import { consolidateStale, listPending } from '../services/presentationService';
import { publishToTelegram, retryPending, replyPresentationToGroup } from '../services/presentationPublisher';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { validateMasterConfig } from '../services/permissions';

// 🕒 Logging: o loggerService (Winston) escreve no Console (com timestamp próprio)
// E em arquivos estruturados (logs/combined.log, commands.jsonl, platforms.jsonl).
// O PM2 também prefixa timestamp no log estável (log_date_format no ecosystem.config.js).

// Carregar variáveis de ambiente
dotenv.config();

// Sanidade do MASTER_USER (master fantasma, 19/10): warning APENAS — este
// detector NUNCA bloqueia o boot (o crash-loop de 14/out foi exatamente uma
// validação que derrubava o processo antes do dotenv rodar).
validateMasterConfig();

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
    let telegramAdapter: TelegramAdapter | null = null;
    if (telegramToken && telegramToken.trim() !== '' && telegramToken !== 'seu_token_aqui' && !telegramToken.startsWith('#')) {
      try {
        telegramAdapter = new TelegramAdapter(telegramToken);
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

  // Registra o onReady ANTES de startAll: se o WhatsApp conectar rápido
  // (sessão em cache), o evento 'ready' dispara durante startAll(). Registrar
  // depois perderia o evento — race que deixava scheduler/cleanup/memory
  // monitor sem iniciar. Ver Rodada notícias P5.
  // ⚠️ O 'ready' RE-DISPARA a cada reconnect do WhatsApp (boot 23/10 chegou a
  // 4x). Sem guard, TODO scheduler deste callback duplicava a cada ready —
  // a consolidação de apresentações publicava 2+ cópias no Telegram (o
  // retryPending de um timer irmão pegava o row 'consolidated' durante o
  // picsum download do outro). Schedulers pegam o adapter DINÂMICAMENTE por
  // tick — re-registrar não é preciso; o guard é seguro.
  let schedulersStarted = false;
  platformManager.onReady(() => {
    if (schedulersStarted) {
      logger.warn('[multiPlatform] ready re-disparado (reconnect) — schedulers já ativos, skip');
      return;
    }
    schedulersStarted = true;
    logger.info('🎉 Todas as plataformas prontas!');
      // Iniciar cleanup periódico do autoMod (fingerprints + audit trail)
      startAutoModPeriodicCleanup();
      // Iniciar monitoramento de memória (check a cada 60s)
      memoryMonitor.start(60000);
      // P2.3: Iniciar limpeza periódica (a cada 6h)
      startPeriodicCleanup();
      // Agendador de notícias (tick 60s, envia no horário configurado por grupo)
      startNewsScheduler();

      // ─── INC-016 B: worker de feedback de saída (PV) ───
      // pending → PV (máx 10/exec, cooldown 30d/usuário) → contacted →
      // responded|refused (listener no normalizer) | expired (7 dias).
      try {
        const botNum = (process.env.BOT_NUMBER || '558581344211').replace(/\D/g, '');
        const wpp = platformManager.getAdapter(`whatsapp:${botNum}`);
        const wppClient: any = (wpp as any)?.client;
        if (wppClient?.sendMessage) {
          startFeedbackWorker(async (userId: string, text: string) => {
            try {
              // Espelho de observabilidade PRIMEIRO (independe do resultado do
              // PV): em E2E o alvo é um fake sem WhatsApp/Telegram reais — o
              // fluxo é observado por este espelho. TELEGRAM_FEEDBACK_CHAT_ID
              // vazio em produção = sem espelho (só o PV do alvo).
              const tgMirror = process.env.TELEGRAM_FEEDBACK_CHAT_ID;
              if (tgMirror && telegramAdapter) {
                try {
                  // Mesmo acesso do presentationPublisher (bot.telegram.*)
                  await telegramAdapter.bot.telegram.sendMessage(Number(tgMirror), `📲 [feedback] → ${userId}:\n${text}`);
                } catch (e: any) {
                  logger.warn('[feedbackWorker] espelho Telegram falhou', { error: e?.message });
                }
              }
              await wppClient.sendMessage(userId, { text });
              return true;
            } catch {
              return false;
            }
          });
        } else {
          logger.warn('[feedbackWorker] client WhatsApp indisponível — worker NÃO iniciado');
        }
      } catch (e: any) {
        logger.warn('[feedbackWorker] falha ao iniciar:', e?.message);
      }

      // ─── INC-020: resposta do feedback → privado do dono ───
      // O removido responde no PV do WhatsApp; o dono vê a resposta no
      // Telegram privado (TELEGRAM_ALERT_CHAT_ID). Sem a var, sem notificação.
      try {
        const alertChat = process.env.TELEGRAM_ALERT_CHAT_ID;
        if (alertChat && telegramAdapter) {
          setResponseNotifier(async (ev, response, refused) => {
            const short = response.length > 400 ? response.slice(0, 400) + '…' : response;
            try {
              await telegramAdapter.bot.telegram.sendMessage(
                Number(alertChat),
                `📩 [feedback] resposta de ${ev.user_id} (${refused ? 'recusou' : 'respondeu'}):\n${short}`,
              );
            } catch (e: any) {
              logger.warn('[feedback] notificação da resposta falhou', { error: e?.message });
            }
          });
        }
      } catch (e: any) {
        logger.warn('[feedback] falha ao registrar notificador de resposta:', e?.message);
      }

      // ─── Consolidação de apresentações (Comunidade 085) ───
      // A cada 2 minutos: verifica sessões inativas há 10 min, consolida no SQLite
      // e publica no Telegram (tópico 2). O Telegram é espelho — se falhar, fica
      // com status 'failed' e é retentado.
      setInterval(async () => {
        try {
          const stale = await consolidateStale();
          if (stale.length > 0 && telegramAdapter) {
            for (const { record } of stale) {
              // Busca nome/link do grupo de origem para o cabeçalho
              let groupName: string | undefined;
              let groupLink: string | undefined;
              try {
                const chat = await telegramAdapter.getChat(record.group_id);
                groupName = chat?.name;
                // Link de convite não é trivial; omitimos se não disponível
              } catch { /* ignore */ }

              // Foto da apresentação, quando existe:
              //   photo_source 'url'  → photo_ref É a URL (fonte externa).
              //   photo_source 'sent' → photo_ref é messageId no grupo; o
              //                         Baileys tenta reabrir a mensagem e
              //                         baixar a mídia. Falhou? Publica texto
              //                         puro — foto é enriquecimento, não gate.
              let photo: { url?: string; buffer?: Buffer } | undefined;
              try {
                const botNum = (process.env.BOT_NUMBER || '558581344211').replace(/\D/g, '');
                if (record.photo_source === 'url' && record.photo_ref) {
                  photo = { url: record.photo_ref };
                } else if (record.photo_source === 'sent' && record.photo_ref) {
                  const wpp = platformManager.getAdapter(`whatsapp:${botNum}`);
                  const sock: any = (wpp as any)?.client;
                  const msg = await sock?.loadMessage?.(record.group_id, record.photo_ref);
                  if (msg) {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {});
                    if (buffer) photo = { buffer: Buffer.from(buffer) };
                  }
                }
              } catch { /* sem foto, sem problema */ }

              // ─── Resposta NO GRUPO de origem (PROBLEMA 2 / TESTE 1): quote da
              // última mensagem coletada + template + foto. O canal que o
              // usuário VÊ; o Telegram é espelho. Falha aqui NÃO bloqueia a
              // publicação (o record já está consolidado no SQLite).
              // sock REAL (connection.getSock) — o adapter.client é o Sender,
              // cujo sendMessage(chatId, text, options) não aceita payload
              // Baileys cru ({image, caption}, 3º arg quoted).
              if (record.platform === 'whatsapp') {
                try {
                  const botNum = (process.env.BOT_NUMBER || '558581344211').replace(/\D/g, '');
                  const wpp = platformManager.getAdapter(`whatsapp:${botNum}`);
                  const sock: any = (wpp as any)?.connection?.getSock?.() ?? (wpp as any)?.client;
                  await replyPresentationToGroup(record, sock, photo);
                } catch (e: any) {
                  logger.warn('[presentation] resposta no grupo falhou:', e?.message);
                }
              }

              await publishToTelegram(record, telegramAdapter.bot, groupName, groupLink, photo);
            }
          }
          // Retenta pendentes (falhas anteriores)
          if (telegramAdapter) {
            await retryPending(telegramAdapter.bot);
          }
        } catch (e: any) {
          logger.warn('[presentation] consolidação periódica falhou:', e?.message);
        }
      }, 2 * 60 * 1000).unref();
    });

    await platformManager.startAll();

    // Inicializar Discord Screen Sharing (Activity) se credenciais estiverem configuradas
      try {
        discordScreenService = createDiscordScreenServiceFromEnv();
        if (discordScreenService) {
          await discordScreenService.start();
          logger.info('[DiscordScreenService] Screen sharing iniciado com sucesso');
        } else {
          logger.info('[DiscordScreenService] Não configurado (credenciais ausentes)');
        }
      } catch (error) {
        logError('DiscordScreenService', error);
      }

    // Listar plataformas ativas
  const activePlatforms = platformManager.getActivePlatforms();
  logger.info(`📊 Plataformas ativas: ${activePlatforms.join(', ') || 'Nenhuma'}`);

  // Handler de desconexão
  platformManager.onDisconnected((platform, reason) => {
    logger.warn(`⚠️ ${platform} desconectado: ${reason}`);
  });

  // Handler de desconexão
  platformManager.onDisconnected((platform, reason) => {
    logger.warn(`⚠️ ${platform} desconectado: ${reason}`);
  });

  // P1.2: Graceful shutdown melhorado
  setupGracefulShutdown();
}

// Inicializar
initializePlatforms().catch(error => {
  logError('FatalInit', error);
  process.exit(1);
});

/**
 * Inicia o cleanup periódico do motor de moderação automática.
 * Chama runPeriodicCleanup a cada 15 minutos para manter tabelas de
 * fingerprints e audit trail pequenas.
 */
function startAutoModPeriodicCleanup(): void {
  // já chama uma vez imediatamente para limpar coisas antigas antes do intervalo
  void runPeriodicCleanup().catch((e: any) => {
    logger.warn('[autoMod] cleanup periódico inicial falhou:', e?.message);
  });
  const intervalMs = 15 * 60 * 1000; // 15 min
  setInterval(async () => {
    try {
      await runPeriodicCleanup();
    } catch (e: any) {
      logger.warn('[autoMod] cleanup periódico falhou:', e?.message);
    }
  }, intervalMs).unref();
}

/**
 * P1.2: Graceful Shutdown
 * 
 * Gerencia o encerramento gracioso do bot:
 * - Desconecta todas as plataformas corretamente
 * - Para o monitoramento de memória
 * - Para o servidor de métricas
 * - Previne múltiplas execuções
 * - Timeout de 10s para forçar encerramento
 */
let isShuttingDown = false;
let discordScreenService: ReturnType<typeof createDiscordScreenServiceFromEnv> | null = null;

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn(`[Shutdown] Já está encerrando... Ignorando ${signal}`);
      return;
    }

    isShuttingDown = true;
    logger.info(`🛑 [Shutdown] Recebido ${signal} - iniciando encerramento gracioso...`);

    // Timeout de segurança (10s): força encerramento se travar
    const forceExitTimer = setTimeout(() => {
      logger.error('💀 [Shutdown] Timeout atingido (10s) - forçando encerramento');
      process.exit(1);
    }, 10000);

    try {
      // 1. Parar monitoramento de memória
      logger.info('[Shutdown] Parando monitoramento de memória...');
      memoryMonitor.stop();

      // 2. Parar Discord Screen Sharing
      logger.info('[Shutdown] Parando Discord Screen Sharing...');
      if (discordScreenService) {
        await discordScreenService.stop();
      }

      // 3. Desconectar todas as plataformas
      logger.info('[Shutdown] Desconectando plataformas...');
      await platformManager.shutdownAll();

      // 4. Parar servidor de métricas
      logger.info('[Shutdown] Parando servidor de métricas...');
      await metricsService.stop();

      // 5. Dar tempo para logs finalizarem
      await new Promise(resolve => setTimeout(resolve, 500));

      logger.info('✅ [Shutdown] Encerramento gracioso concluído');
      
      clearTimeout(forceExitTimer);
      process.exit(0);
    } catch (error: any) {
      logger.error('[Shutdown] Erro durante encerramento', { error: error?.message });
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  };

  // SIGINT: Ctrl+C no terminal
  process.on('SIGINT', () => shutdown('SIGINT'));

  // SIGTERM: PM2 reload/stop
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Errors não tratados (última barreira)
  process.on('uncaughtException', (error) => {
    logger.error('💀 [Fatal] Uncaught Exception', { error: error.message, stack: error.stack });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error('💀 [Fatal] Unhandled Rejection', { 
      reason: reason?.message || String(reason),
      stack: reason?.stack
    });
    // Não encerrar em prod para unhandledRejection (apenas logar)
    if (process.env.NODE_ENV !== 'production') {
      shutdown('unhandledRejection');
    }
  });

  logger.info('✅ [Shutdown] Handlers configurados (SIGINT, SIGTERM, uncaughtException, unhandledRejection)');
}
