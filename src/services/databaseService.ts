import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { normGroupId } from './groupIds';

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
  /** AntiBot: detecção de mensagens estruturais/automatizadas. */
  antibot?: boolean;
  /** Casino: cassino/betano de alta probabilidade. */
  casino?: boolean;
  /** Apresentações (Comunidade 085) — serviço separado do engine. */
  presentation_enabled?: boolean;
}

/**
 * Defaults de um GRUPO NOVO.
 *
 * Regra de arquitetura: todo recurso automático começa DESLIGADO. O bot nunca
 * passa a moderar um grupo só porque entrou nele — alguém precisa ligar
 * explicitamente. Grupos EXISTENTES não são tocados (valores persistidos
 * permanecem; isto só vale para linhas novas).
 */
export const GROUP_MOD_DEFAULTS: Required<GroupModConfig> = {
  antispam: false,
  antiestrangeiro: false,
  autolink: false,
  bemvindo: false,
  detectar: false,
  remover: false,
  audit_only: false,
  antibot: false,
  casino: false,
  presentation_enabled: false,
};

/** Colunas de group_mod que representam automações ligáveis. */
export const GROUP_MOD_FLAGS = [
  'antispam', 'antiestrangeiro', 'autolink', 'bemvindo',
  'detectar', 'remover', 'audit_only', 'antibot', 'casino',
  'presentation_enabled',
] as const;

export type GroupModFlag = typeof GROUP_MOD_FLAGS[number];

export async function initDatabase() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA journal_mode=WAL;");
  await db.exec("PRAGMA synchronous=NORMAL;");
  await db.exec("PRAGMA busy_timeout=10000;");
  await db.exec("PRAGMA foreign_keys=ON;");
  await db.exec("PRAGMA wal_autocheckpoint=1000;");

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
  // DEFAULTS DE GRUPO NOVO: tudo DESLIGADO. O bot não passa a moderar um grupo
  // só porque entrou nele. Grupos existentes mantêm seus valores persistidos
  // (CREATE TABLE IF NOT EXISTS não altera tabela já criada).
    await db.exec(`
      CREATE TABLE IF NOT EXISTS group_mod (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL UNIQUE,
        antispam BOOLEAN DEFAULT 0,
        antiestrangeiro BOOLEAN DEFAULT 0,
        autolink BOOLEAN DEFAULT 0,
        bemvindo BOOLEAN DEFAULT 0,
        detectar BOOLEAN DEFAULT 0,
        remover BOOLEAN DEFAULT 0,
        audit_only BOOLEAN DEFAULT 0
      );
    `);

  // ─── MIGRAÇÃO ADITIVA: welcome_message + tabelas de apresentação ───
    // `ALTER TABLE ... ADD COLUMN` falha se a coluna já existe — por isso o
    // helper tolerante. Não destrutivo: preserva os dados existentes.
    const addColumnIfMissing = async (table: string, column: string, ddl: string) => {
      try {
        await db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
        logInfo(`[databaseService] migração: ${table}.${column} adicionada`);
      } catch (e: any) {
        if (!/duplicate column name/i.test(e?.message || '')) {
          logWarning(`[databaseService] migração ${table}.${column}: ${e?.message}`);
        }
      }
    };

    // Welcome configurável por grupo. NULL = usa o padrão do sistema.
    await addColumnIfMissing('group_mod', 'welcome_message', 'welcome_message TEXT DEFAULT NULL');

    // Apresentações: ativa/desativa por grupo (default 0 = desligado).
    await addColumnIfMissing('group_mod', 'presentation_enabled', 'presentation_enabled INTEGER NOT NULL DEFAULT 0');

    // AntiBot e Casino: flags PRÓPRIAS. Antes ambos eram gated por `remover`,
    // o que impedia desligar um sem desligar o outro (e o antiestrangeiro).
    await addColumnIfMissing('group_mod', 'antibot', 'antibot INTEGER NOT NULL DEFAULT 0');
    await addColumnIfMissing('group_mod', 'casino', 'casino INTEGER NOT NULL DEFAULT 0');

    // ─── APRESENTAÇÕES (Comunidade 085) ───
  // SQLite é a fonte OFICIAL. O Telegram é espelho — a apresentação nunca
  // depende da existência da mensagem no Telegram.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS presentations (
      presentation_id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      phone_number TEXT,
      display_name TEXT,
      nome TEXT,
      idade INTEGER,
      genero TEXT,
      trabalho TEXT,
      hobbies TEXT,
      bio TEXT,
      orientacao TEXT,
      estado_civil TEXT,
      bairro TEXT,
      rede_social TEXT,
      photo_ref TEXT,
      photo_source TEXT,
      original_text TEXT,
      source_message_ids TEXT,
      tg_chat_id TEXT,
      tg_thread_id TEXT,
      tg_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_presentations_user_group
      ON presentations(platform, group_id, user_id);
  `);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_presentations_status
      ON presentations(status);
  `);

  // Grupos pertencentes à Comunidade 085.
  // O Baileys entrega `linkedParent` no metadata — é a relação REAL, não uma
  // lista de nomes. Guardamos em tabela para consulta rápida e auditoria.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS community_groups (
      group_id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      group_name TEXT,
      updated_at INTEGER NOT NULL
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

