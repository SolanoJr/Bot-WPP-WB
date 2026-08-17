import { ICommand } from './types';
import { groupTag } from './format';

// Usuários silenciados por grupo (user@c.us -> expiry timestamp em ms).
// O WhatsApp Web (WWebJS 1.34.7) NÃO suporta mute de usuário por admin via API
// (o único mute() existente silencia o GRUPO para o próprio bot). Então o bot
// implementa seu próprio "silenciar": apaga TODAS as mensagens de quem está na
// lista (raw.delete(true)) enquanto o mute estiver ativo.
const mutedUsers = new Map<string, number>(); // key: `${chatId}:${userId}` -> expiryEpochMs

// Normaliza qualquer fonte de ID (string '@c.us'/'\@lid' ou objeto {_serialized}) p/ 'clean@c.us'
function normId(id: any): string {
  if (!id) return '';
  const s = typeof id === 'string' ? id : (id._serialized || id.id || '');
  return String(s).replace('@lid', '@c.us').replace(/^wpp:/, '');
}

export const muteCommand: ICommand = {
    name: 'mute',
    description: 'Silencia um usuário: apaga as mensagens dele no grupo enquanto o mute durar. Uso: $mute @usuario',

    async execute(msg: any, client: any, args: any[]) {
        // msg aqui é o CommandContext; o payload está em msg.msg
        const payload = msg.msg || msg;
        const chat = await msg.getChat();
        const isGroup = (chat as any).isGroup;

        if (!isGroup) {
            await msg.reply('❌ Este comando só funciona em grupos.');
            return;
        }

        // $mute grupo -> modo só admins digitam
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'grupo' || sub === 'group') {
            const off = (args[1] || '').toLowerCase() === 'off';
            try {
                await (chat as any).setMessagesAdminsOnly(!off);
                await msg.reply(off
                    ? `🔊 Modo "só admins" DESATIVADO. Todos podem digitar.${groupTag(msg)}`
                    : `🔇 Modo "só admins" ATIVADO. Apenas administradores podem enviar mensagens.${groupTag(msg)}`);
            } catch (e: any) {
                await msg.reply(`⚠️ Não consegui alterar o modo do grupo: ${e?.message || e}`);
            }
            return;
        }

        // $mute off @pessoa -> desmuta
        if (sub === 'off') {
            const mentioned = (payload.mentions && payload.mentions.length)
              ? payload.mentions
              : (payload.mentionedIds || msg.mentionedIds || []);
            if (!mentioned || mentioned.length === 0) {
                await msg.reply('❌ Marque o usuário a desmutar. Ex: $mute off @usuario');
                return;
            }
            const userToUnmute = normId(mentioned[0].id ?? mentioned[0]);
            const chatId = normId((chat as any).id?._serialized || (chat as any).id || payload.chatId);
            const key = `${chatId}:${userToUnmute}`;
            if (mutedUsers.delete(key)) {
                await msg.reply(`🔊 Usuário desmutado. As mensagens dele não serão mais apagadas.${groupTag(msg)}`);
            } else {
                await msg.reply(`ℹ️ Este usuário não estava mutado.${groupTag(msg)}`);
            }
            return;
        }

        const mentioned = (payload.mentions && payload.mentions.length)
          ? payload.mentions
          : (payload.mentionedIds || msg.mentionedIds || []);
        if (!mentioned || mentioned.length === 0) {
            await msg.reply('❌ Marque o usuário a ser silenciado. Ex: $mute @usuario');
            return;
        }

        const userToMute = normId(mentioned[0].id ?? mentioned[0]);
        const chatId = normId((chat as any).id?._serialized || (chat as any).id || payload.chatId);
        const key = `${chatId}:${userToMute}`;
        const durationMs = 8 * 60 * 60 * 1000; // 8 horas
        mutedUsers.set(key, Date.now() + durationMs);
        console.log(`[mute] GRAVOU mute: key=${key} expiraEm=${(durationMs/3600000)}h`);

        await msg.reply(`✅ Usuário silenciado por 8 horas: todas as mensagens dele serão apagadas.${groupTag(msg)}`);
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
