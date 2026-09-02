import { ICommand, CommandContext } from './types';
import { groupTag } from './format';
import { getMentionedIds, normalizeTargetId } from './targetResolver';
import { isProtectedTarget } from '../../services/permissions';

const mutedUsers = new Map<string, number>();

function muteKey(chatId: string, userId: string): string {
    return `${normalizeTargetId(chatId)}:${normalizeTargetId(userId)}`;
}

export const muteCommand: ICommand = {
    name: 'mute',
    description: 'Silencia um usuário do grupo.',
    
    async execute(ctx) {
        const chat = await ctx.getChat();
        if (!chat.isGroup) {
            await ctx.reply('❌ Este comando só funciona em grupos.');
            return;
        }
        
        const mentioned = getMentionedIds(ctx);
        if (mentioned.length === 0) {
            await ctx.reply('❌ Marque o usuário a ser silenciado.');
            return;
        }
        
        const userToMute = normalizeTargetId(mentioned[0]);
        if (isProtectedTarget(userToMute)) {
            await ctx.reply('🛡️ O dono e o próprio bot nunca podem ser silenciados.');
            return;
        }

        const key = muteKey(ctx.chatId, userToMute);
        if (ctx.args?.[0]?.toLowerCase() === 'off') {
            mutedUsers.delete(key);
            await ctx.reply(`🔊 Usuário desmutado.${groupTag(ctx)}`);
            return;
        }

        mutedUsers.set(key, Date.now() + 8 * 60 * 60 * 1000);
        await ctx.reply(`✅ Usuário silenciado por 8 horas.${groupTag(ctx)}`);
    }
};

/**
 * Desmuta um usuário do grupo (usado por $desmute).
 * No WhatsApp/Baileys, mute com duração 0 equivale a desmutar.
 */
export async function unmuteUser(targetId: string, ctx: CommandContext): Promise<void>;
export async function unmuteUser(chatId: string, targetId: string): Promise<void>;
export async function unmuteUser(targetIdOrChatId: string, ctxOrTarget: CommandContext | string): Promise<void> {
    if (typeof ctxOrTarget === 'string') {
        mutedUsers.delete(muteKey(targetIdOrChatId, ctxOrTarget));
        return;
    }
    mutedUsers.delete(muteKey(ctxOrTarget.chatId, targetIdOrChatId));
}

export async function handleMutedMessage(input: {
    chatId: string;
    userId: string;
    raw?: { delete?: (force?: boolean) => Promise<unknown> };
}): Promise<boolean> {
    const key = muteKey(input.chatId, input.userId);
    const expiresAt = mutedUsers.get(key);
    if (!expiresAt) return false;
    if (expiresAt <= Date.now()) {
        mutedUsers.delete(key);
        return false;
    }
    if (typeof input.raw?.delete === 'function') await input.raw.delete(true);
    return true;
}
