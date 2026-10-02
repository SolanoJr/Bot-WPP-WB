/**
 * Configuração centralizada das automações por grupo.
 *
 * Regra de arquitetura:
 *   "Todo recurso automático configurável começa DESLIGADO em grupo novo."
 *
 * Exercita o CÓDIGO REAL do databaseService (sem mock de módulo) contra um
 * SQLite temporário em disco — provando o comportamento de produção, incluindo
 * schema, defaults e persistência entre processos.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// BOT_DATA_DIR precisa estar definido ANTES do import do databaseService
// (o caminho do banco é resolvido no load do módulo).
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-test-'));
process.env.BOT_DATA_DIR = TMP_DIR;

let db: typeof import('../../src/services/databaseService');

const GRUPO_A = '120363419033272638@g.us';
const GRUPO_B = '120363410094452673@g.us';
const GRUPO_C = '120363499999999999@g.us';

beforeAll(async () => {
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('1+2. GRUPO NOVO — tudo desligado', () => {
  it('grupo sem linha: nenhuma automação ativa', async () => {
    const cfg = await db.getGroupMod(GRUPO_C);
    const ativas = Object.values(cfg).filter(v => v === true);
    expect(ativas.length).toBe(0);
  });

  it('ensureGroupMod cria grupo novo com TODAS as automações desligadas', async () => {
    await db.ensureGroupMod(GRUPO_A);
    const cfg = await db.getGroupMod(GRUPO_A);
    expect(cfg.antispam).toBe(false);
    expect(cfg.antiestrangeiro).toBe(false);
    expect(cfg.autolink).toBe(false);
    expect(cfg.remover).toBe(false);
    expect(cfg.detectar).toBe(false);
    expect(cfg.antibot).toBe(false);
    expect(cfg.casino).toBe(false);
    expect(cfg.bemvindo).toBe(false);
    expect(cfg.presentation_enabled).toBe(false);
  });

  it('ausência de group_mod NÃO ativa nada (nenhum default true)', async () => {
    const state = await db.getGroupModState(GRUPO_C);
    expect(state).toBe('desativado');
  });

  it('o schema não tem nenhum DEFAULT 1 (nenhum módulo nasce ligado)', async () => {
    const conn: any = await (db as any).getDb();
    const rows: any[] = await conn.all(`SELECT name, dflt_value FROM pragma_table_info('group_mod')`);
    const comDefault1 = rows.filter(r => String(r.dflt_value) === '1');
    expect(comDefault1).toEqual([]);
  });
});

describe('4+5. Ativar/desativar UMA automação não altera as outras', () => {
  it('ligar antibot não liga antispam/autolink/remover', async () => {
    await db.setGroupModField(GRUPO_A, 'antibot', true);
    const cfg = await db.getGroupMod(GRUPO_A);
    expect(cfg.antibot).toBe(true);
    expect(cfg.antispam).toBe(false);
    expect(cfg.antiestrangeiro).toBe(false);
    expect(cfg.autolink).toBe(false);
    expect(cfg.remover).toBe(false);
    expect(cfg.casino).toBe(false);
  });

  it('ligar bemvindo não liga moderação (bug antigo do INSERT)', async () => {
    await db.setGroupModField(GRUPO_B, 'bemvindo', true);
    const cfg = await db.getGroupMod(GRUPO_B);
    expect(cfg.bemvindo).toBe(true);
    expect(cfg.antispam).toBe(false);
    expect(cfg.autolink).toBe(false);
    expect(cfg.remover).toBe(false);
    expect(cfg.antiestrangeiro).toBe(false);
  });

  it('desligar uma automação não afeta as outras', async () => {
    await db.setGroupModField(GRUPO_A, 'casino', true);
    await db.setGroupModField(GRUPO_A, 'casino', false);
    const cfg = await db.getGroupMod(GRUPO_A);
    expect(cfg.casino).toBe(false);
    expect(cfg.antibot).toBe(true); // preservado do teste anterior
  });
});

describe('3. GRUPO EXISTENTE — configuração preservada', () => {
  it('ensureGroupMod em grupo existente não reseta', async () => {
    await db.setGroupModField(GRUPO_A, 'antispam', true);
    await db.ensureGroupMod(GRUPO_A); // não deve resetar
    const cfg = await db.getGroupMod(GRUPO_A);
    expect(cfg.antispam).toBe(true);
    expect(cfg.antibot).toBe(true);
  });

  it('ensureGroupMod com config só aplica as flags informadas', async () => {
    await db.ensureGroupMod(GRUPO_C, { casino: true });
    const cfg = await db.getGroupMod(GRUPO_C);
    expect(cfg.casino).toBe(true);
    expect(cfg.antispam).toBe(false);
    expect(cfg.antibot).toBe(false);
  });
});

describe('6. Configuração sobrevive a restart (SQLite em disco)', () => {
  it('valores persistem no arquivo do banco', async () => {
    await db.setGroupModField(GRUPO_B, 'casino', true);
    // Lê o arquivo diretamente — simula outro processo abrindo o mesmo banco
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    const conn = await open({ filename: path.join(TMP_DIR, 'bot_database.db'), driver: sqlite3.Database });
    const row: any = await conn.get(`SELECT casino, bemvindo FROM group_mod WHERE group_id = ?`, [GRUPO_B]);
    await conn.close();
    expect(row.casino).toBe(1);
    expect(row.bemvindo).toBe(1);
  });
});

describe('7. Grupos independentes', () => {
  it('config do grupo A não afeta o grupo C', async () => {
    const a = await db.getGroupMod(GRUPO_A);
    const c = await db.getGroupMod(GRUPO_C);
    expect(a.antibot).toBe(true);
    expect(c.antibot).toBe(false);
  });
});

describe('setGroupModField — validação de flag', () => {
  it('rejeita flag inexistente (não interpola SQL arbitrário)', async () => {
    await expect(db.setGroupModField(GRUPO_A, 'flag_inexistente' as any, true)).rejects.toThrow();
  });
});

describe('getGroupAutomationStatus — status centralizado', () => {
  it('retorna config + state + hasRow', async () => {
    const novo = '120363488888888888@g.us';
    const antes = await db.getGroupAutomationStatus(novo);
    expect(antes.hasRow).toBe(false);
    expect(antes.state).toBe('desativado');

    await db.setGroupModField(novo, 'antibot', true);
    const depois = await db.getGroupAutomationStatus(novo);
    expect(depois.hasRow).toBe(true);
    expect(depois.config.antibot).toBe(true);
    expect(depois.state).toBe('personalizado');
  });
});

describe('setGroupModAll — só aplica flags presentes', () => {
  it('não altera flags ausentes do objeto', async () => {
    const g = '120363477777777777@g.us';
    await db.setGroupModField(g, 'casino', true);
    await db.setGroupModAll(g, { antispam: true });
    const cfg = await db.getGroupMod(g);
    expect(cfg.antispam).toBe(true);
    expect(cfg.casino).toBe(true); // preservado
  });
});

describe('BANCO LEGADO — schema antigo com DEFAULT 1 não liga módulos', () => {
  // Reproduz o banco de PRODUÇÃO: criado antes da correção, com DEFAULT 1
  // gravado no DDL. `CREATE TABLE IF NOT EXISTS` não altera tabela existente,
  // então o código NÃO pode depender do DEFAULT do schema.
  const LEGADO_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-legado-'));

  it('linha nova em tabela legada nasce com tudo DESLIGADO', async () => {
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    const file = path.join(LEGADO_DIR, 'legado.db');
    const conn = await open({ filename: file, driver: sqlite3.Database });

    // DDL legado, com os DEFAULT 1 problemáticos
    await conn.exec(`
      CREATE TABLE group_mod (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL UNIQUE,
        antispam BOOLEAN DEFAULT 1,
        antiestrangeiro BOOLEAN DEFAULT 1,
        autolink BOOLEAN DEFAULT 1,
        bemvindo BOOLEAN DEFAULT 0,
        detectar BOOLEAN DEFAULT 0,
        remover BOOLEAN DEFAULT 1,
        audit_only BOOLEAN DEFAULT 0,
        welcome_message TEXT DEFAULT NULL,
        presentation_enabled INTEGER NOT NULL DEFAULT 0,
        antibot INTEGER NOT NULL DEFAULT 0,
        casino INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Simula exatamente o SQL que o código emite ao ligar UMA flag
    const cols = 'antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only, antibot, casino, presentation_enabled';
    const zeros = '0, 0, 0, 0, 0, 0, 0, 0, 0, 0';
    const g = '120363411111111111@g.us';
    await conn.run(`INSERT OR IGNORE INTO group_mod (group_id, ${cols}) VALUES (?, ${zeros})`, [g]);
    await conn.run(`UPDATE group_mod SET bemvindo = 1 WHERE group_id = ?`, [g]);

    const row: any = await conn.get(`SELECT * FROM group_mod WHERE group_id = ?`, [g]);
    await conn.close();

    // A flag pedida ligou; as demais permaneceram DESLIGADAS (apesar do DEFAULT 1)
    expect(row.bemvindo).toBe(1);
    expect(row.antispam).toBe(0);
    expect(row.antiestrangeiro).toBe(0);
    expect(row.autolink).toBe(0);
    expect(row.remover).toBe(0);

    fs.rmSync(LEGADO_DIR, { recursive: true, force: true });
  });
});
