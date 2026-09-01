// src/services/memberJoinService.ts
// Tratamento de entrada de membros em grupos (engine Baileys/ativo).
// Verifica se o membro que entrou está banido e, se estiver, remove-o.
import {
  isUserBanned,
  banUser,
  recordMemberJoin,
  recordMemberRemove,
} from './databaseService.js';

interface MemberJoinContext {
  removeParticipant: (groupId: string, userId: string) => Promise<void>;
  sendMessage?: (groupId: string, text: string) => Promise<void>;
}

interface MemberJoinEvent {
  groupId: string;
  members: (string | { id: string; name?: string })[];
}

/** Helper: extrai o ID do membro (string ou objeto). */
function idOf(member: string | { id: string; name?: string }): string {
  return typeof member === 'string' ? member : member.id;
}

/** Helper: extrai o nome display do membro. */
function nameOf(member: string | { id: string; name?: string }): string {
  return typeof member === 'string' ? '' : (member.name || '');
}

/**
 * Para cada membro que entrou, se estiver banido no grupo, remove-o.
 * Ignora eventos sem grupo ou sem membros.
 */
export async function handleMemberJoin(
  ctx: MemberJoinContext,
  event: MemberJoinEvent,
): Promise<void> {
  if (!event.groupId || event.members.length === 0) return;
  for (const member of event.members) {
    try {
      const id = idOf(member);
      await recordMemberJoin(event.groupId, id);
      const banned = await isUserBanned(event.groupId, id);
      if (banned) {
        await ctx.removeParticipant(event.groupId, id);
        await recordMemberRemove(event.groupId, id, 'ban');
        if (ctx.sendMessage) {
          await ctx.sendMessage(
            event.groupId,
            `🚫 ${nameOf(member) || id} foi banido e removido do grupo.`,
          );
        }
      }
    } catch (err: any) {
      console.error('[memberJoinService] erro:', err?.message);
    }
  }
}

export { banUser };
