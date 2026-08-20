/**
 * 🔒 WarriorBlack - WhatsApp Adapter
 *
 * Wrapper do whatsapp-web.js existente para a interface PlatformAdapter
 */

import { Client, Message, Chat, Contact, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  PlatformType,
  PlatformAdapter,
  PlatformClient,
  PlatformMessage,
  PlatformChat,
  PlatformUser,
  SendOptions,
  MediaPayload,
  MessageHandler
} from './base/PlatformTypes';
import { setWppHealth } from '../../services/healthStore';
import { platformManager } from '../PlatformManager';
import { processAutoMod } from '../../services/autoModService';
import { handleKeywords } from '../../services/keywordHandler';
import { runSelfTestMod } from '../../devtest/selftest';
import { startLocationPoller } from '../../services/locationPoller';

export class WhatsAppAdapter implements PlatformAdapter, PlatformClient {
  readonly platform: PlatformType = 'whatsapp';
  readonly client: PlatformClient;
  private innerClient: Client;
  private messageHandler: MessageHandler | null = null;
  private readyHandler: (() => void) | null = null;
  private disconnectedHandler: ((reason: string) => void) | null = null;
  private isManuallyDestroyed = false;
  private _processedMsgIds = new Set<string>();
  private readyTimeout: ReturnType<typeof setTimeout> | null = null;
  public userId = '';
  public userName = '';
  public isReady = false;
  private lastActivityTs = Date.now();
  private lastConnectAttemptTs = Date.now();
  private qrPending = false;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  /** Diretório de sessão isolado (multi-número). Se omitido, usa WWEBJS_AUTH_DIR ou .wwebjs_auth. */
  private authDir: string;

  constructor(config?: { authDir?: string }) {
    this.authDir = config?.authDir || process.env.WWEBJS_AUTH_DIR || '.wwebjs_auth';
    this.client = this;

    // Encerramento limpo (graceful shutdown)
    const shutdown = (signal: string) => {
      console.log(`[WhatsAppAdapter] Recebido ${signal} - encerrando cliente (client.destroy)...`);
      try {
        this.innerClient.destroy();
      } catch (err: any) {
        console.error(`[WhatsAppAdapter] Erro em client.destroy():`, err?.message);
      }
      this.isManuallyDestroyed = true;
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Cria o client + handlers (pode ser chamado de novo no disconnected p/ reconexao limpa)
    this.connect();
  }

  /**
   * Cria um Client WWebJS fresco e registra TODOS os handlers. Chamado no
   * construtor e novamente a cada 'disconnected' (reconexao limpa). Isso garante
   * que o on('message') SEMPRE exista no client ativo — corrige o WPP mudo apos
   * reconexoes internas do WhatsApp Web que matavam os handlers do client velho.
   */
  private connect(): void {
    this.lastConnectAttemptTs = Date.now();
    const authPath = path.join(process.cwd(), this.authDir);
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    const puppeteerConfig: any = {
      headless: true,
      timeout: 120000,
      protocolTimeout: 180000,
      // Chrome 120 (estável com wwebjs) — instalar via:
      // npx puppeteer browsers install chrome@120
      executablePath: process.env.WWEBJS_CHROME_PATH || '/home/solanojr/.cache/puppeteer/chrome/linux-120.0.6099.109/chrome-linux64/chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--disable-extensions',
        '--disable-gpu-sandbox',
        // Renderização por SOFTWARE (swiftshader) — o WA Web moderno exige WebGL
        // para desenhar a tela de QR; sem isso o Chromium headless trava no
        // splashscreen e nunca gera o QR (BUG 32/33).
        '--use-gl=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        // Estabilidade extra (reduz crash silencioso do Chromium headless):
        '--disable-features=VizDisplayCompositor',
        '--disable-software-rasterizer',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        // DNS explicito: contorna o /etc/resolv.conf do servidor quando o DNS
        // do PVE/Tailscale (100.100.100.100) cai. Sem isso o WA Web nao resolve
        // web.whatsapp.com e o bot fica mudo. (BUG 36)
        '--dns-server=8.8.8.8'
      ]
    };

    // Destroi client anterior (se houver) antes de criar o novo
    try {
      this.innerClient?.destroy?.();
    } catch { /* ignora */ }

    this.innerClient = new Client({
      authStrategy: new LocalAuth({ dataPath: authPath }),
      puppeteer: puppeteerConfig,
      // Reconnecta sozinho em falha de autenticação (sessão expirada / rede mudou)
      // em vez de pedir QR novo e ficar offline. Corrige "bot cai quando chego em casa".
      restartOnAuthFail: true,
      // User-Agent de Chrome real — o WA Web moderno detecta headless e trava
      // a tela de QR sem um UA convincente (BUG 33).
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.109 Safari/537.36'
    });

    this.setupEventHandlers();
    this.registerMessageHandlers();

    // ===== LOGS DE CONEXÃO RICOS (distinguir onde o WPP trava) =====
    this.innerClient.on('qr', (qr: string) => {
      this.qrPending = true;
      console.log(`[CONEXÃO][${new Date().toISOString()}] 📱 QR Code recebido — escaneie para autenticar.`);
      try { qrcode.generate(qr, { small: true }); } catch {}
    });
    this.innerClient.on('authenticated', () => {
      this.qrPending = false;
      console.log(`[CONEXÃO][${new Date().toISOString()}] ✅ Autenticado (sessão LocalAuth restaurada ou novo login).`);
    });
    this.innerClient.on('auth_failure', (reason: string) => {
      console.error(`[CONEXÃO][${new Date().toISOString()}] ❌ AUTH FAILURE: ${reason} — sessão pode estar corrompida.`);
    });
    this.innerClient.on('loading_screen', (pct: number, msg: string) => {
      console.log(`[CONEXÃO][${new Date().toISOString()}] ⏳ Loading ${pct}% — ${msg}`);
    });

    console.log(`[CONEXÃO][${new Date().toISOString()}] 🚀 Chamando client.initialize() (Chromium deve subir)...`);
    this.innerClient.initialize();

    // ===== WATCHDOG: reconecta o WPP sozinho se ele "morrer" (respeita QR pendente) =====
    this.setupWatchdog();

    // ⏱️ TIMEOUT DE DIAGNÓSTICO: se o WA Web não emitir 'ready' em 240s,
    // algo está errado (Chromium travado, sessão corrompida). Com swiftshader
    // o QR demora ~90s pra aparecer, então 90s era falso-positivo (BUG 33).
    // 240s dá margem: o bot autentica normalmente antes disso.
    if (this.readyTimeout) clearTimeout(this.readyTimeout);
    this.readyTimeout = setTimeout(() => {
      if (!this.isReady) {
        console.error('────────────────────────────────────────────────────────');
        console.error('⚠️ [DIAG] WA Web NÃO autenticou em 240s. Verifique o log:');
        console.error('⚠️ [DIAG] - Se apareceu "QR Code recebido", apenas ESCANEIE o QR.');
        console.error('⚠️ [DIAG] - Se NÃO apareceu QR, o Chromium pode estar travado (swiftshader).');
        console.error('⚠️ [DIAG] Correção: rm -rf .wwebjs_auth* + pm2 restart + escanear QR novo.');
        console.error('────────────────────────────────────────────────────────');
      }
    }, 240000);
  }

