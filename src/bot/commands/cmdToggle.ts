// src/bot/commands/cmdToggle.ts
/**
 * Admin command to enable or disable other commands per group.
 * Usage: `/cmd enable <command>` or `/cmd disable <command>`
 */
import { ICommand } from './types';
import { commandConfigService } from '../../services/commandConfigService';
import { CommandConfigService } from '../../services/commandConfigService';

/** Class version for legacy test compatibility */
export class CmdToggle implements ICommand {
  name = 'cmd';
  description = 'Ativa ou desativa comandos em um grupo (admin only).';
  private configService: CommandConfigService;

  constructor(configService?: CommandConfigService) {
    // Allow injection for tests, default to the singleton service
    this.configService = configService ?? commandConfigService;
  }

  async execute(msg: any) {
    // Extract arguments from the message text (e.g., '/toggle ping on')
    const parts = (msg.text ?? '').trim().split(/\s+/);
    // Expect command name followed by action and target command
    // Example: ['/toggle', 'ping', 'on']
    if (parts.length < 3) {
      return '⚠️ Uso: `/toggle <comando> on|off`';
    }
    const [, targetCmd, actionRaw] = parts;
    const action = actionRaw.toLowerCase();
    if (!['on', 'off', 'enable', 'disable'].includes(action)) {
      return '⚠️ Ação inválida. Use `on`/`off` ou `enable`/`disable`.';
    }
    const enable = action === 'on' || action === 'enable';
    // Simple admin check: master user ID considered admin
    const isAdmin = msg.userId === 'master' || msg.isAdmin || msg.isMaster;
    if (!isAdmin) {
      return '🚫 Apenas administradores podem usar este comando.';
    }
    const chatId = msg.chat?.id || msg.chatId;
    if (!chatId) {
      return '⚠️ Não foi possível determinar o grupo atual.';
    }
    // Use synchronous config service method
    this.configService.setCommandEnabled(targetCmd, chatId, enable);
    return `✅ Comando \`${targetCmd}\` ${enable ? 'ativado' : 'desativado'} neste grupo.`;
  }
}

/** Command object used by the runtime registration system */
export const cmdToggleCommand: ICommand = {
  name: 'cmd',
  description: 'Ativa ou desativar comandos em um grupo (admin only).',
  async execute(msg: any, client: any, args: string[]) {
    const toggler = new CmdToggle();
    // The legacy CmdToggle expects only the message; ignore client/args for compatibility
    return await toggler.execute(msg);
  },
};
