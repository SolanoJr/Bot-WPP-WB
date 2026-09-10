/** BaileysConnection — conexão, QR, reconnection, loggedOut, health básico.
 * Extraído de BaileysAdapter.ts.
 */

import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { logInfo, logWarning, logError } from '../../../services/loggerService';
import { normId, toJid } from './util';
import fs from 'fs';
import path from 'path';

export interface BaileysConnectionOpts {
  authDir?: string;
  platform?: string;
  onQR?: (qr: string) => void;
  onOpen?: () => void;
  onClose?: (reason: string, statusCode?: number) => void;
  onCredsUpdate?: () => void;
  onDisconnected?: (reason: string) => void;
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

    const baileysLogger = {
      debug: () => {},
      info: () => {},
      warn: (m: string) => logWarning(`[Baileys] ${m}`),
      error: (m: string) => logError('Baileys.auth', new Error(m)),
      child: (props: any) => {
        // Baileys v7 chama logger.child({ ...props }) e usa o retorno.
        // Retorna o mesmo logger (nossos logs já estão categorizados via prefixo).
        return baileysLogger;
      },
    };

    const driver = makeWASocket({
      auth: driverState,
      logger: baileysLogger,
      trustProxy: true,
      qrTimeout: 120000,
    } as any) as any;

    this.sock = driver;
    this.setSock(driver);

    // Save credentials on update
    (driver as any).on('creds.update', async () => {
      logInfo('[Baileys] 🔄 Credenciais atualizadas — salvando...');
      try {
        await saveCreds();
        logInfo('[Baileys] 🔄 Credenciais salvas em disco');
      } catch (e: any) {
        logWarning('[Baileys] falha ao salvar credenciais:', e?.message);
      }
      this.onCredsUpdate?.();
    });

    // QR
    (driver as any).on('qr', async (qr: string) => {
      this.setQrPending(true);
      logInfo('[Baileys] 📱 QR recebido do servidor');
      this.onQR?.(qr);
    });

    // Open
    (driver as any).on('open', async () => {
      logInfo('[Baileys] ✅ Conexão estabelecida');
      this.setReady(true);
      this.setQrPending(false);
      this._loggedOut = false;
      const userId = ((driver as any).user?.id || '').split('@')[0] || '';
      const userName = (driver as any).user?.name || '';
      this.setUserInfo(userId, userName);
      this.onOpen?.();
    });

    // Close
    (driver as any).on('close', (reason: string, statusCode?: number) => {
      logInfo(`[Baileys] 🔌 Conexão encerrada: ${reason} (${statusCode})`);
      this.setReady(false);
      this.setSock(null);
      this.onClose?.(reason, statusCode);

      if (statusCode === DisconnectReason.loggedOut) {
        this._loggedOut = true;
        logInfo('[Baileys] 🚪 loggedOut detectado (401)');
      }
    });

    // Disconnected
    (driver as any).on('disconnected', (reason: string) => {
      logInfo(`[Baileys] 🔌 Desconectado: ${reason}`);
      this.onDisconnected?.(reason);
    });

    // Start
    try {
      await (driver as any).connect();
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
      if (this.sock && typeof this.sock.disconnect === 'function') {
        await this.sock.disconnect();
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
      if (this.sock && typeof this.sock.disconnect === 'function') {
        await this.sock.disconnect();
      }
    } catch { /* ignorar */ }

    await this.connect();
  }

  /** Útil para o AutoMod. */
  getSockSafe(): any {
    return this.sock;
  }
}
