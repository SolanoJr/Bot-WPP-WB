import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DB_DIR = process.env.BOT_DATA_DIR
  ? path.resolve(process.env.BOT_DATA_DIR)
  : path.join(PROJECT_ROOT, 'data');
const DB_FILE = 'bot_database.db';

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const dbPath = path.join(DB_DIR, DB_FILE);

export interface GroupModConfig {
  antispam?: boolean;
  antiestrangeiro?: boolean;
  autolink?: boolean;
  bemvindo?: boolean;
  detectar?: boolean;
  remover?: boolean;
  audit_only?: boolean;
}

export async function initDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA journal_mode=WAL;");
  await db.exec("PRAGMA busy_timeout=5000;");

  // ─── Logs de comandos ───
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

  // ─── Usuários banidos ───
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

  // ─── Configurações de moderação por grupo ───
    await db.exec(`
      CREATE TABLE IF NOT EXISTS group_mod (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL UNIQUE,
        antispam BOOLEAN DEFAULT 1,
        antiestrangeiro BOOLEAN DEFAULT 1,
        autolink BOOLEAN DEFAULT 1,
        bemvindo BOOLEAN DEFAULT 0,
        detectar BOOLEAN DEFAULT 0,
        remover BOOLEAN DEFAULT 1,
        audit_only BOOLEAN DEFAULT 0
      );
    `);

  // ─── AUDIT TRAIL: entrada/saída de membros ───
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mod_member_joins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      left_at INTEGER,
      reason TEXT DEFAULT 'not_set',
      UNIQUE(group_id, member_id, joined_at)
    );
  `);

  // ─── AUDIT TRAIL: fingerprint de mensagens repetidas (anti-spam) ───
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mod_msg_fingerprints (
      group_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      source_jid TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (group_id, fingerprint, source_jid)
    );
  `);

  // ─── Infrações por usuário ───
  await db.exec(`
    CREATE TABLE IF NOT EXISTS infractions (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_infraction INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    );
  `);

  // ─── P1.3: ÍNDICES OTIMIZADOS ───
  // Melhoram performance de queries críticas (joins, lookups, ordenação)
  
  // banned_users: lookups por (group_id, user_id) são frequentes
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_banned_users_lookup 
    ON banned_users(group_id, user_id);
  `);

  // group_mod: lookups por group_id únicos (já coberto por UNIQUE constraint)
  // Mas adicionar índice explícito ajuda em queries que filtram por campos booleanos
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_group_mod_groupid 
    ON group_mod(group_id);
  `);

  // infractions: lookups frequentes por (group_id, user_id)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_infractions_lookup 
    ON infractions(group_id, user_id);
  `);

  // mod_member_joins: queries filtram por group_id + member_id, ordenam por joined_at
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_member_joins_lookup 
    ON mod_member_joins(group_id, member_id, joined_at DESC);
  `);

  // mod_msg_fingerprints: lookups por (group_id, fingerprint, source_jid) já coberto por PK
  // Mas adicionar índice em first_seen ajuda no cleanup de entradas antigas
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fingerprints_cleanup 
    ON mod_msg_fingerprints(first_seen);
  `);

  // command_logs: queries agregam por group_id, command_name, ordenam por timestamp
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_command_logs_query 
    ON command_logs(group_id, command_name, timestamp DESC);
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
      await db.run(sql, params);
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

export async function listBanned(limit: number = 10): Promise<any[]> {
  const db = await getDb();
  return db.all(
    `SELECT user_id, group_id, banned_at, reason FROM banned_users ORDER BY banned_at DESC LIMIT ?`,
    [limit]
  );
}

export async function getGroupMod(groupId: string): Promise<GroupModConfig> {
  const db = await getDb();
  const row = await db.get(
    `SELECT antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only FROM group_mod WHERE group_id = ?`,
    [groupId]
  );
  if (!row) return {};
  return {
    antispam: row.antispam === 1 || row.antispam === true,
    antiestrangeiro: row.antiestrangeiro === 1 || row.antiestrangeiro === true,
    autolink: row.autolink === 1 || row.autolink === true,
    bemvindo: row.bemvindo === 1 || row.bemvindo === true,
    detectar: row.detectar === 1 || row.detectar === true,
    remover: row.remover === 1 || row.remover === true,
    audit_only: row.audit_only === 1 || row.audit_only === true,
  };
}

export async function getGroupModState(groupId: string): Promise<string> {
  const config = await getGroupMod(groupId);
  const allOn = ['antispam', 'antiestrangeiro', 'autolink', 'remover'].every(
    k => config[k as keyof GroupModConfig] !== false
  );
  const anyOff = Object.values(config).some(v => v === false);
  if (allOn) return 'ativado';
  if (anyOff) return 'personalizado';
  return 'desativado';
}

export async function setGroupModField(groupId: string, field: keyof GroupModConfig, value: boolean): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO group_mod (group_id, ${field}) VALUES (?, ?)
     ON CONFLICT(group_id) DO UPDATE SET ${field} = ?`,
    [groupId, value ? 1 : 0, value ? 1 : 0]
  );
}

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

import { isProtectedTarget } from '../services/permissions.js';

