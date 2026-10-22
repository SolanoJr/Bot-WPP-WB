// src/bot/commands/cmdToggle.ts
/**
 * Admin command to enable or disable other commands per group.
 * Usage: `$cmd <comando> on|off`  (ex: $cmd autoban on, $cmd sarcasmo off)
 * Persistido em SQLite por grupo (tabela command_state). Em grupos novos,
 * comandos começam LIGADOS (default habilitado). O dispatcher consulta o
 * estado antes de executar (INC-015 D2); $cmd é imune ao próprio gate.
 */
import { ICommand } from './types';
import { commandConfigService } from '../../services/commandConfigService';

export const cmdToggleCommand: ICommand = {
  name: 'cmd',
  description: 'Ativa ou desativa comandos em um grupo (admin only). Uso: $cmd <comando> on|off',
  async execute(ctx: any) {
    const args = ctx.args || [];
    if (args.length < 2) {
      return ctx.reply('⚠️ Uso: `$cmd <comando> on|off`\nEx: `$cmd autoban on`');
    }
    const [targetCmd, actionRaw] = args;
    const action = String(actionRaw).toLowerCase();
    if (!['on', 'off', 'enable', 'disable'].includes(action)) {
      return ctx.reply('⚠️ Ação inválida. Use `on`/`off`.');
    }
    const enable = action === 'on' || action === 'enable';

    // Apenas MASTER ou admin do grupo pode usar
    const isAdmin = ctx.isMaster || ctx.isAdmin;
    if (!isAdmin) {
      return ctx.reply('🚫 Apenas administradores podem usar este comando.');
    }

    const chatId = ctx.chatId;
    if (!chatId) {
      return ctx.reply('⚠️ Não foi possível determinar o grupo atual.');
    }

    await commandConfigService.setEnabled(chatId, targetCmd, enable);
    return ctx.reply(`✅ Comando \`${targetCmd}\` ${enable ? 'ativado' : 'desativado'} neste grupo.`);
  },
};
