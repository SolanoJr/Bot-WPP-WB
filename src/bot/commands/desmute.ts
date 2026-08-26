import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
import { groupTag } from './format';
import { unmuteUser } from './mute';
import { normalizeTargetId, resolveTargetId } from './targetResolver';

// Normaliza ID preservando o domínio (@lid continua @lid). Ver targetResolver.
function normId(id: any): string {
  if (!id) return '';
  const s = typeof id === 'string' ? id : (id._serialized || id.id || '');
  return normalizeTargetId(String(s));
}

export const desmuteCommand: ICommand = {
  name: 'desmute',
  description: 'Remove o silenciamento de um usuário. Uso: $desmute @usuario',

  async execute(ctx: CommandContext) {
    const payload: any = ctx.msg;
    const chat = await ctx.getChat();
    const isGroup = (chat as any).isGroup;

    if (!isGroup) {
      await ctx.reply('❌ Este comando só funciona em grupos.');
      return;
    }

    const userToUnmute = resolveTargetId(ctx);
    if (!userToUnmute) {
      await ctx.reply('❌ Marque o usuário a desmutar. Ex: $desmute @usuario');
      return;
    }

    const chatId = normalizeTargetId(ctx.chatId);
    const ok = unmuteUser(chatId, userToUnmute);

    if (ok) {
      await ctx.reply(`🔊 Usuário desmutado. As mensagens dele não serão mais apagadas.${groupTag(ctx)}`);
    } else {
      await ctx.reply(`ℹ️ Este usuário não estava mutado.${groupTag(ctx)}`);
    }
  }
};
