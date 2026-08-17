import { ICommand } from './types';
import { groupTag } from './format';

// Conjunto em memória de usuários silenciados por grupo (user@c.us -> expiry timestamp).
// OBS: O WhatsApp Web (WWebJS 1.34.7) NÃO suporta mute de usuário por admin via API
// (o único mute() existente silencia o GRUPO para o próprio bot). Então o bot implementa
// seu próprio "silenciar": ignora mensagens de quem está nesta lista até o expiry.
// TODO: persistir em SQLite (ver PENDING_IMPLEMENTATIONS.md / BUG_TRACKER).
const mutedUsers = new Map<string, number>(); // key: `${chatId}:${userId}` -> expiryEpochMs

export const muteCommand: ICommand = {
    name: 'mute',
    description: 'Silencia um usuário do grupo (implementação do bot; o WA não suporta mute por admin).',

    async execute(msg, client, args) {
        const chat = await msg.getChat();
        const isGroup = (chat as any).isGroup;

        if (!isGroup) {
            await msg.reply('❌ Este comando só funciona em grupos.');
            return;
        }

        const mentioned = (msg.mentions && msg.mentions.length) ? msg.mentions : (msg.mentionedIds || []);
        if (!mentioned || mentioned.length === 0) {
            await msg.reply('❌ Marque o usuário a ser silenciado.');
            return;
        }

        const userToMute = mentioned[0].id ? mentioned[0].id.replace('wpp:', '') : mentioned[0];
        const chatId = (chat as any).id?._serialized || (chat as any).id;
        const key = `${chatId}:${userToMute}`;
        const durationMs = 8 * 60 * 60 * 1000; // 8 horas
        mutedUsers.set(key, Date.now() + durationMs);

        await msg.reply(`✅ Usuário silenciado por 8 horas (o bot vai ignorar mensagens dele nesse período).${groupTag(msg)}`);
    }
};

// Helper usado pelo messageHandler para verificar se um usuário está silenciado.
export function isUserMuted(chatId: string, userId: string): boolean {
    const key = `${chatId}:${userId}`;
    const expiry = mutedUsers.get(key);
    if (!expiry) return false;
    if (Date.now() > expiry) {
        mutedUsers.delete(key);
        return false;
    }
    return true;
}
