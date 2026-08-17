import { ICommand } from './types';
import { groupTag } from './format';

// Usuários silenciados por grupo (user@c.us -> expiry timestamp em ms).
// O WhatsApp Web (WWebJS 1.34.7) NÃO suporta mute de usuário por admin via API
// (o único mute() existente silencia o GRUPO para o próprio bot). Então o bot
// implementa seu próprio "silenciar": apaga TODAS as mensagens de quem está na
// lista (msg.raw.delete(true)) enquanto o mute estiver ativo.
const mutedUsers = new Map<string, number>(); // key: `${chatId}:${userId}` -> expiryEpochMs

export const muteCommand: ICommand = {
    name: 'mute',
    description: 'Silencia um usuário: apaga as mensagens dele no grupo enquanto o mute durar. Uso: $mute @usuario',

    async execute(msg, client, args) {
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

        // msg aqui é o CommandContext; a menção vem do payload em msg.msg.mentions
        const mentioned = (msg.msg?.mentions && msg.msg.mentions.length)
          ? msg.msg.mentions
          : (msg.msg?.mentionedIds || msg.mentionedIds || []);
        if (!mentioned || mentioned.length === 0) {
            await msg.reply('❌ Marque o usuário a ser silenciado. Ex: $mute @usuario');
            return;
        }

        const userToMute = mentioned[0].id ? mentioned[0].id.replace('wpp:', '') : mentioned[0];
        const chatId = (chat as any).id?._serialized || (chat as any).id;
        const key = `${chatId}:${userToMute}`;
        const durationMs = 8 * 60 * 60 * 1000; // 8 horas
        mutedUsers.set(key, Date.now() + durationMs);

        // Apaga a mensagem que disparou o comando (se foi o alvo quem mandou) e confirma
        await msg.reply(`✅ Usuário silenciado por 8 horas: todas as mensagens dele serão apagadas.${groupTag(msg)}`);
    }
};

// Helper usado pelo messageHandler: se o autor estiver mutado, apaga a mensagem.
export async function handleMutedMessage(rawMsg: any): Promise<boolean> {
    try {
        const chatId = rawMsg?.id?._serialized?.split('_')[0] || rawMsg?.chatId || rawMsg?.from;
        const userId = rawMsg?.author || rawMsg?.from;
        if (!chatId || !userId) return false;
        const key = `${chatId}:${userId}`;
        const expiry = mutedUsers.get(key);
        if (!expiry) return false;
        if (Date.now() > expiry) {
            mutedUsers.delete(key);
            return false;
        }
        // Apaga a mensagem de quem foi mutado (delete para todos)
        if (rawMsg?.delete) {
            await rawMsg.delete(true).catch(() => {});
        }
        return true;
    } catch {
        return false;
    }
}