  /**
   * WATCHDOG: detecta o WPP "morto" e força reconexão sozinho (sem pm2 restart manual).
   * Casos:
   *  - Chromium travado no splash (não emite qr nem ready após 300s do initialize)
   *  - WPP desconecta silenciosamente (isReady=false e sem atividade há >WATCHDOG_DEAD_MS)
   *  - Loop infinito de reconexão (evita ficar restartando sem parar)
   */
  private setupWatchdog(): void {
    if (this.watchdogTimer) return;
    const WATCHDOG_DEAD_MS = 10 * 60 * 1000; // 10min sem atividade => suspeita de morto
    const WATCHDOG_INIT_MS = 180 * 1000;      // 3min sem qr/ready após initialize => Chromium travado
    let cycle = 0;

    this.watchdogTimer = setInterval(async () => {
      try {
        cycle++;
        if (cycle % 5 === 0) console.log(`[WATCHDOG] ciclo ${cycle} — isReady=${this.isReady} sinceAct=${((Date.now()-this.lastActivityTs)/1000)|0}s qrPending=${this.qrPending}`);
        // Mantém o healthStore fresco para o /health do metricsService
        this.getHealth();
        const now = Date.now();
        const sinceActivity = now - this.lastActivityTs;
        const sinceConnect = now - this.lastConnectAttemptTs;

        if (this.isReady) {
          // PRONTO: sonda ativa para provar que o WPP realmente responde.
          // Se o Chromium travou silenciosamente (isReady ainda true), a sonda lança.
          let alive = true;
          try {
            const page = (this.innerClient as any)?.pupPage;
            if (page?.isClosed?.()) alive = false;
            else await Promise.race([
              Promise.resolve(this.innerClient.getWWebVersion?.()),
              new Promise((_, rej) => setTimeout(() => rej(new Error('sonda timeout')), 4000)),
            ]);
          } catch {
            alive = false;
          }
          if (!alive) {
            console.error(`[WATCHDOG] WPP marcado 'ready' mas sonda falhou (Chromium travado silenciosamente). Reconectando...`);
            this.forceReconnect('sonda-falhou');
            return;
          }
          if (sinceActivity > WATCHDOG_DEAD_MS) {
            console.error(`[WATCHDOG] WPP 'ready' mas sem atividade há ${(sinceActivity/60000)|0}min. Reconectando...`);
            this.forceReconnect('inatividade');
          }
          return;
        }

        // Não está ready:
        if (this.qrPending) {
          console.log(`[WATCHDOG] QR pendente aguardando scan do dono (não reconecto para não invalidar o QR).`);
          return;
        }
        if (sinceConnect > WATCHDOG_INIT_MS) {
          console.error(`[WATCHDOG] WPP não deu ready nem QR em ${(sinceConnect/1000)|0}s desde o initialize — Chromium provavelmente travado. Reconectando...`);
          this.forceReconnect('chromium-travado');
        }
      } catch (e: any) {
        console.error(`[WATCHDOG] erro no loop: ${e?.message}`);
      }
    }, 60 * 1000); // checa a cada 1min
    // Não prende o event loop se o bot sair:
    (this.watchdogTimer as any).unref?.();
  }

  private forceReconnect(reason: string): void {
    console.error(`[WATCHDOG] forceReconnect(${reason}) — destruindo client e recriando...`);
    const ownerId = process.env.MASTER_USER || '5588998314322@c.us';
    // Alerta o dono que o WPP caiu e está reconectando (só se já estava conectado antes)
    if (this.isReady) {
      this.notifyOwner(`⚠️ *WPP caiu* (${reason}). Reconectando automaticamente...`).catch(() => {});
    }
    try { this.innerClient?.destroy?.(); } catch {}
    this.isReady = false;
    this.lastConnectAttemptTs = Date.now();
    // reconecta limpo (recria Client com handlers frescos)
    setTimeout(() => this.connect(), 2000);
  }

  /** Envia uma mensagem de alerta para o dono (MASTER) via WPP. */
  async notifyOwner(text: string): Promise<void> {
    // Prefere MASTER_LID (formato que o WPP moderno aceita, igual à msg de prova).
    // CAI no MASTER_USER se não definido. Timeout de 5s evita promise pendurada.
    const ownerId = process.env.MASTER_LID || process.env.MASTER_USER || '5588998314322@c.us';
    console.log(`[notifyOwner] 📤 chamado para ${ownerId}: ${text.slice(0, 30)}`);
    try {
      await Promise.race([
        this.innerClient.sendMessage(ownerId, text),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 5s')), 5000)),
      ]);
      console.log(`[notifyOwner] ✅ alerta enviado ao dono (${ownerId}): ${text.slice(0, 40)}`);
    } catch (e: any) {
      console.error(`[notifyOwner] ❌ falha ao avisar dono (${ownerId}): ${e?.message}`);
    }
  }

  /** Status de saúde para healthcheck (diferencia PM2 online de WPP conectado). */
  getHealth(): Record<string, any> {
    const h = {
      pm2: 'online' as const,
      wpp: this.isReady ? 'connected' as const : (this.qrPending ? 'awaiting-qr' as const : 'disconnected' as const),
      sinceActivitySec: Math.round((Date.now() - this.lastActivityTs) / 1000),
      sinceConnectSec: Math.round((Date.now() - this.lastConnectAttemptTs) / 1000),
      qrPending: this.qrPending,
    };
    setWppHealth(h);
    return h;
  }

  /**
   * TESTE: simula uma mensagem de TERCEIRO (author != bot) chegando no dispatcher.
   * Usado pelo selftest para provar que o ctx.reply responde a terceiros (não só ao próprio bot).
   */
  async simulateThirdPartyCommand(authorId: string, cmd: string): Promise<void> {
    const chatId = process.env.WPP_TEST_GROUP_ID || '120363410094452673@g.us';
    // Busca uma mensagem REAL do grupo para usá-la como citada (prova o quote/reply de verdade)
    let quotedId: string | undefined;
    try {
      const chat = await this.innerClient.getChatById(chatId);
      const msgs = await chat.fetchMessages({ count: 1 });
      if (msgs && msgs[0]?.id?._serialized) quotedId = msgs[0].id._serialized;
    } catch { /* ignora */ }
    const id = quotedId || `sim_${Date.now()}`;
    const fakeMsg: any = {
      id: `wpp:${id}`,
      platform: 'whatsapp',
      chatId: `wpp:${chatId}`,
      userId: `wpp:${authorId}`,
      userName: 'TesteTerceiro',
      text: `$${cmd}`,
      isGroup: true,
      fromMe: false,
      author: authorId,
      from: chatId,
      raw: { react: async () => {}, id: { _serialized: id } },
      timestamp: Date.now(),
    };
    console.log(`[SELFTEST-SIM] mandando $${cmd} como TERCEIRO ${authorId} (citando msg real ${id})`);
    if (this.messageHandler) await this.messageHandler(fakeMsg);
  }