// Singleton de conexão para evitar SQLITE_BUSY
let dbInstance: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initDatabase().then(async () => {
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    dbInstance = db;
    dbInitPromise = null;
    return db;
  });

  return dbInitPromise;
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
    logError('[databaseService] recordCommandUsage falhou:', err?.message);
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

/**
 * Busca a linha de group_mod aceitando o ID COM ou SEM prefixo de plataforma.
 *
 * Motivo: PlatformManager/ctx.chatId grava "wpp:120363...@g.us", enquanto o
 * BaileysNormalizer/evaluate() consulta "120363...@g.us". Um match exato falha
 * silenciosamente e o AutoMod responde "nada ligado — ignorando".
 *
 * A comparação é feita pelo ID NORMALIZADO nos dois lados, então funciona nas
 * duas direções, sem migração destrutiva do banco.
 */
async function getGroupModRow(db: any, groupId: string): Promise<any> {
  const raw = String(groupId ?? '');
  const norm = normGroupId(raw);

  // 1) Match EXATO no ID recebido — preserva a distinção entre plataformas
  //    (wpp:X e tg:X são grupos diferentes e não podem colidir).
  const exact = await db.get(
    `SELECT * FROM group_mod WHERE group_id = ? LIMIT 1`,
    [raw]
  );
  if (exact) return exact;

  // 2) Match exato no normalizado (caller sem prefixo + DB sem prefixo).
  if (norm !== raw) {
    const exactNorm = await db.get(
      `SELECT * FROM group_mod WHERE group_id = ? LIMIT 1`,
      [norm]
    );
    if (exactNorm) return exactNorm;
  }

  // 3) Fallback: variantes com prefixo — SOMENTE para JIDs do WhatsApp.
  //
  // ⚠️ Só é seguro para JIDs do WhatsApp (contêm `@`), que são inequívocos.
  // Para IDs de Telegram/Discord (numéricos puros), `wpp:X`, `tg:X` e `dc:X`
  // são grupos DIFERENTES: aplicar o fallback vazaria configuração entre
  // plataformas (ex.: um grupo do Telegram lendo a config de um grupo do
  // WhatsApp com o mesmo número).
  if (!norm.includes('@')) return null;

  return db.get(
    `SELECT * FROM group_mod
      WHERE group_id IN (?, ?, ?)
      ORDER BY CASE
        WHEN group_id = 'wpp:' || ? THEN 0
        WHEN group_id = 'tg:'  || ? THEN 1
        ELSE 2
      END
      LIMIT 1`,
    [`wpp:${norm}`, `tg:${norm}`, `dc:${norm}`, norm, norm]
  );
}

/**
 * Resolve a chave de escrita: preserva o formato já armazenado no banco.
 * Se o grupo ainda não existe, usa o groupId recebido (sem inventar prefixo).
 */
async function resolveGroupModKey(db: any, groupId: string): Promise<string> {
  const existing = await getGroupModRow(db, groupId);
  return existing?.group_id || groupId;
}

/**
 * Representação CANÔNICA do group_id no banco.
 *
 * Regra: remove o prefixo de plataforma APENAS quando o restante é um JID do
 * WhatsApp (contém `@`).
 *
 * Por quê a condição: IDs de Telegram (`-1003470059875`) e Discord
 * (`387787838013571072`) são numéricos puros. Remover o prefixo deles faria
 * `wpp:146078742`, `tg:146078742` e `dc:146078742` colidirem no MESMO registro —
 * vazando configuração entre plataformas.
 *
 * Um JID do WhatsApp (`120363…@g.us`) é inequívoco, então o prefixo é ruído.
 */
export function canonicalGroupId(groupId: string): string {
  const raw = String(groupId || '');
  const semPrefixo = raw.replace(/^(wpp|tg|dc):/i, '');
  // Só canoniza quando é claramente um JID do WhatsApp.
  if (semPrefixo.includes('@')) return semPrefixo;
  return raw;
}

