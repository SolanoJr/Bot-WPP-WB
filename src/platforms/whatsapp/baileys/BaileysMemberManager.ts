/**
 * BaileysMemberManager — Gestão de membros (remove, ban).
 * Extraído de BaileysAdapter.
 */

import { isProtectedTarget } from '../../../services/permissions';
import { toJid } from './util';

export interface BaileysMemberManagerDeps {
  sock: any;
}

export class BaileysMemberManager {
  private sock: any;

  constructor(deps: BaileysMemberManagerDeps) {
    this.sock = deps.sock;
  }

  setSock(sock: any): void {
    this.sock = sock;
  }

  async removeParticipant(chatId: string, userId: string): Promise<void> {
    if (isProtectedTarget(userId)) throw new Error('alvo protegido: operação bloqueada');
    const jid = chatId; // assumes normalized
    const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
    await this.sock.groupParticipantsUpdate(jid, [userJid], 'remove');
  }

  async banParticipant(chatId: string, userId: string): Promise<void> {
    if (isProtectedTarget(userId)) throw new Error('alvo protegido: operação bloqueada');
    const jid = chatId;
    const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
    await this.sock.groupParticipantsUpdate(jid, [userJid], 'remove');
    await this.sock.updateBlockStatus(userJid, 'block').catch(() => {});
  }
}