  private setupEventHandlers(): void {
    this.innerClient.on('qr', (qr: string) => {
      console.log('[WhatsApp] 🔑 QR Code recebido — ESCANEIE com seu WhatsApp (App > Dispositivos conectados):');
      console.log('[WhatsApp] ⚠️ Bot AINDA NÃO está online. Ele só fica online após escanear o QR ou restaurar a sessão.');
      qrcode.generate(qr, { small: true });
      console.log('[WhatsApp] (Se não precisar escanear, a sessão foi restaurada do cache LocalAuth.)');
    });

    this.innerClient.on('authenticated', () => {
      console.log('[WhatsApp] 🔓 Sessão autenticada com sucesso (LocalAuth restaurado ou novo login).');
    });

    this.innerClient.on('auth_failure', (msg: string) => {
      console.error(`[WhatsApp] ❌ Falha de autenticação: ${msg}`);
      console.error('[WhatsApp] A sessão pode estar inválida; pode ser necessário limpar .wwebjs_auth e reescaneear o QR.');
    });

    this.innerClient.on('change_state', (state: string) => {
      console.log(`[WhatsApp] 🔄 Mudança de estado da conexão: ${state}`);
      // WWebJS reconecta internamente via change_state sem repetir 'ready';
      // re-registra handlers de mensagem para nao ficar mudo apos reconexao.
      if (state === 'CONNECTED') {
        this.registerMessageHandlers();
        // AUTO-TESTE: roda 1x quando o WA conecta (o 'ready' nao dispara em sessao restaurada).
        if (!(this as any)._selftestRan) {
          (this as any)._selftestRan = true;
          const alvoTesteSelftest = process.env.WPP_TEST_GROUP_ID || '';
          console.log('[DIAG] change_state CONNECTED -> alvoTeste =', JSON.stringify(alvoTesteSelftest));
          if (alvoTesteSelftest) {
            setTimeout(() => runSelfTestMod(this, alvoTesteSelftest).catch(() => {}), 6000);
          }
        }
      }
    });

    // Diagnostico WPP mudo: logar QUALQUER evento que o WhatsApp empurre
    this.innerClient.on('message_ack', (m: any, a: any) => console.log(`[DIAG] message_ack disparou - from: ${m?.from} ack: ${a}`));
    this.innerClient.on('incoming_call', (c: any) => console.log(`[DIAG] incoming_call disparou - ${c?.from}`));
    this.innerClient.on('message_revoke_everyone', (msg: any, revokedMsg: any) => {
      try {
        const author = revokedMsg?.author || revokedMsg?.from || msg?.author || msg?.from || 'desconhecido';
        const body = revokedMsg?.body || revokedMsg?._data?.body || revokedMsg?._data?.conversation || '(sem texto)';
        const chat = revokedMsg?.from || msg?.from || '';
        console.log(`[DIAG] message_revoke_everyone - quem apagou=${author} chat=${chat} conteudo="${String(body).slice(0,100)}"`);
      } catch (e: any) {
        console.log(`[DIAG] message_revoke_everyone disparou (sem detalhe: ${e?.message})`);
      }
    });
    this.innerClient.on('group_update', () => console.log(`[DIAG] group_update disparou`));

    this.innerClient.on('ready', () => {
      // Cancela o timeout de diagnóstico (conexão realmente estabelecida)
      if (this.readyTimeout) { clearTimeout(this.readyTimeout); this.readyTimeout = null; }
      this.isReady = true;
      this.lastActivityTs = Date.now();
      this.lastConnectAttemptTs = Date.now();
      this.qrPending = false;
      this.userId = this.innerClient.info?.wid._serialized || '';
      this.userName = this.innerClient.info?.pushname || 'Bot-WPP';
      console.log(`[WhatsApp] ✅ Pronto como ${this.userName} (${this.userId})`);

      // Alerta o dono que o WPP reconectou (healthcheck pró-ativo — BUG 43/45)
      this.notifyOwner(`✅ *WPP reconectado* como ${this.userName}. Bot operante.`).catch(() => {});
      // Atualiza o healthStore (usado pelo /health do metricsService)
      this.getHealth();
      
      // O AutoMod agora é processado via messageHandler.ts para maior controle
      console.log('[WhatsApp] 🛡️ Sistema de AutoMod (via Handler) pronto');
      
      // (Re)Registra handlers de mensagem em CADA reconexão (corrige WPP mudo
      // após reconexão do WhatsApp Web, quando o client interno é recriado).
      this.registerMessageHandlers();

      // Prova de ENVIO: ao ficar pronto, manda msg de "online" pro num do dono
      // e pro grupo "teste". So consideramos WPP online apos ambas chegarem.
      const alvoDono = '558581344211@c.us';
      const alvoTeste = process.env.WPP_TEST_GROUP_ID || '';
      console.log('[DIAG] alvoTeste =', JSON.stringify(alvoTeste), '| WPP_TEST_GROUP_ID env =', JSON.stringify(process.env.WPP_TEST_GROUP_ID));
      const msgOnline = '🤖 WPP online (WarriorBlack). Conexão restabelecida e enviando esta mensagem como prova de funcionamento.';
      this.sendMessage(alvoDono, msgOnline)
        .then(() => console.log('[WhatsApp] ✅ Mensagem de prova ENVIADA para', alvoDono))
        .catch((e: any) => console.error('[WhatsApp] ❌ Falha ao enviar msg de prova para dono:', e?.message));
      if (alvoTeste) {
        this.sendMessage(alvoTeste, msgOnline)
          .then(() => console.log('[WhatsApp] ✅ Mensagem de prova ENVIADA para grupo teste', alvoTeste))
          .catch((e: any) => console.error('[WhatsApp] ❌ Falha ao enviar msg de prova para grupo teste:', e?.message));
        // Diagnostico: logar participants do grupo teste com isAdmin (ver se bot/Alberto sao admins)
        setTimeout(async () => {
          try {
            const grp = await this.innerClient.getChatById(alvoTeste);
            const me = this.innerClient.info.wid._serialized;
            console.log(`[DIAG grupo teste] me=${me} participants=${JSON.stringify((grp.participants||[]).map(p=>({id:p.id._serialized, isAdmin:p.isAdmin, isSuperAdmin:p.isSuperAdmin})))}`);
          } catch (e: any) { console.error('[DIAG grupo teste] erro:', e?.message); }
        }, 4000);
      } else {
        console.log('[WhatsApp] ⚠️ WPP_TEST_GROUP_ID nao definido - pulando msg de prova no grupo teste');
      }

      // FALLBACK: em sessão restaurada o WWebJS não emite 'ready' nem 'change_state'.
      // Dispara o selftest 30s após o boot (o WA já está conectado e pode enviar).
      // O guard interno __selftestModRan evita duplo-run em reconexões/PM2 restart.
      if (alvoTeste && !(global as any).__selftestFallbackRan) {
        (global as any).__selftestFallbackRan = true;
        setTimeout(() => runSelfTestMod(this, alvoTeste).catch(() => {}), 30000);
      }

      // Alerta o dono que o WPP reconectou (garante mesmo em sessão restaurada
      // onde o 'ready' não dispara — BUG 43/45 healthcheck pró-ativo)
      this.notifyOwner(`✅ *WPP reconectado* como ${this.userName}. Bot operante.`).catch(() => {});

      // AUTO-TESTE em produção (kit do Hermes em src/devtest/selftest.ts — NÃO apagar).
      // Roda a lista de comandos (1x cada) no grupo teste, sem encher (1 por vez, espaçado).
      if (alvoTeste) {
        setTimeout(() => runSelfTestMod(this, alvoTeste).catch(() => {}), 6000);
      }
      const hbChat = process.env.HEARTBEAT_CHAT;
      const hbUrl = process.env.HEARTBEAT_URL;
      if (hbChat || hbUrl) {
        try {
          let hash = 'local';
          try { hash = execSync('git rev-parse --short HEAD', { cwd: process.cwd() }).toString().trim(); } catch { /* ignore */ }
          const plats = platformManager.getActivePlatforms();
          const payload = {
            bot: this.userId,
            commit: hash,
            platforms: plats,
            uptime: Math.floor(process.uptime()),
          };
          if (hbChat) {
            const ping = `💓 [HEARTBEAT] bot=${this.userId} commit=${hash} plataformas=[${plats.join(', ')}] uptime=${payload.uptime}s`;
            this.sendMessage(hbChat, ping).catch(() => {});
          }
          if (hbUrl) {
            fetch(hbUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }).catch(() => {});
          }
        } catch { /* ignore */ }
      }
      
      if (this.readyHandler) this.readyHandler();
      // Inicia o poller de localização (recebe localização do relay e responde no chat).
      // Só uma vez (startLocationPoller tem guard interno).
      startLocationPoller(5000);
      // Auto-teste: roda a lista de comandos (1x cada) no grupo teste.
      if (alvoTeste) {
        setTimeout(() => runSelfTestMod(this, alvoTeste).catch(() => {}), 6000);
      }
    });

    this.innerClient.on('disconnected', (reason: string) => {
      this.isReady = false;
      console.log(`[WhatsApp] 🔌 Desconectado: ${reason}`);
      if (this.disconnectedHandler) this.disconnectedHandler(reason);
      // Aviso de OFFLINE pro dono e grupo teste (ele pediu para saber qndo cai)
      const msgOffline = `🔴 WPP OFFLINE (WarriorBlack). Motivo: ${reason}. Reconectando...`;
      this.sendMessage('558581344211@c.us', msgOffline).catch(() => {});
      const grpTeste = process.env.WPP_TEST_GROUP_ID;
      if (grpTeste) this.sendMessage(grpTeste, msgOffline).catch(() => {});
      // Reconexao limpa: recria o Client com handlers frescos (corrige WPP mudo).
      // So pula se foi encerramento manual (SIGINT/SIGTERM).
      if (!this.isManuallyDestroyed) {
        console.log(`[WhatsApp] ♻️ Reconectando (nova instancia de Client)...`);
        setTimeout(() => this.connect(), 3000);
      }
    });

