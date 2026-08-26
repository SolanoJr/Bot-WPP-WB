import { ICommand } from './types';
import { groupTag } from './format';
import { unmuteUser } from './mute';

// Normaliza qualquer fonte de ID (string '@c.us'/'@lid' ou objeto) p/ 'clean@c.us'
function normId(id: any): string {
  if (!id) return '';
  const s = typeof id === 'string' ? id : (id._serialized || id.id || '');
  return String(s).replace('@lid', '@c.us').replace(/^wpp:/, '');
}

export const desmuteCommand: ICommand = {
  name: 'desmute',
  description: 'Remove o silenciamento de um usuário. Uso: $desmute @usuario',

  async execute(ctx: any, _client?: any, _args?: any) {
    // msg aqui é o CommandContext; o payload está em msg.msg
    const payload = msg.msg || msg;
    const chat = await ctx.getChat();
    const isGroup = (chat as any).isGroup;

    if (!isGroup) {
      await ctx.reply('❌ Este comando só funciona em grupos.');
      return;
    }

    const mentioned = (payload.mentions && payload.mentions.length)
      ? payload.mentions
      : (payload.mentionedIds || ctx.mentionedIds || []);
    if (!mentioned || mentioned.length === 0) {
      await ctx.reply('❌ Marque o usuário a desmutar. Ex: $desmute @usuario');
      return;
    }

    const userToUnmute = normId(mentioned[0].id ?? mentioned[0]);
    const chatId = normId((chat as any).id?._serialized || (chat as any).id || payload.chatId);
    const ok = unmuteUser(chatId, userToUnmute);

    if (ok) {
      await ctx.reply(`🔊 Usuário desmutado. As mensagens dele não serão mais apagadas.${groupTag(msg)}`);
    } else {
      await ctx.reply(`ℹ️ Este usuário não estava mutado.${groupTag(msg)}`);
    }
  }
};
