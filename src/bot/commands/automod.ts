// src/bot/commands/automod.ts
/**
 * Liga/desliga o AutoMod (moderação automática) no grupo atual.
 * Persistido em SQLite por grupo. Default: DESLIGADO em grupos novos.
 * Uso: $automod on  |  $automod off
 */
import { ICommand } from './types';
import { isMaster } from '../../services/permissions';
import { setAutoModEnabledDB } from '../../services/databaseService';
import { groupTag } from './format';

export const automodCommand: ICommand = {
  name: 'automod',
  description: 'Ativa ou desativa a moderação automática (AutoMod) no grupo. Uso: $automod on|off',
  async execute(ctx: any) {
    const args = ctx.args || [];
    const action = String(args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(action)) {
      return ctx.reply('⚠️ Uso: `$automod on` ou `$automod off`');
    }
    const enable = action === 'on';
    const isAdmin = ctx.isMaster || ctx.isAdmin || isMaster(ctx.userId);
    if (!isAdmin) {
      return ctx.reply('🚫 Apenas administradores podem usar este comando.');
    }
    const chatId = ctx.chatId;
    if (!chatId || !String(chatId).endsWith('@g.us')) {
      return ctx.reply('⚠️ Este comando só funciona em grupos.');
    }
    await setAutoModEnabledDB(chatId, enable);
    return ctx.reply(`🛡️ AutoMod ${enable ? 'ATIVADO' : 'DESATIVADO'} neste grupo${groupTag(ctx)}.`);
  },
};