export async function banUser(entry: {
  groupId: string;
  userId: string;
  bannedBy?: string;
  reason?: string;
}): Promise<void> {
  const uid = String(entry.userId ?? '').trim();
  if (!uid) throw new Error('[banUser] userId vazio');

  // blindagem: nunca banir o BOT, o DONO ou ADMINS
  if (isProtectedTarget(uid)) {
    console.warn(`[databaseService] banUser bloqueado: tentativa de banir ID protegido (${uid}) no grupo ${entry.groupId}.`);
    return;
  }

  const db = await getDb();
  await db.run(
    `INSERT INTO banned_users (group_id, user_id, reason, banned_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(group_id, user_id) DO UPDATE SET reason = excluded.reason, banned_at = excluded.banned_at`,
    [entry.groupId, uid, entry.reason || 'banido', Date.now()]
  );
}

export async function isUserBanned(groupId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.get(
    `SELECT 1 FROM banned_users WHERE group_id = ? AND user_id = ?`,
    [groupId, userId]
  );
  return !!row;
}

// ─── AUDIT TRAIL: member joins / leaves ───

export async function recordMemberJoin(groupId: string, memberId: string): Promise<void> {
  const db = await getDb();
  try {
    await db.run(
      `INSERT INTO mod_member_joins (group_id, member_id, joined_at, left_at, reason)
       VALUES (?, ?, ?, NULL, 'not_set')
       ON CONFLICT(group_id, member_id, joined_at) DO NOTHING`,
      [groupId, memberId, Date.now()]
    );
  } catch (err: any) {
    console.warn('[mod_member_joins] recordMemberJoin falhou:', err?.message);
  }
}

export async function recordMemberRemove(groupId: string, memberId: string, reason: 'kick' | 'ban' | 'voluntarily' | 'not_set' = 'not_set'): Promise<void> {
  const db = await getDb();
  try {
    // Marca a entrada mais recente não-encerrada do membro
    await db.run(
      `UPDATE mod_member_joins SET left_at = ?, reason = ? WHERE group_id = ? AND member_id = ? AND left_at IS NULL`,
      [Date.now(), reason, groupId, memberId]
    );
  } catch (err: any) {
    console.warn('[mod_member_joins] recordMemberRemove falhou:', err?.message);
  }
}

export async function isMemberCurrentlyInGroup(groupId: string, memberId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.get(
    `SELECT 1 FROM mod_member_joins WHERE group_id = ? AND member_id = ? AND left_at IS NULL LIMIT 1`,
    [groupId, memberId]
  );
  return !!row;
}

export async function getMemberJoinHistory(groupId: string, memberId: string): Promise<Array<{ joined_at: number; left_at: number | null; reason: string }>> {
  const db = await getDb();
  const rows = await db.all(
    `SELECT joined_at, left_at, reason FROM mod_member_joins WHERE group_id = ? AND member_id = ? ORDER BY joined_at DESC`,
    [groupId, memberId]
  );
  return rows.map(r => ({ joined_at: Number(r.joined_at), left_at: r.left_at ? Number(r.left_at) : null, reason: r.reason }));
}

// ─── AUDIT TRAIL: fingerprints de mensagens repetidas ───

export async function recordMessageFingerprint(groupId: string, fingerprint: string, sourceJid: string): Promise<void> {
  const db = await getDb();
  try {
    await db.run(
      `INSERT INTO mod_msg_fingerprints (group_id, fingerprint, source_jid, first_seen, count)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(group_id, fingerprint, source_jid) DO UPDATE SET count = count + 1, first_seen = excluded.first_seen`,
      [groupId, fingerprint, sourceJid, Date.now()]
    );
  } catch (err: any) {
    console.warn('[mod_msg_fingerprints] recordMessageFingerprint falhou:', err?.message);
  }
}

export async function getRecentFingerprintCount(groupId: string, fingerprint: string, sourceJid: string, maxAgeSeconds: number): Promise<number> {
  const db = await getDb();
  const cutoff = Date.now() - maxAgeSeconds * 1000;
  const row = await db.get(
    `SELECT count FROM mod_msg_fingerprints WHERE group_id = ? AND fingerprint = ? AND source_jid = ? AND first_seen >= ?`,
    [groupId, fingerprint, sourceJid, cutoff]
  );
  return row ? Number(row.count) : 0;
}

export async function cleanupOldFingerprintEntries(maxAgeSeconds: number = 3600): Promise<void> {
  const db = await getDb();
  try {
    const cutoff = Date.now() - maxAgeSeconds * 1000;
    await db.run(
      `DELETE FROM mod_msg_fingerprints WHERE first_seen < ?`,
      [cutoff]
    );
  } catch (err: any) {
    console.warn('[mod_msg_fingerprints] cleanupOldFingerprintEntries falhou:', err?.message);
  }
}

export async function cleanupOldJoinEntries(maxAgeSeconds: number = 2592000): Promise<void> {
  // Só limpa entradas encerradas (left_at != NULL) com mais de N dias. Membros ativos nunca são limpos.
  const db = await getDb();
  try {
    const cutoff = Date.now() - maxAgeSeconds * 1000;
    await db.run(
      `DELETE FROM mod_member_joins WHERE left_at IS NOT NULL AND left_at < ?`,
      [cutoff]
    );
  } catch (err: any) {
    console.warn('[mod_member_joins] cleanupOldJoinEntries falhou:', err?.message);
  }
}