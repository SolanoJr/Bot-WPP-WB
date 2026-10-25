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

  /**
   * Promove a administrador do grupo. Correção de 25/out: o $promover era
   * comando quebrado — a interface antiga promote(userId) não tinha chatId
   * e nenhum adapter implementava, então respondia "não suportado" até no
   * WhatsApp. Assinatura nova alinhada ao banParticipant.
   */
  async promoteParticipant(chatId: string, userId: string): Promise<void> {
    if (isProtectedTarget(userId)) throw new Error('alvo protegido: operação bloqueada');
    const userJid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
    const result = await this.sock.groupParticipantsUpdate(chatId, [userJid], 'promote');
    for (const r of result ?? []) {
      // Baileys devolve status por participante: só '200' é sucesso.
      if (r.status !== '200') {
        throw new Error(`groupParticipantsUpdate respondeu ${r.status} para ${r.participant ?? userJid}`);
      }
    }
  }
}