    // Evento de entrada de novos membros no grupo
    this.innerClient.on('group_join', async (notification: any) => {
      try {
        await this.handleMemberJoin(notification);
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar entrada de membro:', error);
      }
    });

    // Evento de SAÍDA de membros (loga quem saiu/foi removido — antes não era registrado)
    this.innerClient.on('group_leave', async (notification: any) => {
      try {
        const groupId = notification.chatId || notification.id?.remote;
        const left = notification.recipientIds || notification.recipients || notification.participants || [];
        console.log(`[handleMemberLeave] saída no grupo ${groupId} - membros: ${JSON.stringify(left)}`);
        for (const m of left) {
          console.log(`[handleMemberLeave] ${m.replace('@lid','').replace('@c.us','')} saiu/foi removido do grupo ${groupId}`);
        }
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar saída de membro:', error);
      }
    });

    // Fallback: monitorar mudanças de participantes
    this.innerClient.on('group_update', async (notification: any) => {
      try {
        if (notification.type === 'add') {
          await this.handleMemberJoin(notification);
        } else if (notification.type === 'remove' || notification.type === 'leave') {
          const groupId = notification.chatId || notification.id?.remote;
          const removed = notification.recipientIds || notification.recipients || notification.participants || [];
          console.log(`[handleMemberLeave] group_update type=${notification.type} grupo=${groupId} membros=${JSON.stringify(removed)}`);
        }
      } catch (error) {
        console.error('[WhatsApp] Erro ao processar atualização de grupo:', error);
      }
    });
  }

  /**
   * (Re)Registra os handlers de mensagem. Chamado no 'ready' (que dispara em
   * CADA reconexão do WWebJS) para garantir que o on('message') não morra quando
   * o client interno é recriado na reconexão. O off() previo evita duplicação.
   */
  private registerMessageHandlers(): void {
    // removeAllListeners(event) nao exige listener (off(event, listener) sim, e
    // quebra com undefined). Usado para nao duplicar em multiplos 'ready'.
    this.innerClient.removeAllListeners?.('message');
    this.innerClient.removeAllListeners?.('message_create');

    this.innerClient.on('message', async (msg: Message) => {
      this.lastActivityTs = Date.now();
      console.log('[WhatsAppAdapter] Mensagem recebida - msg:', !!msg, 'msg.from:', msg?.from, 'msg.author:', msg?.author);
      // Auditoria: confirma se o bot está lendo msgs de TERCEIROS (não só as próprias)
      if (msg?.from && !msg?.fromMe && msg?.author && !String(msg.author).includes('558581344211')) {
        console.log(`[AUDIT] msg de TERCEIRO recebida: de=${msg.author} chat=${msg.from} body="${(msg.body||'').slice(0,60)}"`);
      }
      
      // Diagnostico: se o body vier vazio, logar o _data cru para achar o texto real
      if (!msg?.body && (msg as any)?._data) {
        const d = (msg as any)._data;
        console.log('[DIAG] msg.body vazio. type:', msg?.type, '| _data.body:', d?.body, '| _data.conversation:', d?.conversation, '| _data.data:', typeof d?.data === 'object' ? JSON.stringify(d.data).slice(0,200) : d?.data, '| _data.keys:', Object.keys(d||{}).slice(0,20).join(','));
      }
      
      // Dedup: evita processar 2x se WWebJS emitir 'message' e 'message_create' p/ mesma msg
      const mid = msg?.id?._serialized || msg?.id?.id;
      if (mid && this._processedMsgIds.has(mid)) return;
      if (mid) this._processedMsgIds.add(mid);
      
      if (!msg) {
        console.error('[WhatsAppAdapter] ERRO: msg é null/undefined, ignorando');
        return;
      }
      
      if (!msg.id) {
        console.error('[WhatsAppAdapter] ERRO: msg não tem id, ignorando - msg type:', typeof msg);
        return;
      }
      
      // handleKeywords (sarcasmo) roda ANTES do processAutoMod: o processAutoMod
      // travava silenciosamente em msg.getChat() para @lid (Issue #201838), bloqueando
      // o sarcasmo. Agora o getChat do AutoMod tem timeout de 4s. Rodamos direto (await)
      // para garantir que o fluxo e os logs executem no handler.
      try {
        const intercepted = await handleKeywords(msg, this.innerClient);
        if (intercepted) {
          console.log(`😏 [WhatsAppAdapter] Palavra-chave detectada, resposta enviada`);
        } else {
          const moderated = await processAutoMod(msg, this.innerClient);
          if (moderated) {
            console.log(`🛡️ [WhatsAppAdapter] Mensagem moderada e deletada de ${msg.author || msg.from}`);
          }
        }
      } catch (err: any) {
        console.error(`[WhatsAppAdapter] Erro em AutoMod/Keywords (nao bloqueante):`, err?.message);
      }

      if (this.messageHandler) {
        try {
          const platformMsg = await this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error(`[WhatsAppAdapter] Erro ao normalizar mensagem:`, normError.message);
          console.error(`[WhatsAppAdapter] Stack:`, normError.stack);
        }
      }
    });

    // Expõe handleKeywords para o selftest chamar a MESMA cópia do adapter
    // (evita import dinâmico que pode resolver módulo desatualizado).
    (this as any).selfTestHandleKeywords = async (msg: any) => handleKeywords(msg, this.innerClient);


    this.innerClient.on('message_create', async (msg: Message) => {
      if (!msg) {
        console.error('[WhatsAppAdapter] message_create: msg é null/undefined, ignorando');
        return;
      }
      
      if (!msg.id) {
        console.error('[WhatsAppAdapter] message_create: msg não tem id, ignorando');
        return;
      }
      
      // Dedup: evita processar 2x se WWebJS emitir 'message' e 'message_create' p/ mesma msg
      const mid = msg?.id?._serialized || msg?.id?.id;
      if (mid && this._processedMsgIds.has(mid)) return;
      if (mid) this._processedMsgIds.add(mid);
      
      // handleKeywords (sarcasmo) também no message_create: quando o PRÓPRIO bot
      // manda "bot" (teste do Hermes), o WWebJS emite message_create (não message),
      // e o handleKeywords precisa rodar aqui para capturar e dar reply.
      try {
        const intercepted = await handleKeywords(msg, this.innerClient);
        if (intercepted) {
          console.log(`😏 [WhatsAppAdapter] Palavra-chave detectada (message_create), resposta enviada`);
          return; // sarcasmo tratou; não roda comando/AutoMod por cima
        }
        // AutoMod também roda aqui (mesma razão: message_create cobre msgs do próprio bot
        // e, em alguns casos, msgs de membros dependendo da versão do WWebJS)
        const moderated = await processAutoMod(msg, this.innerClient);
        if (moderated) {
          console.log(`🛡️ [WhatsAppAdapter] Mensagem moderada e deletada (message_create) de ${msg.author || msg.from}`);
        }
      } catch (err: any) {
        console.error(`[WhatsAppAdapter] Erro em handleKeywords/AutoMod (message_create):`, err?.message);
      }

      if (this.messageHandler) {
        try {
          const platformMsg = await this.normalizeMessage(msg);
          await this.messageHandler(platformMsg);
        } catch (normError: any) {
          console.error(`[WhatsAppAdapter] Erro ao normalizar message_create:`, normError.message);
        }
      }
    });
  }

  private async handleMemberJoin(notification: any): Promise<void> {
    try {
      console.log('[handleMemberJoin] ENTRY - notification:', !!notification);
      const groupId = notification.chatId || notification.id.remote;
      const newMembers = notification.recipientIds || notification.recipients || [];
      
      console.log('[WhatsApp] Novo(s) membro(s) entrando:', { groupId, members: newMembers });

      // Registrar o horário de entrada de cada membro para controle de DDI no AutoMod
      try {
        console.log('[handleMemberJoin] Chamando recordMemberJoin...');
        const { recordMemberJoin } = await import('../../services/autoModService');
        for (const memberId of newMembers) {
          console.log('[handleMemberJoin] Registrando membro:', memberId);
          recordMemberJoin(groupId, memberId);
        }
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao registrar entrada de membro para AutoMod:', err.message);
        console.error('[WhatsApp] Erro stack:', err.stack);
      }

      // Verificar se algum membro está BANIDO (persistência) e remover automaticamente
      try {
        const { isUserBanned } = await import('../../services/databaseService');
        for (const memberId of newMembers) {
          const cleanMember = memberId.replace('@lid', '@c.us');
          const banned = await isUserBanned(cleanMember, groupId);
          if (banned) {
            console.log(`[handleMemberJoin] ${memberId} está BANIDO - removendo automaticamente`);
            try {
              await this.removeParticipant(groupId, memberId);
              await this.innerClient.sendMessage(groupId, `🚫 @${memberId.split('@')[0]} foi banido anteriormente e não pode entrar neste grupo.`, {
                mentions: [memberId]
              }).catch(() => {});
            } catch (rmErr: any) {
              console.error('[handleMemberJoin] Falha ao remover banido que entrou:', rmErr?.message);
            }
          }
        }
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao verificar banidos na entrada:', err.message);
      }

      // Verificar se algum membro é ESTRANGEIRO (DDI não-BR) e o antiestrangeiro está ligado:
      // remove na HORA, antes do bot de cassino postar o card invisível (que o WWebJS não lê).
      try {
        const { getGroupMod } = await import('../../services/databaseService');
        const { isForeignNumber, isBotByPattern } = await import('../../services/autoModService');
        const mod = await getGroupMod(groupId);
        for (const memberId of newMembers) {
          const cleanMember = memberId.replace('@lid', '').replace('@c.us', '');
          const pushname = notification?.pushname || notification?.recipientIds?._contact?.pushname || '';
          let shouldRemove = false;
          let motive = '';
          // ANTIBOTS (ligado em todos): remove BOT por prefixo de número/nome
          if (mod.antibotas && isBotByPattern(memberId, pushname)) {
            shouldRemove = true;
            motive = '🤖 BOT detectado por prefixo (número/nome) — removido automaticamente.';
          }
          // ANTIESTRANGEIRO (desligado por padrão): remove QUALQUER não-BR (uso manual)
          else if (mod.antiestrangeiro && isForeignNumber(memberId)) {
            shouldRemove = true;
            motive = '🚫 Número estrangeiro não permitido neste grupo.';
          }
          if (shouldRemove) {
            console.log(`[handleMemberJoin] ${cleanMember} entrou - ${motive}`);
            try {
              await this.removeParticipant(groupId, memberId);
              await this.innerClient.sendMessage(groupId, `🚫 @${cleanMember} removido automaticamente: ${motive}`, {
                mentions: [memberId.replace('@lid', '@c.us')]
              }).catch(() => {});
            } catch (rmErr: any) {
              console.error('[handleMemberJoin] Falha ao remover na entrada:', rmErr?.message);
            }
          }
        }
      } catch (err: any) {
        console.error('[WhatsApp] Erro ao verificar estrangeiros na entrada:', err.message);
      }

      // Importar função para obter mensagem personalizada
      const { getWelcomeMessage } = await import('../../bot/commands/welcome');
      const customMessage = getWelcomeMessage(groupId);

      // Boas-vindas automáticas respeitam o toggle por grupo (group_mod.bemvindo)
      try {
        const { getGroupMod } = await import('../../services/databaseService');
        const mod = await getGroupMod(groupId);
        if (!mod.bemvindo) {
          console.log(`[handleMemberJoin] bemvindo DESATIVADO no grupo ${groupId} - pulando saudacao`);
          return;
        }
      } catch { /* se falhar, envia mesmo assim */ }

      // Verificar histórico de membros para detectar se é retorno
      // TODO: implementar storage de histórico de membros

      for (const memberId of newMembers) {
        const isRejoining = false; // TODO: verificar no histórico
        const welcomeText = isRejoining
          ? `Bem-vindo(a) de volta @${memberId.split('@')[0]}! 🎉`
          : `Bem-vindo(a) @${memberId.split('@')[0]}! 🎉`;

        // Adicionar mensagem personalizada se configurada
        const fullMessage = customMessage 
          ? `${welcomeText}\n\n${customMessage}`
          : welcomeText;

        // Enviar mensagem de boas-vindas mencionando o usuário
        await this.innerClient.sendMessage(
          groupId,
          fullMessage,
          {
            mentions: [memberId]
          }
        );

        console.log(`[WhatsApp] Boas-vindas enviadas para ${memberId} no grupo ${groupId}`);
      }
    } catch (error) {
      console.error('[WhatsApp] Erro ao enviar boas-vindas:', error);
    }
  }

  private async normalizeMessage(msg: any): Promise<PlatformMessage> {
    const msgHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    
    // VALIDAÇÃO DEFENSIVA ANTES DE QUALQUER ACESSO
    if (!msg) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg é null/undefined! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem undefined/null em normalizeMessage - fonte desconhecida');
    }
    
    if (!msg.id) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg não tem id! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] msg type:', typeof msg);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem sem id em normalizeMessage');
    }
    
    if (!msg.from) {
      console.error(`[WhatsAppAdapter.normalizeMessage] ERRO CRÍTICO - msg não tem from! msgHash: ${msgHash}`);
      console.error('[WhatsAppAdapter.normalizeMessage] msg type:', typeof msg);
      console.error('[WhatsAppAdapter.normalizeMessage] Stack trace:', stack);
      throw new Error('Mensagem sem from em normalizeMessage');
    }
    
    console.log(`[WhatsAppAdapter.normalizeMessage] ENTRY - msgHash: ${msgHash}`);
    console.log(`[WhatsApp] normalizeMessage() - msg.id:`, msg?.id, 'msg.id._serialized:', msg?.id?._serialized, 'msg.id.id:', msg?.id?.id);
    console.log('[WhatsApp] normalizeMessage() chamado - msg existe?', !!msg, 'msg.id?', !!msg?.id, 'msg.from?', !!msg?.from);
    
    const chatId = (msg.to && String(msg.to).endsWith('@g.us')) ? msg.to : msg.from;
    const isGroup = String(chatId).endsWith('@g.us');
    // userId do remetente. Em grupo, msg.author/msg.from podem vir como @lid
    // (WhatsApp Web atual). O numero real (@c.us) e' resolvido via getContactById.
    let userId = msg.fromMe
      ? (this.innerClient.info?.wid?._serialized || msg.from)
      : (isGroup ? (msg.author || msg.from) : msg.from);
    if (String(userId).endsWith('@lid')) {
      try {
        const contact = await this.innerClient.getContactById(String(userId).replace('@lid', '@c.us'));
        const real = (contact as any)?.id?._serialized || (contact as any)?._serialized;
        if (real && String(real).endsWith('@c.us')) {
          userId = real;
        }
      } catch {
        // mantem @lid se nao resolver
      }
    }
    
    let extractedText = msg.body || '';
    if (!extractedText && (msg as any)._data) {
      const d = (msg as any)._data;
      extractedText = d.body || d.conversation || d.text || (typeof d.data === 'string' ? d.data : '') || '';
    }
    if (!extractedText && msg.type === 'image') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'video') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'document') {
      extractedText = msg.caption || '';
    }
    if (!extractedText && msg.type === 'location') {
      extractedText = msg.location?.description || '';
    }
    if (!extractedText && msg.type === 'vcard') {
      extractedText = msg.vcardParsed?.[0]?.displayName || '';
    }
    if (!extractedText && msg.type === 'order') {
      extractedText = msg.order?.title || '';
    }
    if (!extractedText && msg.type === 'call_log') {
      extractedText = msg.callLog?.type || '';
    }
    if (!extractedText && msg.type === 'payment') {
      extractedText = msg.payment?.note || '';
    }
    if (!extractedText && msg.type === 'product') {
      extractedText = msg.product?.title || '';
    }
    if (!extractedText && msg.type === 'sticker') {
      extractedText = msg.sticker?.id || '';
    }
    if (!extractedText && msg.type === 'buttons_response') {
      extractedText = msg.selectedButtonId || '';
    }
    if (!extractedText && msg.type === 'list_response') {
      extractedText = msg.listResponse?.title || msg.listResponse?.description || '';
    }
    if (!extractedText && msg.type === 'poll_creation') {
      extractedText = msg.poll?.name || '';
    }
    if (!extractedText && msg.type === 'e2e_notification') {
      extractedText = msg.e2eNotification?.type || '';
    }
    if (!extractedText && msg.type === 'unknown') {
      extractedText = msg.body || '';
    }
    if (!extractedText && (msg as any)._data) {
      const data = (msg as any)._data;
      extractedText = data.body || data.caption || data.text || '';
      if (!extractedText && data.listResponse) {
        extractedText = data.listResponse.title || data.listResponse.description || '';
      }
    }

    const messageId = msg.id?._serialized
      || msg.id?.id
      || (msg.id?.remote && msg.id?.id ? `${msg.id.remote}_${msg.id.id}` : null)
      || String(msg.id);

    const payload = {
      id: `wpp:${messageId}`,
      chatId,
      userId,
      userName: msg._data?.notifyName || msg.from,
      text: extractedText,
      timestamp: new Date(msg.timestamp * 1000),
      isFromMe: msg.fromMe,
      isCommand: false, // Será determinado pelo PlatformManager
      platform: 'whatsapp' as const,
      raw: msg, // Referência direta ao Message do WWebJS (preserva métodos como .react())
      hasMedia: msg.hasMedia,
      mediaType: this.getMediaType(msg),
      replyToMessageId: msg.hasQuotedMsg ? `wpp:${msg.quotedMsg?.id._serialized}` : undefined,
      mentions: this.extractMentions(msg, extractedText)
    };

    // Log de auditoria: confirma a entrega do payload normalizado ao messageHandler.
    // Trata @lid (identificador de privacidade/dispositivo) como conversa privada válida.
    console.log(`[WhatsAppAdapter] Payload normalizado e enviado ao handler: ID=${messageId} Chat=${chatId} User=${userId} Text="${payload.text}" isGroup=${isGroup}`);
    return payload;
  }

  private extractMentions(msg: any, text?: string): any[] {
    // O WhatsApp Web moderno (IDs @lid) pode expor menções em campos diferentes.
    // Tentar todas as fontes conhecidas para não perder a menção.
    let ids: string[] = [];
    if (Array.isArray(msg.mentionedIds) && msg.mentionedIds.length) {
      ids = msg.mentionedIds;
    } else if (Array.isArray(msg.mentionedJidList) && msg.mentionedJidList.length) {
      ids = msg.mentionedJidList;
    } else if (msg._data && Array.isArray((msg._data as any).mentionedJidList) && (msg._data as any).mentionedJidList.length) {
      ids = (msg._data as any).mentionedJidList;
    }
    console.log(`[WhatsApp] extractMentions - fontes: mentionedIds=${(msg.mentionedIds||[]).length} mentionedJidList=${(msg.mentionedJidList||[]).length} _data.mentionedJidList=${(msg._data?.mentionedJidList||[]).length} -> ids=${JSON.stringify(ids)}`);
    // FALLBACK: se o WWebJS não populou mentionedIds (comum quando o PRÓPRIO bot
    // envia a mensagem com mentions[] e o WA não resolve), tentar extrair do texto
    // "@<numero>". Usa o texto REAL (extractedText), que vem de msg.body OU
    // msg._data.body — o msg.body pode vir vazio no loopback do próprio bot.
    if (ids.length === 0) {
      const txt = (typeof text === 'string' && text) || (typeof msg.body === 'string' ? msg.body : '') || (msg._data?.body || '');
      const m = String(txt).match(/@(\d{8,})/g);
      if (m) {
        ids = m.map((x: string) => x.replace('@', '') + '@c.us');
        console.log(`[WhatsApp] extractMentions - fallback por texto: ids=${JSON.stringify(ids)}`);
      }
    }
    // Normalizar cada fonte (pode vir string '@c.us'/'\@lid' ou objeto {_serialized})
    const cleanIds = ids.map((x: any) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') return (x._serialized || x.id || x.user || '');
      return String(x);
    }).filter(Boolean);
    return cleanIds.map((id: string) => {
      // Normalizar @lid -> @c.us (WWebJS removeParticipants espera @c.us)
      const clean = id.replace('@lid', '@c.us');
      return {
        id: `wpp:${clean}`,
        name: clean.split('@')[0],
        isBot: false,
        platform: 'whatsapp' as const,
        raw: { id: clean }
      };
    });
  }

  private getMediaType(msg: Message): PlatformMessage['mediaType'] {
    if (!msg.hasMedia) return undefined;
    const type = msg.type;
    switch (type) {
      case 'image': return 'image';
      case 'video': return 'video';
      case 'audio':
      case 'ptt': return 'audio';
      case 'document': return 'document';
      case 'sticker': return 'sticker';
      case 'location': return 'location';
      case 'vcard': return 'contact';
      default: return undefined;
    }
  }

  async sendMessage(chatId: string, text: string, options?: SendOptions): Promise<PlatformMessage> {
    const thisHash = Math.random().toString(36).substring(7);
    const stack = new Error().stack;
    console.log(`[WhatsAppAdapter.sendMessage] ENTRY - thisHash: ${thisHash}, this.constructor.name: ${this.constructor.name}, chatId: ${chatId}`);
    console.log(`[WhatsAppAdapter.sendMessage] Stack trace:`, stack);
    
    // Remover prefixo wpp: se presente
    let cleanChatId = chatId.replace(/^wpp:/, '');
    // IMPORTANTE: NÃO converter @lid -> @c.us. O WWebJS moderno EXIGE o @lid como
    // destino de envio para esse contato; converter gera "No LID for user".
    // Mantemos o JID original (incluindo @lid) no envio.
    const targetJid = cleanChatId;
    console.log(`[WhatsAppAdapter.sendMessage] cleanChatId: ${cleanChatId} | targetJid: ${targetJid}`);
    console.log(`[WhatsAppAdapter] Enviando resposta para: ${targetJid}`);
    
    // CORREÇÃO: WWebJS moderno (1.34.7) CONSEGUE citar mensagens @lid se o ID
    // estiver correto. O filtro antigo descartava TODOS os replies de @lid (dono e
    // contatos @lid), fazendo o bot nunca marcar/quotar a mensagem — não é reply de verdade.
    // Agora repassamos o quotedMessageId limpo (sem prefixo wpp:).
    const quotedRaw = options?.replyToMessageId?.replace(/^wpp:/, '');
    const quotedMessageId = quotedRaw || undefined;
    // Repassar menções (essenciais p/ comandos de moderação como $mute/$kick/$ban).
    // O WWebJS espera `mentions: [jid]` (array de strings ou Contact).
    const mentions = (options as any)?.mentionedIds || (options as any)?.mentions || undefined;
    const sendOptions = {
      quotedMessageId,
      waitUntilMsgSent: true,
      sendSeen: false,
      ...(mentions ? { mentions } : {})
    };

    const startTime = Date.now();
    let sent;
    try {
      sent = await this.innerClient.sendMessage(targetJid, text, sendOptions);
    } catch (sendErr: any) {
      const msg = String(sendErr?.message || '');
      if (msg.includes('serialize') || msg.includes('getMessageModel') || msg.includes('quoted')) {
        console.warn(`[WhatsAppAdapter.sendMessage] sendMessage falhou (${msg}). Tentando fallback via getChatById+chat.sendMessage...`);
        try {
          const chat = await this.innerClient.getChatById(targetJid);
          // Retry 1: com quote (via chat.sendMessage)
          try {
            sent = await chat.sendMessage(text, { quotedMessageId: sendOptions.quotedMessageId });
          } catch (quoteErr: any) {
            // Retry 2: SEM quote (entrega a resposta mesmo que não consiga marcar a msg)
            console.warn(`[WhatsAppAdapter.sendMessage] quote falhou (${String(quoteErr?.message)}). Reenviando sem citar...`);
            sent = await chat.sendMessage(text, {});
          }
        } catch (fallbackErr: any) {
          console.error(`[WhatsAppAdapter.sendMessage] Fallback também falhou:`, {
            message: fallbackErr?.message,
            stack: fallbackErr?.stack
          });
          throw new Error(`Falha ao enviar mensagem (${targetJid}): ${fallbackErr?.message || msg}`);
        }
      } else {
        // Outras falhas de transporte: NÃO lançamos (evita "erro interno" em cascata).
        // Logamos e retornamos payload mínimo para o comando prosseguir.
        console.error(`[WhatsAppAdapter.sendMessage] ERRO de transporte ao enviar para ${targetJid}:`, {
          message: msg,
          stack: sendErr?.stack,
          errorType: sendErr?.constructor?.name
        });
        return {
          id: `wpp:${targetJid}-${Date.now()}`,
          chatId: `wpp:${targetJid}`,
          userId: '',
          text,
          isCommand: false,
          fromMe: true,
          timestamp: Date.now(),
          raw: null
        } as PlatformMessage;
      }
      } // fecha catch (sendErr)
    const duration = Date.now() - startTime;

    console.log(`[WhatsAppAdapter.sendMessage] ⏱️ sendMessage demorou ${duration}ms`);
    console.log(`[WhatsAppAdapter.sendMessage] 📋 RETORNO: typeof: ${typeof sent}, constructor: ${sent?.constructor?.name || 'N/A'}`);
    console.log(`[WhatsAppAdapter.sendMessage] 📋 sent.id:`, sent?.id, 'sent.id._serialized:', sent?.id?._serialized);

    if (!sent || !sent.id) {
      // O WWebJS moderno (JIDs @lid / waitUntilMsgSent) nem sempre devolve o objeto
      // da mensagem serializada, mesmo quando o envio foi bem-sucedido. Se chegamos
      // aqui sem exceção, tratamos como sucesso e retornamos um payload mínimo em vez
      // de lançar erro falso ("erro interno ao executar comando").
      console.warn(`[WhatsAppAdapter.sendMessage] sendMessage não devolveu objeto serializado (sent=${typeof sent}); assumindo envio bem-sucedido para ${targetJid}.`);
      return {
        id: `wpp:${targetJid}-${Date.now()}`,
        chatId: `wpp:${targetJid}`,
        userId: '',
        text: text,
        isCommand: false,
        fromMe: true,
        timestamp: Date.now(),
        raw: null
      } as PlatformMessage;
    }
    
    console.log(`[WhatsAppAdapter.sendMessage] ✅ Mensagem enviada com sucesso`);
    // WWebJS moderno (waitUntilMsgSent) nem sempre devolve 'from'/'id' em mensagens enviadas.
    // Se o normalizeMessage falhar, retornamos payload mínimo em vez de lançar erro falso
    // (que virava "erro interno ao executar comando" em todos os comandos).
    try {
      if (sent && !sent.from) (sent as any).from = targetJid;
      return this.normalizeMessage(sent);
    } catch (normErr: any) {
      console.error(`[WhatsAppAdapter.sendMessage] normalizeMessage falhou (msg.from/id ausente no WWebJS) - retornando payload mínimo:`, normErr?.message);
      return {
        id: `wpp:${targetJid}-${Date.now()}`,
        chatId: `wpp:${targetJid}`,
        userId: '',
        text,
        isCommand: false,
        fromMe: true,
        timestamp: Date.now(),
        raw: (sent as any) ?? null
      } as PlatformMessage;
    }
  }

  async sendMedia(chatId: string, media: MediaPayload, caption?: string): Promise<PlatformMessage> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    const mediaObject = media.data instanceof Buffer
      ? new (await import('whatsapp-web.js')).MessageMedia(media.mimetype || 'application/octet-stream', media.data.toString('base64'), media.filename)
      : await (await import('whatsapp-web.js')).MessageMedia.fromUrl(media.data as string);

    const sent = await this.innerClient.sendMessage(cleanChatId, mediaObject, { caption, waitUntilMsgSent: true });
    return this.normalizeMessage(sent);
  }

  async getChat(chatId: string): Promise<PlatformChat> {
    const originalChatId = chatId;
    const cleanChatId = chatId.replace(/^(wpp:|tg:|dc:)/, '');
    console.log(`[WhatsApp] getChat() chamado - chatId original: ${originalChatId} cleanChatId: ${cleanChatId} formato: formato WhatsApp`);

    try {
      const chat = await this.innerClient.getChatById(cleanChatId);
      return this.normalizeChat(chat);
    } catch (error: any) {
      // Workaround para Issue #201838: "r: r" error após atualização WhatsApp Web
      if (error.message === 'r' || error.message === 'r: r') {
        console.warn(`[WhatsApp] getChat() - Erro "r" detectado (Issue #201838).`);
        console.warn(`[WhatsApp] getChat() - Não é possível obter participantes neste momento.`);
        console.warn(`[WhatsApp] getChat() - Retornando chat com isPermissionsVerified: false para indicar falha.`);
        // Retornar chat indicando explicitamente que as permissões não puderam ser verificadas
        return {
          id: originalChatId,
          name: cleanChatId,
          isGroup: cleanChatId.endsWith('@g.us'),
          participants: [], // Vazio - permissões não verificadas
          raw: null,
          isPermissionsVerified: false // INDICADOR EXPLÍCITO DE FALHA
        };
      }
      console.error(`[WhatsApp] Erro em getChatById:`, {
        chatId: originalChatId,
        cleanChatId,
        error: error.message,
        stack: error.stack,
        errorType: error.constructor.name
      });
      throw error;
    }
  }

  async getUser(userId: string): Promise<PlatformUser> {
    const cleanUserId = userId.replace(/^wpp:/, '');
    try {
      const contact = await this.innerClient.getContactById(cleanUserId);
      return this.normalizeUser(contact);
    } catch {
      return { id: `wpp:${cleanUserId}`, name: cleanUserId.split('@')[0], isBot: false, platform: 'whatsapp', raw: null } as any;
    }
  }

  async getParticipantName(chatId: string, userId: string): Promise<string | null> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    const cleanUserId = userId.replace(/^wpp:/, '').replace('@lid', '@c.us');
    // 1. Tentar contato (pushname real, mais confiavel)
    try {
      const contact = await this.innerClient.getContactById(cleanUserId);
      const name = (contact as any)?.pushname || (contact as any)?.name;
      if (name) return name;
    } catch { /* ignora */ }
    // 2. Fallback: groupMetadata (notify/name/displayName)
    const cleanLid = userId.replace(/^wpp:/, '').replace('@c.us', '@lid');
    try {
      return await this.innerClient.pupPage.evaluate(
        async (cid: string, cuid: string, tlid: string) => {
          const c = await (window as any).WWebJS.getChat(cid, { getAsModel: false });
          const parts = c.groupMetadata?.participants;
          if (!parts) return null;
          const find = (key: string) => {
            if (!key) return null;
            const match = (p: any) =>
              (p?.lid?._serialized || p?.lid?.$1 || '') === key
              || (p?.id?._serialized || p?.id?.$1 || '') === key;
            if (Array.isArray(parts)) return parts.find(match) || null;
            if (typeof parts.get === 'function') return parts.get(key) || null;
            if (typeof parts === 'object') return Object.values(parts).find(match) || null;
            return null;
          };
          const hit = find(cuid) || find(tlid);
          if (!hit) return null;
          return hit.notify || hit.name || hit.displayName || (hit.id?._serialized || '').split('@')[0] || null;
        },
        cleanChatId,
        cleanUserId,
        cleanLid
      ) || null;
    } catch {
      return null;
    }
  }

  async getChats(): Promise<PlatformChat[]> {
    const chats = await this.innerClient.getChats();
    return chats.map(c => this.normalizeChat(c));
  }

  async removeParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    let cleanUserId = userId.replace(/^wpp:/, '');
    // O alvo pode vir como @lid ou @c.us. O WWebJS removeParticipants chama
    // enforceLidAndPnRetrieval e, se nao resolver, o participants vem VAZIO ->
    // erro "expected at least 1 children, but found 0". Para evitar, resolvemos
    // o ID real do participante no groupMetadata (que pode ser @lid ou @c.us).
    console.log(`[WhatsApp] removeParticipant - chatId: ${cleanChatId} userId: ${cleanUserId}`);
    try {
      const chat = await this.innerClient.getChatById(cleanChatId);
      console.log(`[WhatsApp] removeParticipant - chat obtido: ${chat?.id?._serialized}`);
      // Achar o participante real no groupMetadata usando tanto @c.us quanto @lid.
      // O groupMetadata.participants pode ser Map, Array ou objeto plano dependendo
      // da versao do WhatsApp Web - ser defensivo.
      const targetLid = cleanUserId.replace('@c.us', '@lid');
      const resolvedId = await this.innerClient.pupPage.evaluate(
        async (cid: string, cuid: string, tlid: string) => {
          const c = await (window as any).WWebJS.getChat(cid, { getAsModel: false });
          const parts = c.groupMetadata?.participants;
          const type = parts ? (Array.isArray(parts) ? 'array' : typeof parts) : 'undefined';
          console.log('[resolveId] groupMetadata.participants type:', type);
          const find = (key: string) => {
            if (!key || !parts) return null;
            const match = (p: any) =>
              (p?.lid?._serialized || p?.lid?.$1 || '') === key
              || (p?.id?._serialized || p?.id?.$1 || '') === key;
            if (Array.isArray(parts)) return parts.find(match) || null;
            if (typeof parts.get === 'function') return parts.get(key) || null;
            if (typeof parts === 'object') return Object.values(parts).find(match) || null;
            return null;
          };
          const hit = find(cuid) || find(tlid);
          return hit ? (hit.id?._serialized || hit.lid?._serialized || null) : null;
        },
        cleanChatId,
        cleanUserId,
        targetLid
      );
      const finalId = resolvedId || cleanUserId;
      console.log(`[WhatsApp] removeParticipant - ID resolvido no groupMetadata: ${finalId}`);
      await (chat as any).removeParticipants([finalId]);
      console.log(`[WhatsApp] removeParticipant - SUCESSO para ${finalId}`);
    } catch (err: any) {
      console.error(`[WhatsApp] removeParticipant ERRO:`, { msg: err?.message, stack: err?.stack?.split('\n').slice(0,3).join(' | ') });
      throw err;
    }
  }

  async isParticipantAdmin(chatId: string, userId: string): Promise<boolean> {
    const cleanChatId = chatId.replace(/^wpp:|^tg:|^dc:/, '');
    let cleanUserId = userId.replace(/^wpp:/, '');
    const targetLid = cleanUserId.replace('@c.us', '@lid');
    try {
      return await this.innerClient.pupPage.evaluate(
        async (cid: string, cuid: string, tlid: string) => {
          const c = await (window as any).WWebJS.getChat(cid, { getAsModel: false });
          const parts = c.groupMetadata?.participants;
          if (!parts) return false;
          const find = (key: string) => {
            if (!key) return null;
            const match = (p: any) =>
              (p?.lid?._serialized || p?.lid?.$1 || '') === key
              || (p?.id?._serialized || p?.id?.$1 || '') === key;
            if (Array.isArray(parts)) return parts.find(match) || null;
            if (typeof parts.get === 'function') return parts.get(key) || null;
            if (typeof parts === 'object') return Object.values(parts).find(match) || null;
            return null;
          };
          const hit = find(cuid) || find(tlid);
          return !!(hit && (hit.isAdmin || hit.isSuperAdmin));
        },
        cleanChatId,
        cleanUserId,
        targetLid
      );
    } catch {
      return false;
    }
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    const cleanChatId = chatId.replace(/^wpp:/, '');
    let cleanUserId = userId.replace(/^wpp:/, '');
    if (cleanUserId.endsWith('@lid')) {
      cleanUserId = cleanUserId.replace('@lid', '@c.us');
    }
    console.log(`[WhatsApp] banParticipant - chatId: ${cleanChatId} userId: ${cleanUserId}`);
    // 1. Remover do grupo (essencial) — resolver ID real no groupMetadata p/ evitar
    // "expected at least 1 children" (enforceLidAndPnRetrieval falha com @c.us)
    try {
      const chat = await this.innerClient.getChatById(cleanChatId);
      const targetLid = cleanUserId.replace('@c.us', '@lid');
      const resolvedId = await this.innerClient.pupPage.evaluate(
        async (cid: string, cuid: string, tlid: string) => {
          const c = await (window as any).WWebJS.getChat(cid, { getAsModel: false });
          const parts = c.groupMetadata?.participants;
          const type = parts ? (Array.isArray(parts) ? 'array' : typeof parts) : 'undefined';
          console.log('[resolveId] groupMetadata.participants type:', type);
          const find = (key: string) => {
            if (!key || !parts) return null;
            const match = (p: any) =>
              (p?.lid?._serialized || p?.lid?.$1 || '') === key
              || (p?.id?._serialized || p?.id?.$1 || '') === key;
            if (Array.isArray(parts)) return parts.find(match) || null;
            if (typeof parts.get === 'function') return parts.get(key) || null;
            if (typeof parts === 'object') return Object.values(parts).find(match) || null;
            return null;
          };
          const hit = find(cuid) || find(tlid);
          return hit ? (hit.id?._serialized || hit.lid?._serialized || null) : null;
        },
        cleanChatId,
        cleanUserId,
        targetLid
      );
      const finalId = resolvedId || cleanUserId;
      console.log(`[WhatsApp] banParticipant - ID resolvido no groupMetadata: ${finalId}`);
      await (chat as any).removeParticipants([finalId]);
      console.log(`[WhatsApp] banParticipant - SUCESSO remoção para ${finalId}`);
    } catch (err: any) {
      console.error(`[WhatsApp] banParticipant ERRO removeParticipants:`, { msg: err?.message });
      throw err;
    }
    // 2. Bloquear contato (best-effort, NUNCA deve quebrar o $ban)
    try {
      const contact = await this.innerClient.getContactById(cleanUserId);
      if (contact && typeof (contact as any).block === 'function') {
        await (contact as any).block();
        console.log(`[WhatsApp] banParticipant - contato bloqueado ${cleanUserId}`);
      }
    } catch (blockError: any) {
      console.warn(`[WhatsApp] banParticipant: falha ao bloquear ${cleanUserId} (ignorado):`, blockError?.message);
    }
  }

  private normalizeChat(chat: Chat): PlatformChat {
    return {
      id: `wpp:${chat.id._serialized}`,
      name: chat.name || (chat.isGroup ? 'Grupo' : 'Chat Privado'),
      isGroup: chat.isGroup,
      platform: 'whatsapp',
      participants: chat.participants?.map(p => {
        let raw = p.id._serialized || (p.id as any).user || String(p.id);
        if (raw.endsWith('@lid')) {
          const user = (p.id as any).user || raw.replace('@lid', '');
          raw = `${user}@c.us`;
        }
        return {
          id: `wpp:${raw}`,
          isAdmin: Boolean((p as any).isAdmin),
          isSuperAdmin: Boolean((p as any).isSuperAdmin),
        } as any;
      }),
      raw: chat,
      isPermissionsVerified: true // Chat obtido com sucesso, permissões verificadas
    };
  }

  private normalizeUser(contact: Contact): PlatformUser {
    return {
      id: `wpp:${contact.id._serialized}`,
      name: contact.pushname || contact.name || contact.number,
      username: contact.shortName,
      isBot: false,
      platform: 'whatsapp',
      raw: contact
    };
  }

  private normalizeUserId(id: string): string {
    return `wpp:${id}`;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onReady(handler: () => void): void {
    this.readyHandler = handler;
  }

  onDisconnected(handler: (reason: string) => void): void {
    this.disconnectedHandler = handler;
  }

  async shutdown(): Promise<void> {
    await this.innerClient.destroy();
    this.isReady = false;
  }

  getClient(): Client {
    return this.innerClient;
  }

  async initialize(): Promise<void> {
    // O construtor ja chama connect() (que cria o Client + initialize()).
    // Mantido por compatibilidade com o PlatformManager; se o client ja
    // foi inicializado pelo construtor, nao faz nada.
    if (this.innerClient && (this.innerClient as any)._initialized) return;
  }
}
