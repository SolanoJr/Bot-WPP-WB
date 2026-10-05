/**
 * listsService — listas persistentes por grupo/comunidade.
 *
 * Especificado na arquitetura (group_mod + databaseService + SQLite).
 * Não é um comando fantasma ($lista1-3 nunca existiram).
 *
 * Tabela: lists
 *  - list_id (TEXT PRIMARY KEY) — nome/identificador da lista
 *  - group_id (TEXT) — grupo associado
 *  - community_id (TEXT, opcional) — comunidade (se aplicável)
 *  - list_name (TEXT) — nome legível
 *  - items (TEXT) — conteúdo (JSON)
 *  - created_at (INTEGER)
 *  - updated_at (INTEGER)
 */

import { getDb } from './databaseService';

export interface ListItem {
  list_id: string;
  group_id: string;
  community_id?: string | null;
  list_name: string;
  items: string;
  created_at: number;
  updated_at: number;
}

/** Criar tabela se não existir. */
export async function initListsTable(): Promise<void> {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS lists (
      list_id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      community_id TEXT,
      list_name TEXT NOT NULL,
      items TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_lists_group ON lists(group_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_lists_community ON lists(community_id);`);
}

/** Criar ou atualizar uma lista. */
export async function saveList(
  list_id: string,
  group_id: string,
  list_name: string,
  items: any[],
  community_id?: string
): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.run(
    `INSERT OR REPLACE INTO lists (list_id, group_id, community_id, list_name, items, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      list_id,
      group_id,
      community_id || null,
      list_name,
      JSON.stringify(items),
      now,
      now,
    ]
  );
}

/** Obter lista por ID no contexto de um grupo. */
export async function getList(group_id: string, list_id: string): Promise<ListItem | null> {
  const db = await getDb();
  const row = await db.get(
    `SELECT * FROM lists WHERE group_id = ? AND list_id = ?`,
    [group_id, list_id]
  );
  return row ? (row as ListItem) : null;
}

/** Listar todas as listas de um grupo. */
export async function listLists(group_id: string): Promise<ListItem[]> {
  const db = await getDb();
  return await db.all(`SELECT * FROM lists WHERE group_id = ? ORDER BY list_name ASC`, [group_id]);
}

/** Remover lista. */
export async function deleteList(group_id: string, list_id: string): Promise<void> {
  const db = await getDb();
  await db.run(`DELETE FROM lists WHERE group_id = ? AND list_id = ?`, [group_id, list_id]);
}