/**
 * Garante que a linha do grupo exista com TODAS as flags explicitamente 0.
 *
 * Nunca depende do `DEFAULT` do schema: bancos criados antes da correção de
 * defaults têm `DEFAULT 1` gravado no DDL, e `CREATE TABLE IF NOT EXISTS` não
 * altera tabela existente.
 *
 * @returns a chave (group_id) efetivamente usada na linha.
 */
export async function ensureGroupModRow(groupId: string): Promise<string> {
  const db = await getDb();
  const existing = await getGroupModRow(db, groupId);
  if (existing?.group_id) return existing.group_id;

  const key = canonicalGroupId(groupId);
  const cols = GROUP_MOD_FLAGS.join(', ');
  const zeros = GROUP_MOD_FLAGS.map(() => '0').join(', ');
  await db.run(
    `INSERT OR IGNORE INTO group_mod (group_id, ${cols}) VALUES (?, ${zeros})`,
    [key]
  );
  return key;
}

export async function getGroupMod(groupId: string): Promise<GroupModConfig> {
  const db = await getDb();
  const row = await getGroupModRow(db, groupId);
  if (!row) return {};
  return {
    antispam: row.antispam === 1 || row.antispam === true,
    antiestrangeiro: row.antiestrangeiro === 1 || row.antiestrangeiro === true,
    autolink: row.autolink === 1 || row.autolink === true,
    bemvindo: row.bemvindo === 1 || row.bemvindo === true,
    detectar: row.detectar === 1 || row.detectar === true,
    remover: row.remover === 1 || row.remover === true,
    audit_only: row.audit_only === 1 || row.audit_only === true,
    antibot: row.antibot === 1 || row.antibot === true,
    casino: row.casino === 1 || row.casino === true,
    presentation_enabled: row.presentation_enabled === 1 || row.presentation_enabled === true,
  };
}

/**
 * Estado textual do grupo.
 * 'ativado' = tudo ligado | 'desativado' = nada ligado | 'personalizado' = misto
 */
export async function getGroupModState(groupId: string): Promise<'ativado' | 'desativado' | 'personalizado'> {
  const config = await getGroupMod(groupId);
  const flags = GROUP_MOD_FLAGS.filter(f => f !== 'audit_only');
  const on = flags.filter(f => config[f as keyof GroupModConfig] === true);
  if (on.length === 0) return 'desativado';
  if (on.length === flags.length) return 'ativado';
  return 'personalizado';
}

/**
 * Status centralizado de TODAS as automações do grupo.
 *
 * Fonte única para `$automod status`. Separa:
 *   - moderação (engine): antispam, antiestrangeiro, autolink, antibot, casino, remover, detectar
 *   - serviços: welcome, apresentações
 *   - modo: audit_only
 */
export async function getGroupAutomationStatus(groupId: string): Promise<{
  config: GroupModConfig;
  state: 'ativado' | 'desativado' | 'personalizado';
  hasRow: boolean;
}> {
  const db = await getDb();
  const row = await getGroupModRow(db, groupId);
  const config = await getGroupMod(groupId);
  const state = await getGroupModState(groupId);
  return { config, state, hasRow: !!row };
}

/**
 * Liga/desliga UMA flag do grupo.
 *
 * ⚠️ Não pode herdar defaults do schema: um `INSERT` de uma única coluna faria
 * as outras receberem os defaults da TABELA, ligando módulos que ninguém pediu
 * (ex.: `$bemvindo on` ligava AntiSpam/AntiLink/Remover).
 *
 * Também não pode confiar no `DEFAULT` do schema: bancos criados antes desta
 * correção têm `DEFAULT 1` gravado no DDL, e `CREATE TABLE IF NOT EXISTS` não
 * altera tabela já existente. Por isso as colunas são escritas EXPLICITAMENTE
 * como 0 na criação da linha.
 */
export async function setGroupModField(groupId: string, field: keyof GroupModConfig, value: boolean): Promise<void> {
  const db = await getDb();
  // Coluna é interpolada da lista fechada (não vem de input do usuário).
  if (!(GROUP_MOD_FLAGS as readonly string[]).includes(field)) {
    throw new Error(`setGroupModField: flag inválida "${field}"`);
  }
  // Cria a linha com TODAS as flags explicitamente 0 (não depende do schema).
  const key = await ensureGroupModRow(groupId);
  await db.run(
    `UPDATE group_mod SET ${field} = ? WHERE group_id = ?`,
    [value ? 1 : 0, key]
  );
}

/**
 * Aplica um conjunto de flags de uma vez.
 *
 * Flags ausentes no objeto NÃO são alteradas (preserva o que já está no banco)
 * e a linha nova é criada com tudo DESLIGADO antes de aplicar o que foi pedido.
 */
