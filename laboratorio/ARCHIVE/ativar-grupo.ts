#!/usr/bin/env node
/**
 * laboratorio/ativar-grupo.ts
 *
 * Ativa as configurações de moderação automática para um grupo específico
 * no banco de dados SQLite (data/bot_database.db).
 *
 * Uso:
 *   node dist/laboratorio/ativar-grupo.js --group JID              # ativa com defaults
 *   node dist/laboratorio/ativar-grupo.js --group JID --dry-run   # mostra sem alterar
 *   node dist/laboratorio/ativar-grupo.js --list                   # lista grupos ativos
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { argv } from 'process';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = 'bot_database.db';
const dbPath = path.join(DB_DIR, DB_FILE);

function log(msg: string) { console.log(`[ATIVAR-GRUPO] ${msg}`); }
function logError(msg: string) { console.error(`[ATIVAR-GRUPO-ERR] ${msg}`); }

interface GroupModConfig {
  antispam: boolean;
  antiestrangeiro: boolean;
  autolink: boolean;
  bemvindo: boolean;
  detectar: boolean;
  remover: boolean;
  audit_only: boolean;
}

async function initDb(): Promise<Database> {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });
  await db.exec("PRAGMA journal_mode=WAL;");
  await db.exec("PRAGMA busy_timeout=5000;");
  return db;
}

async function ensureGroupMod(
  db: Database,
  groupId: string,
  config: GroupModConfig,
): Promise<void> {
  const existing = await db.get(
    `SELECT * FROM group_mod WHERE group_id = ?`,
    [groupId]
  );

  if (!existing) {
    await db.run(
      `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        groupId,
        config.antispam ? 1 : 0,
        config.antiestrangeiro ? 1 : 0,
        config.autolink ? 1 : 0,
        config.bemvindo ? 1 : 0,
        config.detectar ? 1 : 0,
        config.remover ? 1 : 0,
        config.audit_only ? 1 : 0,
      ]
    );
    log(`Grupo criado: ${groupId}`);
  } else {
    await db.run(
      `UPDATE group_mod SET
        antispam = ?,
        antiestrangeiro = ?,
        autolink = ?,
        bemvindo = ?,
        detectar = ?,
        remover = ?,
        audit_only = ?
       WHERE group_id = ?`,
      [
        config.antispam ? 1 : 0,
        config.antiestrangeiro ? 1 : 0,
        config.autolink ? 1 : 0,
        config.bemvindo ? 1 : 0,
        config.detectar ? 1 : 0,
        config.remover ? 1 : 0,
        config.audit_only ? 1 : 0,
        groupId,
      ]
    );
    log(`Grupo atualizado: ${groupId}`);
  }
}

async function getGroupMod(db: Database, groupId: string): Promise<GroupModConfig | null> {
  const row = await db.get(
    `SELECT antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only
     FROM group_mod WHERE group_id = ?`,
    [groupId]
  );
  if (!row) return null;
  return {
    antispam: row.antispam === 1,
    antiestrangeiro: row.antiestrangeiro === 1,
    autolink: row.autolink === 1,
    bemvindo: row.bemvindo === 1,
    detectar: row.detectar === 1,
    remover: row.remover === 1,
    audit_only: row.audit_only === 1,
  };
}

async function listGroups(db: Database): Promise<void> {
  const rows = await db.all(
    `SELECT group_id, antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only
     FROM group_mod ORDER BY group_id`
  );
  log('═══ GRUPOS ATIVOS NO AUTO-MOD ═══');
  if (rows.length === 0) {
    log('Nenhum grupo configurado.');
  }
  for (const r of rows) {
    log(`  ${r.group_id}`);
    log(`    antispam: ${r.antispam === 1 ? 'ON' : 'OFF'} | antiestrangeiro: ${r.antiestrangeiro === 1 ? 'ON' : 'OFF'} | autolink: ${r.autolink === 1 ? 'ON' : 'OFF'} | remover: ${r.remover === 1 ? 'ON' : 'OFF'} | detectar: ${r.detectar === 1 ? 'ON' : 'OFF'} | audit_only: ${r.audit_only === 1 ? 'ON' : 'OFF'}`);
  }
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const groupArg = args.find(a => a === '--group') ? args[args.indexOf('--group') + 1] : undefined;
  const dryRun = args.includes('--dry-run');
  const listFlag = args.includes('--list');

  log('===============================================================');
  log(`Modo: ${dryRun ? 'DRY-RUN' : 'REAL'}`);
  log('===============================================================');

  const db = await initDb();

  if (listFlag || (!groupArg)) {
    await listGroups(db);
    await db.close();
    return;
  }

  const defaultConfig: GroupModConfig = {
    antispam: true,
    antiestrangeiro: true,
    autolink: true,
    bemvindo: false,
    detectar: true,
    remover: true,
    audit_only: false,
  };

  if (dryRun) {
    const existing = await getGroupMod(db, groupArg);
    log(`Grupo: ${groupArg}`);
    log(`Configurações ATUALIZADAS seriam:`);
    log(`  antispam: ${defaultConfig.antispam}`);
    log(`  antiestrangeiro: ${defaultConfig.antiestrangeiro}`);
    log(`  autolink: ${defaultConfig.autolink}`);
    log(`  bemvindo: ${defaultConfig.bemvindo}`);
    log(`  detectar: ${defaultConfig.detectar}`);
    log(`  remover: ${defaultConfig.remover}`);
    log(`  audit_only: ${defaultConfig.audit_only}`);
    if (existing) {
      log(`Configurações ATUAIS:`);
      log(`  antispam: ${existing.antispam}`);
      log(`  antiestrangeiro: ${existing.antiestrangeiro}`);
      log(`  autolink: ${existing.autolink}`);
      log(`  bemvindo: ${existing.bemvindo}`);
      log(`  detectar: ${existing.detectar}`);
      log(`  remover: ${existing.remover}`);
      log(`  audit_only: ${existing.audit_only}`);
    } else {
      log(`Grupo não existe no banco. Seria CRIADO.`);
    }
  } else {
    await ensureGroupMod(db, groupArg, defaultConfig);
    const updated = await getGroupMod(db, groupArg);
    log(`Configurações aplicadas para ${groupArg}:`);
    log(`  antispam: ${updated?.antispam}`);
    log(`  antiestrangeiro: ${updated?.antiestrangeiro}`);
    log(`  autolink: ${updated?.autolink}`);
    log(`  bemvindo: ${updated?.bemvindo}`);
    log(`  detectar: ${updated?.detectar}`);
    log(`  remover: ${updated?.remover}`);
    log(`  audit_only: ${updated?.audit_only}`);
  }

  await db.close();
  log('===============================================================');
}

main().catch(err => {
  logError(`Erro fatal: ${err.message || err}`);
  process.exit(1);
});
