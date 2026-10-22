// src/services/commandConfigService.ts
/**
 * 🔌 ESTADO DE COMANDOS POR GRUPO — persistido em SQLite (INC-015 D2).
 *
 * Antes: Map em memória — o $cmd gravava um estado que morria no restart
 * e NINGUÉM lia (isEnabled sem leitor). Agora: tabela command_state
 * (group_id, command) com default HABILITADO (ausência de registro =
 * comando ligado) e leitura no dispatcher ANTES de command.execute().
 *
 * Fail-open: se o banco não responder, isEnabled devolve true — o toggle
 * nunca pode derrubar os comandos do bot.
 */
import { getDb } from './databaseService';

export class CommandConfigService {
  /** true = habilitado. Sem registro = habilitado (default). */
  async isEnabled(groupId: string, commandName: string): Promise<boolean> {
    try {
      const db = await getDb();
      const row: { enabled?: number } | undefined = await db.get(
        `SELECT enabled FROM command_state WHERE group_id = ? AND command = ? LIMIT 1`,
        [groupId, commandName]
      );
      return row ? !!row.enabled : true;
    } catch {
      return true; // fail-open
    }
  }

  /** Habilita/desabilita um comando para um grupo (upsert). */
  async setEnabled(groupId: string, commandName: string, enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT INTO command_state (group_id, command, enabled, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(group_id, command)
       DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      [groupId, commandName, enabled ? 1 : 0]
    );
  }
}

export const commandConfigService = new CommandConfigService();
