// src/services/memberJoinService.ts
// Tratamento de entrada de membros em grupos (engine Baileys/ativo).
//
// Responsabilidades:
//   1. ban-on-rejoin: se o membro está banido no grupo, remove-o;
//   2. welcome: se `bemvindo=1`, envia a mensagem de boas-vindas do grupo
//      (configurável por grupo, persistida em SQLite).
//
// Chamado por BaileysAdapter.handleGroupParticipantsUpdate(), alimentado pelo
// evento `group-participants.update` do Baileys.
import {
  isUserBanned,
  banUser,
  recordMemberJoin,
  recordMemberRemove,
  getGroupMod,
} from './databaseService.js';
import { resolveWelcome } from './welcomeService.js';
import logger from './loggerService';
import { isProtectedTarget } from './permissions.js';

interface MemberJoinContext {
  removeParticipant: (groupId: string, userId: string) => Promise<void>;
  sendMessage?: (groupId: string, text: string, mentions?: string[]) => Promise<void>;
  /** Nome do grupo, para o placeholder {grupo}. */
  resolveGroupName?: (groupId: string) => Promise<string>;
}

interface MemberJoinEvent {
  groupId: string;
  members: (string | { id: string; name?: string; phoneNumber?: string })[];
}

/** Helper: extrai o ID do membro (string ou objeto). */
function idOf(member: any): string {
  if (!member) return '';
  if (typeof member === 'string') return member;
  if (typeof member.id === 'string') return member.id;
  if (typeof member.jid === 'string') return member.jid;
  if (typeof member.user === 'string') return member.user;
  if (typeof member.phoneNumber === 'string') return member.phoneNumber;
  return String(member.id || member.jid || '');
}

/** Helper: extrai o nome display do membro. */
function nameOf(member: string | { id: string; name?: string }): string {
  return typeof member === 'string' ? '' : (member.name || '');
}

/** Helper: extrai o número (PN) do membro, quando disponível. */
function pnOf(member: any): string {
  if (!member || typeof member === 'string') return '';
  return member.phoneNumber || '';
}

/** Número legível a partir de um JID/PN (apenas dígitos). */
function numeroDe(jid: string): string {
  return String(jid || '').replace(/@.*$/, '').replace(/\D/g, '');
}

/**
 * Para cada membro que entrou:
 *   - se estiver banido no grupo → remove-o (com blindagem de ID protegido);
 *   - senão, se `bemvindo=1` → envia a mensagem de boas-vindas do grupo.
 *
 * Ignora eventos sem grupo ou sem membros.
 */
export async function handleMemberJoin(
  ctx: MemberJoinContext,
  event: MemberJoinEvent,
): Promise<void> {
  if (!event.groupId || event.members.length === 0) return;

  // Config do grupo — lida uma vez para todos os membros do evento.
  let bemvindoOn = false;
  try {
    const cfg = await getGroupMod(event.groupId);
    bemvindoOn = cfg.bemvindo === true;
  } catch (e: any) {
    logger.warn('[memberJoinService] falha ao ler config do grupo', {
      groupId: event.groupId, error: e?.message,
    });
  }

  let groupName = '';
  if (bemvindoOn && ctx.resolveGroupName) {
    try { groupName = await ctx.resolveGroupName(event.groupId); } catch { /* opcional */ }
  }

  for (const member of event.members) {
    try {
      const id = idOf(member);
      await recordMemberJoin(event.groupId, id);

      const banned = await isUserBanned(event.groupId, id);
      if (banned) {
        // Blindagem: ID protegido (MASTER/BOT/ADMIN) não é removido mesmo se
        // estiver na lista de banidos.
        if (isProtectedTarget(id)) {
          logger.warn('[memberJoinService] Entrada de ID protegido banido ignorada', {
            groupId: event.groupId,
            memberId: id,
          });
          continue;
        }
        await ctx.removeParticipant(event.groupId, id);
        await recordMemberRemove(event.groupId, id, 'ban');
        if (ctx.sendMessage) {
          await ctx.sendMessage(
            event.groupId,
            `🚫 ${nameOf(member) || id} foi banido e removido do grupo.`,
          );
        }
        continue; // banido não recebe welcome
      }

      // ─── WELCOME ───
      if (!bemvindoOn || !ctx.sendMessage) continue;

      const nome = nameOf(member);
      const numero = numeroDe(pnOf(member) || id);
      const { text } = await resolveWelcome(event.groupId, {
        nome: nome || numero,
        numero,
        grupo: groupName,
      });

      // Menciona o novato quando possível (o WhatsApp renderiza @numero).
      const mentions = id.includes('@') ? [id] : [];
      await ctx.sendMessage(event.groupId, text, mentions);

      logger.info('[memberJoinService] welcome enviado', {
        groupId: event.groupId, memberId: id,
      });
    } catch (err: any) {
      logger.error('[memberJoinService] Erro ao processar entrada', {
        groupId: event.groupId,
        member: idOf(member),
        error: err?.message
      });
    }
  }
}

export { banUser };