export async function setGroupModAll(groupId: string, config: GroupModConfig): Promise<void> {
  const db = await getDb();
  // Linha nova nasce com TODAS as flags explicitamente 0 (não depende do DEFAULT
  // do schema, que em bancos antigos é 1).
  const key = await ensureGroupModRow(groupId);

  // Só as flags EXPLICITAMENTE presentes no objeto são aplicadas.
  const entries = Object.entries(config).filter(
    ([k, v]) => typeof v === 'boolean' && (GROUP_MOD_FLAGS as readonly string[]).includes(k)
  ) as Array<[GroupModFlag, boolean]>;

  for (const [flag, value] of entries) {
    await db.run(
      `UPDATE group_mod SET ${flag} = ? WHERE group_id = ?`,
      [value ? 1 : 0, key]
    );
  }
}

/**
 * Garante que um grupo exista no group_mod.
 *
 * GRUPO NOVO: criado com TODAS as automações DESLIGADAS (GROUP_MOD_DEFAULTS) —
 * o bot nunca passa a moderar um grupo só porque entrou nele. Se `config` for
 * passado, apenas as flags explicitamente presentes nele são ligadas.
 *
 * GRUPO EXISTENTE: só os campos fornecidos são atualizados; o resto é
 * preservado. Nada é resetado.
 */
export async function ensureGroupMod(
  groupId: string,
  config?: Partial<GroupModConfig>,
): Promise<void> {
  const db = await getDb();
  const existing = await getGroupModRow(db, groupId);
  if (!existing) {
    // Grupo novo: tudo desligado; aplica só o que foi explicitamente pedido.
    const merged: GroupModConfig = { ...GROUP_MOD_DEFAULTS, ...(config || {}) };
    const key = canonicalGroupId(groupId);
    const cols = GROUP_MOD_FLAGS.join(', ');
    const vals = GROUP_MOD_FLAGS
      .map(f => (merged[f as keyof GroupModConfig] === true ? '1' : '0'))
      .join(', ');
    await db.run(
      `INSERT OR IGNORE INTO group_mod (group_id, ${cols}) VALUES (?, ${vals})`,
      [key]
    );
    logInfo(`[databaseService] Grupo ${key} criado no group_mod (automações desligadas por padrão).`);
  } else {
    const key = existing.group_id;
    if (config) {
      for (const [field, value] of Object.entries(config)) {
        if (value === undefined) continue;
        const f = field as keyof GroupModConfig;
        if (!(GROUP_MOD_FLAGS as readonly string[]).includes(f)) continue;
        await db.run(
          `UPDATE group_mod SET ${f} = ? WHERE group_id = ?`,
          [value ? 1 : 0, key]
        );
      }
      logInfo(`[databaseService] Grupo ${key} atualizado no group_mod.`);
    }
  }
}

import { isProtectedTarget } from '../services/permissions.js';
import { logInfo, logWarning, logError } from './loggerService';

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
    logWarning(`[databaseService] banUser bloqueado: tentativa de banir ID protegido (${uid}) no grupo ${entry.groupId}.`);
    return;
  }

  const db = await getDb();
  await dbExecWithRetry(db,
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

export async function recordMemberJoin(groupId: string, memberId: any): Promise<void> {
  const cleanMemberId = typeof memberId === 'string'
    ? memberId
    : (memberId?.id || memberId?.jid || memberId?.user || String(memberId || ''));
  if (!cleanMemberId || cleanMemberId === '[object Object]') return;

  const db = await getDb();
  try {
    await dbExecWithRetry(db,
      `INSERT INTO mod_member_joins (group_id, member_id, joined_at, left_at, reason)
       VALUES (?, ?, ?, NULL, 'not_set')
       ON CONFLICT(group_id, member_id, joined_at) DO NOTHING`,
      [groupId, cleanMemberId, Date.now()]
    );
  } catch (err: any) {
    logWarning('[mod_member_joins] recordMemberJoin falhou:', err?.message);
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
    logWarning('[mod_member_joins] recordMemberRemove falhou:', err?.message);
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
    await dbExecWithRetry(db,
      `INSERT INTO mod_msg_fingerprints (group_id, fingerprint, source_jid, first_seen, count)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(group_id, fingerprint, source_jid) DO UPDATE SET count = count + 1, first_seen = excluded.first_seen`,
      [groupId, fingerprint, sourceJid, Date.now()]
    );
  } catch (err: any) {
    logWarning('[mod_msg_fingerprints] recordMessageFingerprint falhou:', err?.message);
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
    logWarning('[mod_msg_fingerprints] cleanupOldFingerprintEntries falhou:', err?.message);
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
    logWarning('[mod_member_joins] cleanupOldJoinEntries falhou:', err?.message);
  }
}