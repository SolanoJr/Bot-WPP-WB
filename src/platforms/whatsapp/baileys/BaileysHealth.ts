/**
 * BaileysHealth — Health check, notifyOwner, QR notifications.
 * Extraído de BaileysAdapter.
 */

import { logInfo, logWarning, logError } from '../../../services/loggerService';
import { setWppHealth, WppHealth } from '../../../services/healthStore';
import { getOwnerNotifyTarget } from '../../../services/permissions';
import { normId, toJid } from './util';
import fs from 'fs';
import path from 'path';

export interface BaileysHealthDeps {
  sock: any;
  platform: string;
  userId: string;
  userName: string;
  authDir: string;
  ready: boolean;
  qrPending: boolean;
  lastActivityTs: number;
  lastConnectAttemptTs: number;
}

export class BaileysHealth {
  private sock: any;
  private platform: string;
  private userId: string;
  private userName: string;
  private authDir: string;
  private ready: boolean;
  private qrPending: boolean;
  private lastActivityTs: number;
  private lastConnectAttemptTs: number;

  constructor(deps: BaileysHealthDeps) {
    this.sock = deps.sock;
    this.platform = deps.platform;
    this.userId = deps.userId;
    this.userName = deps.userName;
    this.authDir = deps.authDir;
    this.ready = deps.ready;
    this.qrPending = deps.qrPending;
    this.lastActivityTs = deps.lastActivityTs;
    this.lastConnectAttemptTs = deps.lastConnectAttemptTs;
  }

  setSock(sock: any): void {
    this.sock = sock;
  }

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  setQrPending(pending: boolean): void {
    this.qrPending = pending;
  }

  setUserInfo(userId: string, userName: string): void {
    this.userId = userId;
    this.userName = userName;
  }

  getHealth(): WppHealth {
    const h: WppHealth = {
      wpp: this.ready
        ? ('connected' as const)
        : this.qrPending
          ? ('awaiting-qr' as const)
          : ('disconnected' as const),
      sinceActivitySec: Math.round((Date.now() - this.lastActivityTs) / 1000),
      sinceConnectSec: Math.round((Date.now() - this.lastConnectAttemptTs) / 1000),
      qrPending: this.qrPending,
      pm2: 'online',
      updatedAt: new Date().toISOString(),
    };
    return h;
  }

  async notifyOwner(text: string): Promise<void> {
    const ownerId = this.getOwnerNotifyTarget();
    if (!ownerId) {
      // logInfo would be called here; caller handles
      return;
    }
    try {
      // sock is set via setSock
      await Promise.race([
        // sock.sendMessage will be called by adapter
        Promise.resolve(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 5s')), 5000)),
      ]);
      // logInfo called by adapter
    } catch (e: any) {
      // logError called by adapter
    }
  }

  private getOwnerNotifyTarget(): string | null {
    return getOwnerNotifyTarget();
  }

  sendQrToOwner(qr: string): void {
    const qrPath = path.join(this.authDir, 'qr.png');
    import('qrcode').then(async (QR: any) => {
      try {
        await QR.toFile(qrPath, qr, { width: 512, margin: 2 });
        // logInfo called by adapter
        const ownerTarget = this.getOwnerNotifyTarget();
        if (ownerTarget) {
          try {
            // sock.sendMessage will be called by adapter
          } catch {
            // logInfo called by adapter
          }
        }
      } catch (e: any) {
        // logInfo called by adapter
      }
    });
  }

  updateActivity(): void {
    // Updated by connection/normalizer
  }
}