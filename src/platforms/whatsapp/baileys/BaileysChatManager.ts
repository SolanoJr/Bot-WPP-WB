/**
 * BaileysChatManager — Gerenciamento de chats, usuários e resolução de JIDs.
 * Extraído de BaileysAdapter.
 */

import { logWarning } from '../../../services/loggerService';
import { normId, toJid } from './util';

export interface BaileysChatManagerDeps {
  sock: any;
  platform: string;
  userId: string;
}

export interface PlatformChat {
  id: string;
  platform: string;
  name: string;
  isGroup: boolean;
  /** Objetos de participante (id + phoneNumber + isAdmin/isSuperAdmin). */
  participants: Array<{
    id: string;
    phoneNumber?: string;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    raw?: any;
  }>;
  raw: any;
}

export interface PlatformUser {
  id: string;
  platform: string;
  name: string;
  isBot: boolean;
  raw: any;
}

export class BaileysChatManager {
  private sock: any;
  private platform: string;
  private userId: string;

  constructor(deps: BaileysChatManagerDeps) {
    this.sock = deps.sock;
    this.platform = deps.platform;
    this.userId = deps.userId;
  }

  setSock(sock: any): void {
    this.sock = sock;
  }

  async getChat(chatId: string): Promise<any> {
    const jid = chatId; // assumes already normalized
    const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([
        p,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

    const metadata = await withTimeout<any>(
      this.sock.groupMetadata(jid).catch(() => null),
      5000
    );

    return {
      id: jid,
      platform: this.platform,
      name: metadata?.subject || '',
      isGroup: jid.endsWith('@g.us'),
      // Participantes como OBJETOS (id + phoneNumber + isAdmin/isSuperAdmin).
      // kick.ts/ban.ts precisam de isAdmin; o metadata já traz phoneNumber, que
      // é a única fonte confiável da relação LID↔PN.
      participants: (metadata?.participants || []).map((p: any) => ({
        id: String(p?.id ?? ''),
        phoneNumber: p?.phoneNumber ?? p?.phone_number ?? undefined,
        isAdmin: p?.admin === 'admin' || p?.isAdmin === true,
        isSuperAdmin: p?.admin === 'superadmin' || p?.isSuperAdmin === true,
        raw: p,
      })),
      // Metadata obtido com sucesso e participantes presentes → permissões verificadas.
      // Sem metadata → NÃO assumir admin (o comando deve recusar, não prosseguir).
      isPermissionsVerified: Boolean(metadata && Array.isArray(metadata.participants)),
      raw: metadata || {},
    };
  }

  async getUser(userId: string): Promise<any> {
    const jid = userId.includes('@') ? userId : `${userId}@s.whatsapp.net`;
    const contact = await this.sock.contactFetch?.(jid).catch(() => null);
    return {
      id: jid,
      platform: this.platform,
      name: contact?.name || contact?.notify || '',
      isBot: false,
      raw: contact || {},
    };
  }

  async getNumberId(phone: string): Promise<{ serialized: string; lid?: string } | null> {
    const clean = String(phone).replace(/[^0-9]/g, '');
    if (!clean) return null;
    const jid = `${clean}@s.whatsapp.net`;
    try {
      const [res] = await this.sock.onWhatsApp(jid);
      if (res && res.exists) return { serialized: res.jid, lid: res.lid };
      return null;
    } catch (err: any) {
      // logWarning is not available here; caller handles
      return null;
    }
  }

  async getContactById(id: string): Promise<any> {
    const jid = id.includes('@') ? id : `${id}@s.whatsapp.net`;
    try {
      const [res] = await this.sock.onWhatsApp(jid);
      if (!res || !res.exists) return null;
      return {
        id: res.jid,
        name: '',
        platform: 'whatsapp',
        raw: res,
      };
    } catch (err: any) {
      return null;
    }
  }

  async getChats(): Promise<any[]> {
    const chats = await this.sock.groupFetchAllParticipating?.().catch(() => ({}));
    return Object.values(chats || {}).map((c: any) => ({
      id: c.id ?? '',
      platform: this.platform,
      name: c.subject || c.name || '',
      isGroup: true,
      participants: (c.participants || []).map((p: any) => ({
        id: String(p?.id ?? ''),
        phoneNumber: p?.phoneNumber ?? p?.phone_number ?? undefined,
        isAdmin: p?.admin === 'admin' || p?.isAdmin === true,
        isSuperAdmin: p?.admin === 'superadmin' || p?.isSuperAdmin === true,
        raw: p,
      })),
      raw: c,
    }));
  }
}