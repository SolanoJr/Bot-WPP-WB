/** BaileysConnection — conexão, QR, reconnection, loggedOut, health básico.
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

  // ---- Conexão ----
  async connect(): Promise<void> {
    this.setLastConnectAttemptTs(Date.now());
    this.setQrPending(true);
    this._loggedOut = false;

    // useMultiFileAuthState espera um DIRS, não um arquivo — Baileys v7 gerencia
    // múltiplos arquivos de auth (creds, keys, etc.) dentro desse diretório.
    const authDir = this.authDir;

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

    const driver = makeWASocket({
      auth: driverState,
    });

    this.sock = driver;
    this.setSock(driver);

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
        const statusCode = update.lastDisconnect?.error
          ? (update.lastDisconnect.error instanceof Error ? 0 : (update.lastDisconnect.error as any)?.statusCode || 0)
          : 0;
        logInfo(`[Baileys] 🔌 Conexão encerrada: ${reason} (${statusCode})`);
        this.setReady(false);
        this.setSock(null);
        this.onClose?.(String(reason), statusCode);

        if (statusCode === DisconnectReason.loggedOut || String(statusCode) === '401' || reason === DisconnectReason.loggedOut) {
          this._loggedOut = true;
          logInfo('[Baileys] 🚪 loggedOut detectado (401)');
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

    // Iniciar conexão — v7: socket conecta automaticamente ao ser criado.
    // Usar waitForConnectionUpdate para aguardar que atinja 'open'.
    try {
      await driver.waitForConnectionUpdate(
        async (u: any) => u.connection === 'open' || u.connection === 'close',
        120000
      );
      logInfo('[Baileys] 🚀 Baileys iniciado');
    } catch (e: any) {
      logError('Baileys.connect', e);
      this.setReady(false);
      throw e;
    }
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