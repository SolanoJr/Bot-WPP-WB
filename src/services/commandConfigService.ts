// src/services/commandConfigService.ts
/**
 * In‑memory Command Config Service.
 * Provides enable/disable per command per platform (group) without external DB.
 * Simplifies testing and removes lowdb dependency.
 */

interface GroupSettings {
  disabledCommands: Set<string>;
}

interface DBSchema {
  groups: Record<string, GroupSettings>;
}

export class CommandConfigService {
  private data: DBSchema = { groups: {} };

  private getGroup(groupId: string): GroupSettings {
    if (!this.data.groups[groupId]) {
      this.data.groups[groupId] = { disabledCommands: new Set() };
    }
    return this.data.groups[groupId];
  }

  /** Returns true if the command is ENABLED for the given group (synchronous) */
  isCommandEnabled(command: string, platform: string): boolean {
    const group = this.data.groups[platform];
    if (!group) return true; // default enabled
    return !group.disabledCommands.has(command);
  }

  /** Enable or disable a command for a group (synchronous) */
  setCommandEnabled(command: string, platform: string, enabled: boolean): void {
    const group = this.getGroup(platform);
    if (enabled) {
      group.disabledCommands.delete(command);
    } else {
      group.disabledCommands.add(command);
    }
  }


  // Compatibility async wrappers for existing code
  async setEnabled(groupId: string, commandName: string, enabled: boolean): Promise<void> {
    this.setCommandEnabled(commandName, groupId, enabled);
  }

  async isEnabled(groupId: string, commandName: string): Promise<boolean> {
    return this.isCommandEnabled(commandName, groupId);
  }

}

export const commandConfigService = new CommandConfigService();
