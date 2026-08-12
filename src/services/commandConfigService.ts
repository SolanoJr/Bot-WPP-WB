// src/services/commandConfigService.ts
/**
 * Command Config Service — persistido em SQLite (por grupo).
 * Regra de negócio (pedido do dono): EM GRUPOS NOVOS, todos os comandos
 * começam DESLIGADOS, exceto os de gestão/navegação (cmd, menu, help, etc).
 * O admin do grupo liga com `$cmd <comando> on`.
 */

import { isCommandEnabledDB, setCommandEnabledDB } from './databaseService';

export class CommandConfigService {
  /** Retorna true se o comando está HABILITADO no grupo (async, consulta DB). */
  async isCommandEnabled(command: string, groupId: string): Promise<boolean> {
    return isCommandEnabledDB(groupId, command);
  }

  /** Ativa/desativa um comando no grupo (persistido). */
  async setCommandEnabled(command: string, groupId: string, enabled: boolean): Promise<void> {
    await setCommandEnabledDB(groupId, command, enabled);
  }

  // Compatibility async wrappers
  async setEnabled(groupId: string, commandName: string, enabled: boolean): Promise<void> {
    await this.setCommandEnabled(commandName, groupId, enabled);
  }

  async isEnabled(groupId: string, commandName: string): Promise<boolean> {
    return this.isCommandEnabled(commandName, groupId);
  }
}

export const commandConfigService = new CommandConfigService();
