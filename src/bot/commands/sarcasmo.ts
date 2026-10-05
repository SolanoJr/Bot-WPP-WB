import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { findParticipant } from '../../services/groupAdmin';
import { setGroupModField, getGroupAutomationStatus } from '../../services/databaseService';
import { groupTag } from './format';

/**
 * $sarcasmo — automação de resposta sarcástica.
 *
 *   $sarcasmo on|off|status
 *
 * INDEPENDENTE do AutoMod. Não modera, não pune.
 */
export const sarcasmoCommand: ICommand = {
  name: 'sarcasmo',
  description: 'Ativa/desativa a resposta sarcástica do bot no grupo.',
  async execute(ctx) {
    const chat = await ctx.getChat();
    const args = (ctx.args || []).map((a: string) => a.toLowerCase());
    const sub = args[0] || 'status';

    if (!chat.isGroup) {
      return ctx.reply('⚠️ A configuração de sarcasmo só pode ser feita em grupos.');
    }

    const isAdmin = ctx.isMaster || ctx.isAdmin || isMaster(ctx.userId);
    if (!isAdmin) {
      const member = findParticipant(chat, ctx.userId);
      if (!member || (!member.isAdmin && !member.isSuperAdmin)) {
        return ctx.reply('🚫 Apenas administradores podem configurar o sarcasmo.');
      }
    }

    if (sub === 'on' || sub === 'off') {
      await setGroupModField(chat.id, 'sarcasmo', sub === 'on');
      return ctx.reply(`✅ Sarcasmo ${sub === 'on' ? 'ATIVADO' : 'DESATIVADO'} neste grupo${groupTag(ctx)}.`);
    }

    if (sub === 'status') {
      const { config } = await getGroupAutomationStatus(chat.id);
      const ativo = config.sarcasmo === true;
      return ctx.reply(
        `${ativo ? '✅' : '⛔'} *Sarcasmo:* ${ativo ? 'ATIVADO' : 'DESATIVADO'}\n\n` +
        `Quando alguém mencionar o bot ou usar a palavra "bot", o bot responde:\n` +
        `"tenho nada ver com isso sinhô"${groupTag(ctx)}`
      );
    }

    return ctx.reply(
      `⚠️ Uso:\n` +
      `\`$sarcasmo on|off\` — ativa/desativa\n` +
      `\`$sarcasmo status\` — mostra o estado${groupTag(ctx)}`
    );
  }
};
