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

  // Tabela de Configuração de MODERAÇÃO AUTOMÁTICA POR GRUPO
  // Cada função tem seu próprio toggle (personalizado por grupo).
  await db.exec(`
    CREATE TABLE IF NOT EXISTS group_mod (
      group_id TEXT PRIMARY KEY,
      antispam INTEGER DEFAULT 0,
      antiestrangeiro INTEGER DEFAULT 0,
      bemvindo INTEGER DEFAULT 0,
      autolink INTEGER DEFAULT 0,
      detectar INTEGER DEFAULT 0,
      remover INTEGER DEFAULT 0,
      antibotas INTEGER DEFAULT 0
    );
  `);

  // Tabela de INFRAÇÕES por (grupo, usuário) — 3 strikes = remoção (nunca ban, exceto bot)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS infractions (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      last_infraction INTEGER DEFAULT 0,
      PRIMARY KEY (group_id, user_id)
    );
  `);

  // SEED: grupos onde o bot JÁ moderava (AutoMod era global=true) ficam com tudo
  // ligado. Só roda 1x (quando a tabela está vazia). O grupo teste é sempre incluído.
  try {
    const count = await db.get(`SELECT COUNT(*) as c FROM group_mod`);
    if (count && count.c === 0) {
      const groupsToSeed: string[] = [];
      const testGroup = process.env.WPP_TEST_GROUP_ID;
      if (testGroup) groupsToSeed.push(testGroup);
      // Tenta descobrir os grupos atuais do bot (se o client já estiver disponível)
      try {
        const { platformManager } = await import('../platforms/PlatformManager');
        const wpp = platformManager.getClient('whatsapp');
        if (wpp && typeof (wpp as any).getChats === 'function') {
          const chats = await (wpp as any).getChats();
          for (const c of chats) {
            const id = c.id?._serialized || c.id;
            if (id && String(id).endsWith('@g.us')) groupsToSeed.push(id);
          }
        }
      } catch { /* ignora se ainda não disponível */ }
      for (const g of [...new Set(groupsToSeed)]) {
        await db.run(
          `INSERT OR IGNORE INTO group_mod (group_id, antispam, antiestrangeiro, bemvindo, autolink, detectar, remover, antibotas) VALUES (?,1,0,1,1,1,1,1)`,
          g
        );
      }
      if (groupsToSeed.length) console.log(`[DB] Seed group_mod: ${groupsToSeed.length} grupo(s) com AutoMod ligado (mantendo comportamento anterior).`);
    }
  } catch (e: any) {
    console.error('[DB] Falha no seed de group_mod:', e?.message);
  }

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

export interface GroupModConfig {
  antispam: boolean;
  antiestrangeiro: boolean;
  bemvindo: boolean;
  autolink: boolean;
  detectar: boolean;
  remover: boolean;
  antibotas: boolean;
}

const MOD_FIELDS: (keyof GroupModConfig)[] = ['antispam', 'antiestrangeiro', 'bemvindo', 'autolink', 'detectar', 'remover', 'antibotas'];

/** Remove prefixos de plataforma (wpp:/tg:/dc:) do groupId para lookup consistente no SQLite. */
function normGroup(groupId: string): string {
  return String(groupId || '').replace(/^(wpp:|tg:|dc:)/, '');
}

/** Retorna a config de moderação do grupo (default: tudo desligado). */
export async function getGroupMod(groupId: string): Promise<GroupModConfig> {
  const id = normGroup(groupId);
  const empty: GroupModConfig = {
    antispam: false, antiestrangeiro: false, bemvindo: false,
    autolink: false, detectar: false, remover: false, antibotas: false,
  };
  try {
    const db = await getDb();
    const row = await db.get(`SELECT * FROM group_mod WHERE group_id = ?`, id);
    if (!row) return empty;
    const cfg: any = { ...empty };
    for (const f of MOD_FIELDS) cfg[f] = !!row[f];
    return cfg;
  } catch (e: any) {
    console.error('[DB] Falha ao ler group_mod:', e?.message);
    return empty;
  }
}

/** Define um campo específico da moderação do grupo. */
export async function setGroupModField(groupId: string, field: keyof GroupModConfig, value: boolean): Promise<void> {
  const id = normGroup(groupId);
  try {
    const db = await getDb();
    const row = await db.get(`SELECT group_id FROM group_mod WHERE group_id = ?`, id);
    if (!row) {
      const cfg = { antispam: 0, antiestrangeiro: 0, bemvindo: 0, autolink: 0, detectar: 0, remover: 0, antibotas: 0 } as any;
      cfg[field] = value ? 1 : 0;
      await db.run(
        `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, bemvindo, autolink, detectar, remover, antibotas) VALUES (?,?,?,?,?,?,?,?)`,
        id, cfg.antispam, cfg.antiestrangeiro, cfg.bemvindo, cfg.autolink, cfg.detectar, cfg.remover, cfg.antibotas
      );
    } else {
      await db.run(`UPDATE group_mod SET ${field} = ? WHERE group_id = ?`, value ? 1 : 0, id);
    }
  } catch (e: any) {
    console.error('[DB] Falha ao salvar group_mod:', e?.message);
  }
}

/** Liga/desliga TODOS os campos de um grupo (toggle mestre). */
export async function setGroupModAll(groupId: string, value: boolean): Promise<void> {
  const id = normGroup(groupId);
  try {
    const db = await getDb();
    await db.run(
      `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, bemvindo, autolink, detectar, remover, antibotas)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(group_id) DO UPDATE SET
         antispam=excluded.antispam, antiestrangeiro=excluded.antiestrangeiro,
         bemvindo=excluded.bemvindo, autolink=excluded.autolink,
         detectar=excluded.detectar, remover=excluded.remover, antibotas=excluded.antibotas`,
      id, value?1:0, value?1:0, value?1:0, value?1:0, value?1:0, value?1:0, value?1:0
    );
  } catch (e: any) {
    console.error('[DB] Falha ao salvar group_mod (all):', e?.message);
  }
}

/** Estado agregado para o comando $automod (mestre): 'on' | 'off' | 'personalizado'. */
export async function getGroupModState(groupId: string): Promise<'on' | 'off' | 'personalizado'> {
  const cfg = await getGroupMod(groupId);
  const vals = MOD_FIELDS.map(f => cfg[f]);
  if (vals.every(Boolean)) return 'on';
  if (vals.every(v => !v)) return 'off';
  return 'personalizado';
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