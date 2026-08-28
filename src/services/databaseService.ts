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

// Tipo de configuração de moderação por grupo
export interface GroupModConfig {
  antispam?: boolean;
  antiestrangeiro?: boolean;
  autolink?: boolean;
  bemvindo?: boolean;
  detectar?: boolean;
  remover?: boolean;
}

export async function initDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Otimizações SQLite: WAL mode (concorrência) e busy_timeout (evita SQLITE_BUSY)
  await db.exec("PRAGMA journal_mode=WAL;");
  await db.exec("PRAGMA busy_timeout=5000;");

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

  // Tabela de usuários banidos
  await db.exec(`
    CREATE TABLE IF NOT EXISTS banned_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reason TEXT,
      UNIQUE(user_id, group_id)
    );
  `);

  // Tabela de configurações de moderação por grupo
  await db.exec(`
    CREATE TABLE IF NOT EXISTS group_mod (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL UNIQUE,
      antispam BOOLEAN DEFAULT 1,
      antiestrangeiro BOOLEAN DEFAULT 1,
      autolink BOOLEAN DEFAULT 1,
      bemvindo BOOLEAN DEFAULT 0,
      detectar BOOLEAN DEFAULT 0,
      remover BOOLEAN DEFAULT 1
    );
  `);
}

export async function getDb(): Promise<Database> {
  return initDatabase().then(() => {
    return open({ filename: dbPath, driver: sqlite3.Database });
  });
}

export async function dbExecWithRetry(db: Database, sql: string, params: any[] = []): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.exec(sql, params);
      return;
    } catch (err: any) {
      if (err.code === 'SQLITE_BUSY' && attempt < 2) {
        await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// Exportado para commandExecutor.ts registrar uso de comandos
export async function recordCommandUsage(entry: { commandName: string; userId: string; groupId: string; groupName: string }): Promise<void> {
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO command_logs (command_name, user_id, group_id, group_name, timestamp) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [entry.commandName, entry.userId, entry.groupId, entry.groupName]
    );
  } catch (err: any) {
    console.error('[databaseService] recordCommandUsage falhou:', err?.message);
  }
}

// Retorna métricas de uso de comandos por grupo
export async function getCommandMetrics(): Promise<any[]> {
  const db = await getDb();
  return db.all(`
    SELECT group_id, group_name, command_name, COUNT(*) as count
    FROM command_logs
    GROUP BY group_id, command_name
    ORDER BY count DESC
    LIMIT 20
  `);
}

// Lista de usuários banidos
export async function listBanned(limit: number = 10): Promise<any[]> {
  const db = await getDb();
  return db.all(
    `SELECT user_id, group_id, banned_at, reason FROM banned_users ORDER BY banned_at DESC LIMIT ?`,
    [limit]
  );
}

// Configuração de moderação de um grupo
export async function getGroupMod(groupId: string): Promise<GroupModConfig | null> {
  const db = await getDb();
  const row = await db.get(
    `SELECT antispam, antiestrangeiro, autolink, bemvindo, detectar, remover FROM group_mod WHERE group_id = ?`,
    [groupId]
  );
  if (!row) return null;
  return {
    antispam: row.autospam === 1 || row.autospam === true,
    antiestrangeiro: row.antiestrangeiro === 1 || row.antiestrangeiro === true,
    autolink: row.autolink === 1 || row.autolink === true,
    bemvindo: row.bemvindo === 1 || row.bemvindo === true,
    detectar: row.detectar === 1 || row.detectar === true,
    remover: row.remover === 1 || row.remover === true,
  };
}

// Estado resumido de moderação (on/off geral)
export async function getGroupModState(groupId: string): Promise<string> {
  const config = await getGroupMod(groupId);
  if (!config) return 'desativado';
  const allOn = ['antispam', 'antiestrangeiro', 'autolink', 'remover'].every(
    k => config[k as keyof GroupModConfig] !== false
  );
  const anyOff = Object.values(config).some(v => v === false);
  if (allOn) return 'ativado';
  if (anyOff) return 'personalizado';
  return 'desativado';
}

// Define um campo específico de moderação
export async function setGroupModField(groupId: string, field: keyof GroupModConfig, value: boolean): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO group_mod (group_id, ${field}) VALUES (?, ?)
     ON CONFLICT(group_id) DO UPDATE SET ${field} = ?`,
    [groupId, value ? 1 : 0, value ? 1 : 0]
  );
}

// Define toda a configuração de uma vez
export async function setGroupModAll(groupId: string, config: GroupModConfig): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, autolink, bemvindo, detectar, remover)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(group_id) DO UPDATE SET
       antispam = excluded.antispam,
       antiestrangeiro = excluded.antiestrangeiro,
       autolink = excluded.autolink,
       bemvindo = excluded.bemvindo,
       detectar = excluded.detectar,
       remover = excluded.remover`,
    [
      groupId,
      config.antispam !== false ? 1 : 0,
      config.antiestrangeiro !== false ? 1 : 0,
      config.autolink !== false ? 1 : 0,
      config.bemvindo === true ? 1 : 0,
      config.detectar === true ? 1 : 0,
      config.remover !== false ? 1 : 0,
    ]
  );
}