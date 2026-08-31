// memberJoinService.ts
// Tratamento de entrada de membros em grupos (engine Baileys/ativo).
// Verifica se o membro que entrou está banido e, se estiver, remove-o.
import { isUserBanned, banUser } from './databaseService.js';

interface MemberJoinContext {
  removeParticipant: (groupId: string, userId: string) => Promise<void>;
  sendMessage?: (groupId: string, text: string) => Promise<void>;
}

interface MemberJoinEvent {
  groupId: string;
  members: { id: string; name?: string }[];
}

/**
 * Para cada membro que entrou, se estiver banido no grupo, remove-o.
 */
export async function handleMemberJoin(
  ctx: MemberJoinContext,
  event: MemberJoinEvent
): Promise<void> {
  for (const member of event.members) {
    try {
      const banned = await isUserBanned(event.groupId, member.id);
      if (banned) {
        await ctx.removeParticipant(event.groupId, member.id);
        if (ctx.sendMessage) {
          await ctx.sendMessage(
            event.groupId,
            `🚫 ${member.name || member.id} estava banido e foi removido ao entrar.`
          );
        }
      }
    } catch (err: any) {
      console.error('[memberJoinService] erro ao processar entrada:', err?.message);
    }
  }
}

export { banUser };
