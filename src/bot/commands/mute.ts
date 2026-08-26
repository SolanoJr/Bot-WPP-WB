import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { groupTag } from './format';
import { isProtectedTarget } from '../../services/permissions';
import { normalizeTargetId, resolveTargetId } from './targetResolver';

// Usuários silenciados por grupo (user@c.us -> expiry timestamp em ms).
// O WhatsApp Web (WWebJS 1.34.7) NÃO suporta mute de usuário por admin via API
// (o único mute() existente silencia o GRUPO para o próprio bot). Então o bot
// implementa seu próprio "silenciar": apaga TODAS as mensagens de quem está na
// lista (raw.delete(true)) enquanto o mute estiver ativo.
const mutedUsers = new Map<string, number>(); // key: `${chatId}:${userId}` -> expiryEpochMs

// Normaliza qualquer fonte de ID para a chave do mute.
// ⚠️ CORREÇÃO DE BUG: a versão anterior fazia `.replace('@lid','@c.us')`, o que
// destruía o identificador. O comando gravava a chave com '@c.us' enquanto o
// messageHandler consultava com '@lid' original: a chave nunca casava e o mute
// era registrado mas NUNCA aplicado. Agora o domínio é preservado.
function normId(id: any): string {
  if (!id) return '';
  const s = typeof id === 'string' ? id : (id._serialized || id.id || '');
  return normalizeTargetId(String(s));
}

export const muteCommand: ICommand = {
    name: 'mute',
    description: 'Silencia um usuário: apaga as mensagens dele no grupo enquanto o mute durar. Uso: $mute @usuario',

    async execute(ctx: CommandContext) {
        const payload: any = ctx.msg;
        const args = ctx.args || [];
        const chat = await ctx.getChat();
        const isGroup = (chat as any).isGroup;

        if (!isGroup) {
            await ctx.reply('❌ Este comando só funciona em grupos.');
            return;
        }

        // $mute grupo -> modo só admins digitam (WWebJS Chat.setMessagesAdminsOnly)
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'grupo' || sub === 'group') {
            const off = (args[1] || '').toLowerCase() === 'off';
            try {
                const wppChat = (chat as any).raw || chat;
                await wppChat.setMessagesAdminsOnly(!off);
                await ctx.reply(off
                    ? `🔊 Modo "só admins" DESATIVADO. Todos podem digitar.${groupTag(ctx)}`
                    : `🔇 Modo "só admins" ATIVADO. Apenas administradores podem enviar mensagens.${groupTag(ctx)}`);
            } catch (e: any) {
                await ctx.reply(`⚠️ Não consegui alterar o modo do grupo: ${e?.message || e}`);
            }
            return;
        }

        // $mute off @pessoa -> desmuta
        if (sub === 'off') {
            const userToUnmute = resolveTargetId(ctx);
            if (!userToUnmute) {
                await ctx.reply('❌ Marque o usuário a desmutar. Ex: $mute off @usuario');
                return;
            }
            const chatId = normalizeTargetId(ctx.chatId);
            const key = `${chatId}:${userToUnmute}`;
            if (mutedUsers.delete(key)) {
                await ctx.reply(`🔊 Usuário desmutado. As mensagens dele não serão mais apagadas.${groupTag(ctx)}`);
            } else {
                await ctx.reply(`ℹ️ Este usuário não estava mutado.${groupTag(ctx)}`);
            }
            return;
        }

        const userToMute = resolveTargetId(ctx);
        if (!userToMute) {
            await ctx.reply('❌ Marque o usuário a ser silenciado. Ex: $mute @usuario');
            return;
        }
        const chatId = normalizeTargetId(ctx.chatId);

        // PROTEÇÃO: nunca silenciar o MASTER ou o próprio bot
        if (isProtectedTarget(userToMute)) {
            await ctx.reply('🛡️ Você não pode silenciar o dono (MASTER) ou o próprio bot.');
            return;
        }

        const key = `${chatId}:${userToMute}`;
        const durationMs = 8 * 60 * 60 * 1000; // 8 horas
        mutedUsers.set(key, Date.now() + durationMs);
        console.log(`[mute] GRAVOU mute: key=${key} expiraEm=${(durationMs/3600000)}h`);

        await ctx.reply(`✅ Usuário silenciado por 8 horas: todas as mensagens dele serão apagadas.${groupTag(ctx)}`);
    }
};

// Remove um usuário da lista de mutados (usado por $desmute e $mute off)
export function unmuteUser(chatId: string, userId: string): boolean {
  const key = `${normId(chatId)}:${normId(userId)}`;
  const ok = mutedUsers.delete(key);
  if (ok) console.log(`[mute] DESMUTE: key=${key}`);
  return ok;
}

// Helper usado pelo messageHandler: se o autor estiver mutado, apaga a mensagem.
export async function handleMutedMessage(platformMsg: any): Promise<boolean> {
    try {
        const raw = platformMsg?.raw || platformMsg;
        // chatId: do payload (correto) ou do _serialized (true_<chat>_<mid>_<author>)
        let chatId = platformMsg?.chatId || platformMsg?.from;
        if (!chatId && raw?.id?._serialized) {
            const parts = raw.id._serialized.split('_');
            chatId = parts[1] && parts[1].includes('@') ? parts[1] : (raw.id.remote || raw.from);
        }
        const userId = platformMsg?.userId || raw?.author || raw?.from;
        const chatKey = normId(chatId);
        const userKey = normId(userId);
        if (!chatKey || !userKey) return false;
        const key = `${chatKey}:${userKey}`;
        const expiry = mutedUsers.get(key);
        console.log(`[mute] checando mute: key=${key} -> ${expiry ? 'MUTADO' : 'livre'}`);
        if (!expiry) return false;
        if (Date.now() > expiry) {
            mutedUsers.delete(key);
            console.log(`[mute] mute expirado, removido: ${key}`);
            return false;
        }
        if (raw?.delete) {
            await raw.delete(true).catch((e: any) => console.error('[mute] falha ao apagar msg mutada:', e?.message));
            console.log('[mute] MENSAGEM DE MUTADO APAGADA');
            return true;
        }
        return false;
    } catch (e: any) {
        console.error('[mute] erro em handleMutedMessage:', e?.message);
        return false;
    }
}
