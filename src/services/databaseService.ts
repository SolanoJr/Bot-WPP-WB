import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = 'bot_database.db';

// Garante que a pasta data existe
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const dbPath = path.join(DB_DIR, DB_FILE);

export async function initDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Tabela de Logs de Comandos (Estatísticas)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS command_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_name TEXT,
      user_id TEXT,
      group_id TEXT,
      group_name TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Garante coluna group_name em instalações antigas (idempotente)
  try {
    await db.exec(`ALTER TABLE command_logs ADD COLUMN group_name TEXT`);
  } catch {
    // coluna já existe — ignorado
  }

  // Tabela de Feedbacks
  await db.exec(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      user_name TEXT,
      user_number TEXT,
      group_id TEXT,
      group_name TEXT,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tabela de Comandos Customizados (Migração do JSON)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS custom_commands (
      id TEXT PRIMARY KEY,
      group_id TEXT,
      comando TEXT,
      resposta TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tabela de Histórico da IA (Memória de Contexto)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      prompt TEXT,
      response TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tabela de Banidos (persistência de quem foi banido - impede re-entrada)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS banned_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT,
      user_id TEXT,
      banned_by TEXT,
      reason TEXT,
      banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id)
    );
  `);

  // Tabela de Configuração de AutoMod POR GRUPO
  await db.exec(`
    CREATE TABLE IF NOT EXISTS group_automod (
      group_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0
    );
  `);

  return db;
}

export async function getDb() {
  // Retorna a conexão aberta (Singleton simples)
  return await initDatabase();
}

/**
 * Registra um usuário banido no SQLite (persistência real).
 */
export async function banUser(opts: {
  groupId: string;
  userId: string;
  bannedBy?: string;
  reason?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `INSERT OR REPLACE INTO banned_users (group_id, user_id, banned_by, reason) VALUES (?, ?, ?, ?)`,
      opts.groupId,
      opts.userId,
      opts.bannedBy || '',
      opts.reason || ''
    );
  } catch (e: any) {
    console.error('[DB] Falha ao salvar banido:', e?.message);
  }
}

/**
 * Verifica se um usuário está banido (em qualquer grupo ou no grupo específico).
 */
export async function isUserBanned(userId: string, groupId?: string): Promise<boolean> {
  try {
    const db = await getDb();
    const row = groupId
      ? await db.get(`SELECT 1 FROM banned_users WHERE group_id = ? AND user_id = ? LIMIT 1`, groupId, userId)
      : await db.get(`SELECT 1 FROM banned_users WHERE user_id = ? LIMIT 1`, userId);
    return !!row;
  } catch (e: any) {
    console.error('[DB] Falha ao checar banido:', e?.message);
    return false;
  }
}

/**
 * Lista os banidos (para o comando $banidos).
 */
export async function listBanned(limit = 10): Promise<any[]> {
  try {
    const db = await getDb();
    return db.all(`SELECT group_id, user_id, banned_by, reason, banned_at FROM banned_users ORDER BY banned_at DESC LIMIT ?`, limit);
  } catch (e: any) {
    console.error('[DB] Falha ao listar banidos:', e?.message);
    return [];
  }
}

/**
 * Verifica se o AutoMod está ligado num grupo específico (persistido).
 * Default: OFF em grupos novos.
 */
export async function isAutoModEnabledDB(groupId: string): Promise<boolean> {
  try {
    const db = await getDb();
    const row = await db.get(`SELECT enabled FROM group_automod WHERE group_id = ?`, groupId);
    if (!row) return false;
    return !!row.enabled;
  } catch (e: any) {
    console.error('[DB] Falha ao checar AutoMod:', e?.message);
    return false;
  }
}

/**
 * Define se o AutoMod está ligado num grupo (persistido).
 */
export async function setAutoModEnabledDB(groupId: string, enabled: boolean): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO group_automod (group_id, enabled) VALUES (?, ?)
       ON CONFLICT(group_id) DO UPDATE SET enabled = excluded.enabled`,
      groupId, enabled ? 1 : 0
    );
  } catch (e: any) {
    console.error('[DB] Falha ao salvar AutoMod:', e?.message);
  }
}

/**
 * Registra uso de comando no SQLite (persistência real, com nome do grupo).
 * Chamado pelo commandExecutor após cada execução bem-sucedida.
 */
export async function recordCommandUsage(opts: {
  commandName: string;
  userId: string;
  groupId: string;
  groupName?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO command_logs (command_name, user_id, group_id, group_name) VALUES (?, ?, ?, ?)`,
      opts.commandName,
      opts.userId,
      opts.groupId || '',
      opts.groupName || ''
    );
  } catch (e: any) {
    // Erro de auditoria não deve quebrar o comando
    console.error('[DB] Falha ao registrar uso de comando:', e?.message);
  }
}

/**
 * Agrega "quantas vezes cada comando foi usado", por grupo (mostra nome do grupo).
 */
export async function getCommandMetrics(): Promise<
  { group_id: string; group_name: string; command_name: string; count: number }[]
> {
  const db = await getDb();
  return db.all(`
    SELECT group_id,
           COALESCE(NULLIF(group_name, ''), group_id) as group_name,
           command_name,
           COUNT(*) as count
    FROM command_logs
    GROUP BY group_id, command_name
    ORDER BY group_id, count DESC
  `);
}