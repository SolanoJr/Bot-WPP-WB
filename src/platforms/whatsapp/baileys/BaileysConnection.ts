/**
 * BaileysConnection — conexão, QR, reconnection, loggedOut, health básico.
 * Extraído de BaileysAdapter.ts.
 *
 * API Baileys v7 rc14 (investigada no servidor):
 * - socket.ev.on('event', cb) para ouvir eventos (não socket.on)
 * - socket.waitForConnectionUpdate(checkFn, timeoutMs) para aguardar estado
 * - socket.end() para desconectar (não socket.disconnect)
 * - socket.store NÃO existe em v7
 * - socket.user?.id / socket.user?.name existem
 * - socket.waitForMessage('', msgId) para buscar mensagens
 *
 * Logger ILogger v7: { level, child, trace(obj,msg?), debug, info, warn, error }
 * Eventos: 'connection.update' (WAConnectionState: open/connecting/close), 'creds.update'
 *   'qr' e 'disconnected' são emitidos internamente pelo baileys mas não estão no BaileysEventMap tipado —
 *   mantidos com cast any pois funcionam em runtime (confirmado no servidor).
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { logInfo, logWarning, logError } from '../../../services/loggerService';
import { normId, toJid } from './util';
import fs from 'fs';
import path from 'path';
import type { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger.js';

export interface BaileysConnectionOpts {
  authDir?: string;
  platform?: string;
  onQR?: (qr: string) => void;
  onOpen?: () => void;
  onClose?: (reason: string, statusCode?: number) => void;
  onCredsUpdate?: () => void;
  onDisconnected?: (reason: string) => void;
  onMessagesUpsert?: (messages: any[]) => void | Promise<void>;
  onMessagesDelete?: (keys: any[]) => void | Promise<void>;
  onMessagesDeleteAll?: (jid: string, all: boolean) => void | Promise<void>;
  onMessagesUpdate?: (updates: any[]) => void | Promise<void>;
}

export class BaileysConnection {
  private sock: any = null;
  private authDir: string;
  private platform: string;
  private onQR?: (qr: string) => void;
  private onOpen?: () => void;
  private onClose?: (reason: string, statusCode?: number) => void;
  private onCredsUpdate?: () => void;
  private onDisconnected?: (reason: string) => void;
  private onMessagesUpsert?: (messages: any[]) => void | Promise<void>;
  private onMessagesDelete?: (keys: any[]) => void | Promise<void>;
  private onMessagesDeleteAll?: (jid: string, all: boolean) => void | Promise<void>;
  private onMessagesUpdate?: (updates: any[]) => void | Promise<void>;

  // Health/state
  private _ready = false;
  private _pendingQR = false;
  private _lastActivityTs = Date.now();
  private _lastConnectAttemptTs = Date.now();
  private _loggedOut = false;
  private _userId = '';
  private _userName = '';

  constructor(authDir: string, opts: BaileysConnectionOpts = {}, platform?: string) {
    this.authDir = authDir;
    this.platform = platform || 'whatsapp';
    this.onQR = opts.onQR;
    this.onOpen = opts.onOpen;
    this.onClose = opts.onClose;
    this.onCredsUpdate = opts.onCredsUpdate;
    this.onDisconnected = opts.onDisconnected;
    this.onMessagesUpsert = opts.onMessagesUpsert;
    this.onMessagesDelete = opts.onMessagesDelete;
    this.onMessagesDeleteAll = opts.onMessagesDeleteAll;
    this.onMessagesUpdate = opts.onMessagesUpdate;
  }

  // ---- Getters / setters usados pela adapter ----
  getSock(): any { return this.sock; }
  setSock(sock: any): void { this.sock = sock; }

  getUserId(): string { return this._userId; }
  getUserName(): string { return this._userName; }

  get ready(): boolean { return this._ready; }
  setReady(v: boolean): void { this._ready = v; }

  get pendingQR(): boolean { return this._pendingQR; }
  setQrPending(v: boolean): void { this._pendingQR = v; }

  get lastActivityTs(): number { return this._lastActivityTs; }
  setLastActivityTs(v: number): void { this._lastActivityTs = v; }

  get lastConnectAttemptTs(): number { return this._lastConnectAttemptTs; }
  setLastConnectAttemptTs(v: number): void { this._lastConnectAttemptTs = v; }

  get loggedOut(): boolean { return this._loggedOut; }
  setLoggedOut(v: boolean): void { this._loggedOut = v; }

  setUserInfo(userId: string, userName: string): void {
    this._userId = normId(userId);
    this._userName = userName;
  }

  isLoggedOut(): boolean { return this._loggedOut; }

  /** Public wrapper for adapter cleanup on 401 */
  clearAuth(): void { this.clearAuthDir(); }

  /**
   * Limpa todos os arquivos do diretório de autenticação.
   * Chamado quando 401 é detectado para permitir novo login limpo.
   */
  private clearAuthDir(): void {
    try {
      if (fs.existsSync(this.authDir)) {
        const files = fs.readdirSync(this.authDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.authDir, file));
        }
        logInfo(`[BaileysConnection] 🧹 ${files.length} arquivo(s) removido(s)`);
      }
    } catch (e: any) {
      logWarning(`[BaileysConnection] Falha ao limpar authDir: ${e?.message}`);
    }
  }

  // ---- Utilitários ----
  private getPhoneNumber(): string {
    const env = process.env.WPP_PHONE_NUMBER;
    if (env) {
      const cleaned = env.replace(/[^0-9]/g, '');
      logInfo(`[BaileysConnection] 📱 WPP_PHONE_NUMBER: ${cleaned}`);
      return cleaned;
    }
    const fallback = '558581344211';
    logWarning(`[BaileysConnection] ⚠️ WPP_PHONE_NUMBER não definido. Usando: ${fallback}`);
    return fallback;
  }

  // ---- Conexão ----
  async connect(): Promise<void> {
    this.setLastConnectAttemptTs(Date.now());
    this.setQrPending(true);
    this._loggedOut = false;

    // useMultiFileAuthState espera um DIRS, não um arquivo — Baileys v7 gerencia
    // múltiplos arquivos de auth (creds, keys, etc.) dentro desse diretório.
    const authDir = this.authDir;

    // NÃO limpar credenciais aqui — só limpar em 401 no handler abaixo.
    // Removido clearAuthDir() do início para evitar loop de reconexão:
    // a cada reconnect, o auth era apagado, creds ficavam vazias,
    // novo pairing code era solicitado, conexão fechava, loop infinito.

    const { state: driverState, saveCreds } = await useMultiFileAuthState(authDir);

    // ILogger v7 rc14: precisa de level + child + assinaturas com (obj, msg?)
    const baileysLogger: ILogger = {
      level: 'debug',
      child: (props: Record<string, unknown>) => {
        // Baileys chama logger.child({ class: 'ns' }) etc. e usa o retorno.
        return baileysLogger;
      },
      trace: (obj: unknown, msg?: string) => {
        // Baileys v7 chama logger.trace na validação interna — silenciar aqui.
      },
      debug: (_obj: unknown, _msg?: string) => {},
      info: (_obj: unknown, msg?: string) => {
        if (msg) logInfo(`[Baileys] ${msg}`);
      },
      warn: (_obj: unknown, msg?: string) => {
        if (msg) logWarning(`[Baileys] ${msg}`);
      },
      error: (obj: unknown, msg?: string) => {
        const err = obj instanceof Error ? obj : (msg ? new Error(String(msg)) : new Error(String(obj)));
        logError('Baileys.auth', err);
      },
    };

    let driver: any;
    try {
      driver = makeWASocket({
        auth: driverState,
        browser: ['WarriorBlack', 'Desktop', '1.0'],
      });
    } catch (sockErr: any) {
      logError('Baileys.socket', sockErr);
      throw sockErr;
    }

    this.sock = driver;
    this.setSock(driver);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PAIRING CODE — gerar código imediatamente após makeWASocket.
    // Define creds.me ANTES do validateConnection rodar, evitando
    // "not logged in" e o fallback para QR.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const phoneNumber = this.getPhoneNumber();
    try {
      const code = await driver.requestPairingCode(phoneNumber);
      logInfo('');
      logInfo('╔════════════════════════════════════════════════════════════╗');
      logInfo('║  📱 PAIRING CODE GERADO!                                  ║');
      logInfo('╠════════════════════════════════════════════════════════════╣');
      logInfo(`║                  CÓDIGO:  ${code}                         ║`);
      logInfo('╠════════════════════════════════════════════════════════════╣');
      logInfo('║  1. WhatsApp > Ajustes > Dispositivos conectados          ║');
      logInfo('║  2. Conectar dispositivo > Digitar código                 ║');
      logInfo('╚════════════════════════════════════════════════════════════╝');
      logInfo('');
      this.setQrPending(true);
      this.onQR?.(code);
    } catch (pairingErr: any) {
      logWarning(`[BaileysConnection] requestPairingCode falhou: ${pairingErr?.message}`);
      logInfo('[BaileysConnection] Tentando QR automático como fallback...');
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // QR CODE — fluxo nativo do Baileys v7 (pair-device IQ).
    // Fallback caso o pairing code falhe.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // Salvamento de credenciais — v7: usar driver.ev.on('creds.update', ...)
    // 'creds.update' está no BaileysEventMap tipado.
    driver.ev.on('creds.update', async () => {
      logInfo('[Baileys] 🔄 Credenciais atualizadas — salvando...');
      try {
        await saveCreds();
        logInfo('[Baileys] 🔄 Credenciais salvas em disco');
      } catch (e: any) {
        logWarning('[Baileys] falha ao salvar credenciais:', e?.message);
      }
      this.onCredsUpdate?.();
    });

    // QR Code — emitido internamente pelo baileys via ev.on('qr', ...)
    // Não está no BaileysEventMap tipado, mas funciona em runtime (confirmado no servidor v7rc14).
    (driver.ev as any).on('qr', (qr: string) => {
      this.setQrPending(true);
      logInfo('[Baileys] 📱 QR recebido do servidor');
      this.onQR?.(qr);
    });

    // Conexão estabelecida — 'connection.update' está no BaileysEventMap.
    // ConnectionState.connection: 'open' | 'connecting' | 'close'
    driver.ev.on('connection.update', (update: any) => {
      // QR Code — Baileys v7 emite qr durante 'connecting' (isNewLogin: true)
      if (update.qr) {
        this.setQrPending(true);
        logInfo('[Baileys] 📱 QR recebido via connection.update');
        this.onQR?.(update.qr);
      }
      if (update.connection === 'open') {
        logInfo('[Baileys] ✅ Conexão estabelecida');
        this.setReady(true);
        this.setQrPending(false);
        this._loggedOut = false;
        const userId = (driver.user?.id || '').split('@')[0] || '';
        const userName = driver.user?.name || '';
        this.setUserInfo(userId, userName);
        this.onOpen?.();
      }
      if (update.connection === 'close') {
        const reason = update.lastDisconnect?.error
          ? (update.lastDisconnect.error instanceof Error ? update.lastDisconnect.error.message : String(update.lastDisconnect.error))
          : (update.reason || 'desconhecido');
        const rawErr = update.lastDisconnect?.error;
        const statusCode = rawErr
          ? ((rawErr as any)?.output?.statusCode || (rawErr as any)?.statusCode || 0)
          : 0;
        logInfo(`[Baileys] 🔌 Conexão encerrada: ${reason} (${statusCode})`);
        this.setReady(false);
        this.setSock(null);
        this.onClose?.(String(reason), statusCode);

        if (statusCode === DisconnectReason.loggedOut || String(statusCode) === '401' || reason === DisconnectReason.loggedOut) {
          this._loggedOut = true;
          logInfo('[Baileys] 🚪 loggedOut detectado (401) — limpando credenciais para novo login');
          this.clearAuthDir();
        }
      }
    });

    // Desconectado — emitido internamente pelo baileys, não está no BaileysEventMap tipado.
    (driver.ev as any).on('disconnected', (reason: string) => {
      logInfo(`[Baileys] 🔌 Desconectado: ${reason}`);
      this.onDisconnected?.(reason);
    });

    // messages.upsert — está no BaileysEventMap.
    driver.ev.on('messages.upsert', async (event: { messages?: any[] }) => {
      if (event?.messages?.length) {
        await this.onMessagesUpsert?.(event.messages);
      }
    });

    // ─── Confirmação de deletes (para laboratório/observação) ───
    // messages.delete: emitido pelo Baileys quando o servidor confirma remoção
    // messages.update: emitido quando uma mensagem é atualizada (ex: revoke, edit)
    driver.ev.on('messages.delete', async (event: any) => {
      if (event?.keys?.length) {
        logInfo('[BaileysConnection] MESSAGES_DELETE_EVENT', {
          count: event.keys.length,
          keys: event.keys.map((k: any) => ({
            id: k.id,
            remoteJid: k.remoteJid,
            fromMe: k.fromMe,
            participant: k.participant,
            participantAlt: k.participantAlt,
            addressingMode: k?.addressingMode,
          })),
        });
        await this.onMessagesDelete?.(event.keys);
      } else if (event?.all) {
        logInfo('[BaileysConnection] MESSAGES_DELETE_EVENT (all)', { jid: event.jid });
        await this.onMessagesDeleteAll?.(event.jid, event.all);
      }
    });

    driver.ev.on('messages.update', async (event: any) => {
      if (event?.length) {
        logInfo('[BaileysConnection] MESSAGES_UPDATE_EVENT', {
          count: event.length,
          updates: event.slice(0, 50).map((u: any) => ({
            id: u.id,
            remoteJid: u.remoteJid,
            fromMe: u.fromMe,
            participant: u.participant,
            participantAlt: u.participantAlt,
            addressingMode: u?.addressingMode,
            hasProtocol: !!(u?.message as any)?.protocolMessage,
          })),
        });
        await this.onMessagesUpdate?.(event);
      }
    });

    // ════════════════════════════════════════════════════════════════
    // QR CODE — quando não há credenciais válidas (auth vazio),
    // o Baileys gera QR automaticamente via ev.on('qr', ...).
    // O QR é salvo em qr.png no authDir e enviado ao dono pelo adapter.
    // Aguamos indefinitement por conexão.open (após QR escaneado).
    // ════════════════════════════════════════════════════════════════
    const hasCreds = !!(driverState?.creds?.me?.id);
    let waitForConnTimeout = 120000; // 2 min padrão
    if (!hasCreds) {
      logInfo(`[BaileysConnection] 🔍 hasCreds=false — QR pendente, usando listener assíncrono (waitForConnectionUpdate pulado)`);

      // EVITAR waitForConnectionUpdate com timeout curto — o Baileys fica
      // em estado intermediário (connecting) até o QR ser escaneado, e o
      // timeout de 120s/10min sempre expira antes. Em vez disso, esperar
      // explicitamente pelo evento 'connection.update' → 'open' via Promise.
      logWarning('[BaileysConnection] Pulando waitForConnectionUpdate — usando listener assíncrono para detectar conexão aberta');

      logInfo('Aguardando confirmação de conexão (QR escaneado)...');

      await new Promise<void>((resolve, reject) => {
        const onOpen = (update: any) => {
          if (update.connection === 'open') {
            logInfo('[Baileys] 🚀 Conexão aberta detectada via listener!');
            driver.ev.off('connection.update', onOpen);
            resolve();
          }
          if (update.connection === 'close') {
            driver.ev.off('connection.update', onOpen);
            reject(new Error(`[BaileysConnection] Connection closed: ${update.state || 'unknown'}`));
          }
        };
        driver.ev.on('connection.update', onOpen);

        // Fallback de segurança: timeout após 1h (QR deve ser escaneado muito antes)
        setTimeout(() => {
          driver.ev.off('connection.update', onOpen);
          reject(new Error('[BaileysConnection] Timeout segurança: 1h sem conexão aberta'));
        }, 3600000);
      });

      logInfo('[Baileys] ✅ Conexão confirmada!');
    }

    logInfo('[Baileys] 🚀 Baileys iniciado');
  }

  async shutdown(): Promise<void> {
    logInfo('[Baileys] 🛑 Encerrando conexão...');
    try {
      if (this.sock && typeof this.sock.end === 'function') {
        this.sock.end();
      }
    } catch (e: any) {
      logWarning('[Baileys] erro no shutdown:', e?.message);
    }
    this.setReady(false);
    this.setSock(null);
  }

  async reconnect(): Promise<void> {
    logInfo('[Baileys] 🔄 Tentando reconectar...');
    this.setReady(false);
    this.setSock(null);
    this._loggedOut = false;

    try {
      if (this.sock && typeof this.sock.end === 'function') {
        this.sock.end();
      }
    } catch { /* ignorar */ }

    await this.connect();
  }

  /** Útil para o AutoMod. */
  getSockSafe(): any {
    return this.sock;
  }
}