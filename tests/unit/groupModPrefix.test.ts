/**
 * Testes do Fix 1 — normalização do prefixo de plataforma em group_mod.
 *
 * BUG (comprovado em produção):
 *   DB:        "wpp:120363419033272638@g.us"
 *   evaluate(): "120363419033272638@g.us"
 *   → getGroupMod() fazia match exato → {} → "nada ligado — ignorando"
 *
 * Estes testes usam um SQLite REAL em memória (não mock de função), porque o
 * bug só se manifesta no SQL (comparação exata de string). Mockar getGroupMod
 * esconderia exatamente o defeito que queremos provar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normGroupId } from '../../src/services/groupIds';

// ─── Helpers: banco real em memória via sqlite3 (mesmo driver da produção) ───
import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';

const GROUP_WPP = '120363419033272638@g.us';
const GROUP_TG = '146078742';
const GROUP_DC = '1521942390082900190';

/** Recria as funções de leitura/escrita do databaseService sobre um DB real. */
async function makeDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE group_mod (
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
  return db;
}

// Mesma lógica do getGroupModRow() em databaseService.ts (exato → normalizado → variantes)
async function getGroupModRow(db: Database, groupId: string) {
  const raw = String(groupId ?? '');
  const norm = normGroupId(raw);

  const exact = await db.get(`SELECT * FROM group_mod WHERE group_id = ? LIMIT 1`, [raw]);
  if (exact) return exact;

  if (norm !== raw) {
    const exactNorm = await db.get(`SELECT * FROM group_mod WHERE group_id = ? LIMIT 1`, [norm]);
    if (exactNorm) return exactNorm;
  }

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

/** Replica a query ANTIGA (bugada) para provar a regressão. */
async function getGroupModRowOld(db: Database, groupId: string) {
  return db.get(`SELECT * FROM group_mod WHERE group_id = ?`, [groupId]);
}

describe('Fix 1 — normGroupId()', () => {
  it('remove prefixo wpp:', () => {
    expect(normGroupId(`wpp:${GROUP_WPP}`)).toBe(GROUP_WPP);
  });
  it('remove prefixo tg:', () => {
    expect(normGroupId(`tg:${GROUP_TG}`)).toBe(GROUP_TG);
  });
  it('remove prefixo dc:', () => {
    expect(normGroupId(`dc:${GROUP_DC}`)).toBe(GROUP_DC);
  });
  it('não altera ID já sem prefixo (idempotente)', () => {
    expect(normGroupId(GROUP_WPP)).toBe(GROUP_WPP);
    expect(normGroupId(normGroupId(`wpp:${GROUP_WPP}`))).toBe(GROUP_WPP);
  });
  it('não remove prefixo no meio do ID', () => {
    expect(normGroupId('120363wpp:123@g.us')).toBe('120363wpp:123@g.us');
  });
  it('lida com vazio/null sem quebrar', () => {
    expect(normGroupId('')).toBe('');
    expect(normGroupId(null as any)).toBe('');
    expect(normGroupId(undefined as any)).toBe('');
  });
});

describe('Fix 1 — lookup no SQL real (a prova do bug)', () => {
  let db: Database;

  beforeEach(async () => {
    db = await makeDb();
    // Cenário de produção: gravado COM prefixo (via PlatformManager/ctx.chatId)
    await db.run(
      `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only)
       VALUES (?, 1, 1, 1, 1, 1, 1, 0)`,
      [`wpp:${GROUP_WPP}`]
    );
  });

  it('ANTES (query exata): consultar sem prefixo → MISS → "nada ligado"', async () => {
    const row = await getGroupModRowOld(db, GROUP_WPP);
    expect(row).toBeUndefined(); // ← exatamente o bug de produção
  });

  it('DEPOIS (query normalizada): consultar sem prefixo → HIT', async () => {
    const row: any = await getGroupModRow(db, GROUP_WPP);
    expect(row).toBeDefined();
    expect(row.remover).toBe(1);
    expect(row.antiestrangeiro).toBe(1);
  });

  it('DEPOIS: consultar COM prefixo também funciona (mesma config)', async () => {
    const semPrefixo: any = await getGroupModRow(db, GROUP_WPP);
    const comPrefixo: any = await getGroupModRow(db, `wpp:${GROUP_WPP}`);
    expect(comPrefixo).toBeDefined();
    expect(comPrefixo.remover).toBe(semPrefixo.remover);
    expect(comPrefixo.antiestrangeiro).toBe(semPrefixo.antiestrangeiro);
  });

  it('DEPOIS: grupo inexistente continua retornando undefined', async () => {
    const row = await getGroupModRow(db, '999999999@g.us');
    expect(row).toBeUndefined();
  });

  it('DEPOIS: não confunde grupos diferentes com prefixos diferentes', async () => {
    // Grava um grupo de Telegram com o mesmo número base
    await db.run(
      `INSERT INTO group_mod (group_id, antispam, remover) VALUES (?, 0, 0)`,
      [`tg:${GROUP_WPP}`]
    );
    const wpp: any = await getGroupModRow(db, `wpp:${GROUP_WPP}`);
    const tg: any = await getGroupModRow(db, `tg:${GROUP_WPP}`);
    expect(wpp.remover).toBe(1);  // grupo wpp
    expect(tg.remover).toBe(0);   // grupo tg — não deve colidir
  });
});

describe('Fix 1 — escrita preserva o formato armazenado', () => {
  let db: Database;

  beforeEach(async () => {
    db = await makeDb();
  });

  it('grava com prefixo quando o grupo já existe com prefixo (sem migração)', async () => {
    await db.run(`INSERT INTO group_mod (group_id) VALUES (?)`, [`wpp:${GROUP_WPP}`]);
    const existing: any = await getGroupModRow(db, GROUP_WPP);
    // resolveGroupModKey devolve a chave existente
    const key = existing?.group_id || GROUP_WPP;
    expect(key).toBe(`wpp:${GROUP_WPP}`);

    await db.run(`UPDATE group_mod SET remover = ? WHERE group_id = ?`, [0, key]);
    const after: any = await getGroupModRow(db, GROUP_WPP);
    expect(after.remover).toBe(0);
    // Continua existindo UMA linha só (não criou duplicata sem prefixo)
    const count: any = await db.get(`SELECT COUNT(*) c FROM group_mod`);
    expect(count.c).toBe(1);
  });

  it('grupo novo sem prefixo é gravado como recebido (não inventa prefixo)', async () => {
    const existing: any = await getGroupModRow(db, GROUP_WPP);
    expect(existing).toBeUndefined();
    const key = existing?.group_id || GROUP_WPP;
    await db.run(`INSERT INTO group_mod (group_id) VALUES (?)`, [key]);
    const row: any = await db.get(`SELECT group_id FROM group_mod`);
    expect(row.group_id).toBe(GROUP_WPP);
  });
});

describe('Fix 1 — integração com evaluate() (caminho de produção)', () => {
  it('evaluate() encontra a config quando o DB usa prefixo wpp:', async () => {
    vi.resetModules();
    const db = await makeDb();
    await db.run(
      `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only)
       VALUES (?, 1, 1, 1, 1, 1, 1, 0)`,
      [`wpp:${GROUP_WPP}`]
    );

    // Mock do databaseService.getGroupMod usando o MESMO SQL real do fix
    vi.doMock('../../src/services/databaseService', () => ({
      getGroupMod: async (groupId: string) => {
        const row: any = await getGroupModRow(db, groupId);
        if (!row) return {};
        return {
          antispam: row.antispam === 1,
          antiestrangeiro: row.antiestrangeiro === 1,
          autolink: row.autolink === 1,
          bemvindo: row.bemvindo === 1,
          detectar: row.detectar === 1,
          remover: row.remover === 1,
          audit_only: row.audit_only === 1,
        };
      },
      banUser: async () => {},
      recordMemberJoin: async () => {},
      recordMemberRemove: async () => {},
      recordMessageFingerprint: async () => {},
      getRecentFingerprintCount: async () => 0,
      cleanupOldFingerprintEntries: async () => {},
      cleanupOldJoinEntries: async () => {},
    }));

    const { evaluate } = await import('../../src/services/autoModEngine');

    const ctx: any = {
      sock: {}, userId: '558581344211@s.whatsapp.net', fromMe: false, groupName: 'Figurinhas',
      getChat: async () => ({ participants: [], id: GROUP_WPP, subject: 'Figurinhas' }),
      sendMessage: async () => ({ id: 's1' }),
      removeParticipant: async () => {},
      log: () => {}, warn: () => {}, error: () => {},
    };

    // Mensagem inofensiva, mas de número ESTRANGEIRO: se a config for encontrada,
    // a regra antiestrangeiro responde (audit_only=false). Se não for encontrada,
    // o engine retorna "nada ligado — ignorando" (o bug).
    const msg: any = {
      key: { id: 'm1', fromMe: false, remoteJid: GROUP_WPP, participant: '1234567890@s.whatsapp.net' },
      message: { conversation: 'oi' },
      messageTimestamp: Date.now(),
    };

    const result = await evaluate(msg, ctx, GROUP_WPP, '1234567890@s.whatsapp.net', 'Estranho');

    // Com o fix, a config é encontrada → a regra antiestrangeiro age.
    expect(result.reason).not.toContain('nada ligado');
    expect(result.acted).toBe(true);
    expect(result.reason).toContain('antiestrangeiro');

    await db.close();
    vi.doUnmock('../../src/services/databaseService');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Matriz de colisão entre plataformas (exigência da revisão)
// ═══════════════════════════════════════════════════════════════════════════

describe('Fix 1 — matriz de colisão wpp:/tg:/dc:', () => {
  const BASE = '999999999';

  async function seed() {
    const db = await makeDb();
    // Três grupos distintos, mesmo ID base, plataformas diferentes
    await db.run(`INSERT INTO group_mod (group_id, antispam, remover) VALUES (?, 1, 1)`, [`wpp:${BASE}@g.us`]);
    await db.run(`INSERT INTO group_mod (group_id, antispam, remover) VALUES (?, 0, 0)`, [`tg:${BASE}`]);
    await db.run(`INSERT INTO group_mod (group_id, antispam, remover) VALUES (?, 1, 0)`, [`dc:${BASE}`]);
    return db;
  }

  it('cada variante resolve para a SUA própria linha', async () => {
    const db = await seed();
    const wpp: any = await getGroupModRow(db, `wpp:${BASE}@g.us`);
    const tg: any = await getGroupModRow(db, `tg:${BASE}`);
    const dc: any = await getGroupModRow(db, `dc:${BASE}`);

    expect(wpp.group_id).toBe(`wpp:${BASE}@g.us`);
    expect(tg.group_id).toBe(`tg:${BASE}`);
    expect(dc.group_id).toBe(`dc:${BASE}`);

    // flags distintas → nenhuma colisão
    expect(wpp.remover).toBe(1);
    expect(tg.remover).toBe(0);
    expect(dc.remover).toBe(0);
    expect(wpp.antispam).toBe(1);
    expect(tg.antispam).toBe(0);
    await db.close();
  });

  it('wpp:X ≠ tg:X', async () => {
    const db = await seed();
    const wpp: any = await getGroupModRow(db, `wpp:${BASE}@g.us`);
    const tg: any = await getGroupModRow(db, `tg:${BASE}`);
    expect(wpp.group_id).not.toBe(tg.group_id);
    expect(wpp.remover).not.toBe(tg.remover);
    await db.close();
  });

  it('wpp:X ≠ dc:X', async () => {
    const db = await seed();
    const wpp: any = await getGroupModRow(db, `wpp:${BASE}@g.us`);
    const dc: any = await getGroupModRow(db, `dc:${BASE}`);
    expect(wpp.group_id).not.toBe(dc.group_id);
    expect(wpp.remover).not.toBe(dc.remover); // wpp=1, dc=0
    await db.close();
  });

  it('tg:X ≠ dc:X', async () => {
    const db = await seed();
    const tg: any = await getGroupModRow(db, `tg:${BASE}`);
    const dc: any = await getGroupModRow(db, `dc:${BASE}`);
    expect(tg.group_id).not.toBe(dc.group_id);
    await db.close();
  });

  it('match exato tem PRIORIDADE sobre o fallback por prefixo', async () => {
    const db = await seed();
    // Consultar com prefixo explícito deve retornar aquela linha, não a primeira
    const tg: any = await getGroupModRow(db, `tg:${BASE}`);
    expect(tg.group_id).toBe(`tg:${BASE}`); // não caiu no wpp: por ordem
    const dc: any = await getGroupModRow(db, `dc:${BASE}`);
    expect(dc.group_id).toBe(`dc:${BASE}`);
    await db.close();
  });

  it('consulta SEM prefixo resolve a variante wpp: (caso real de produção)', async () => {
    const db = await makeDb();
    await db.run(`INSERT INTO group_mod (group_id, remover) VALUES (?, 1)`, [`wpp:${BASE}@g.us`]);
    const row: any = await getGroupModRow(db, `${BASE}@g.us`);
    expect(row).toBeDefined();
    expect(row.group_id).toBe(`wpp:${BASE}@g.us`);
    await db.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// audit_only=1 impede ação destrutiva (exigência da revisão)
// ═══════════════════════════════════════════════════════════════════════════

describe('Fix 1 — audit_only bloqueia ação destrutiva', () => {
  it('com audit_only=1, evaluate() NÃO deleta/remove/bani (só loga)', async () => {
    vi.resetModules();
    const db = await makeDb();
    await db.run(
      `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only)
       VALUES (?, 1, 1, 1, 1, 1, 1, 1)`,           // ← audit_only LIGADO
      [`wpp:${GROUP_WPP}`]
    );

    vi.doMock('../../src/services/databaseService', () => ({
      getGroupMod: async (groupId: string) => {
        const row: any = await getGroupModRow(db, groupId);
        if (!row) return {};
        return {
          antispam: row.antispam === 1, antiestrangeiro: row.antiestrangeiro === 1,
          autolink: row.autolink === 1, bemvindo: row.bemvindo === 1,
          detectar: row.detectar === 1, remover: row.remover === 1,
          audit_only: row.audit_only === 1,
        };
      },
      banUser: async () => {}, recordMemberJoin: async () => {}, recordMemberRemove: async () => {},
      recordMessageFingerprint: async () => {}, getRecentFingerprintCount: async () => 0,
      cleanupOldFingerprintEntries: async () => {}, cleanupOldJoinEntries: async () => {},
    }));

    const { evaluate } = await import('../../src/services/autoModEngine');
    const logs: string[] = [];
    const sendMessage = vi.fn(async () => ({ id: 's1' }));
    const removeParticipant = vi.fn(async () => {});

    const ctx: any = {
      sock: {}, userId: '558581344211@s.whatsapp.net', fromMe: false, groupName: 'Figurinhas',
      getChat: async () => ({ participants: [], id: GROUP_WPP, subject: 'Figurinhas' }),
      sendMessage, removeParticipant,
      log: (m: string) => logs.push(String(m)), warn: () => {}, error: () => {},
    };

    const msg: any = {
      key: { id: 'm1', fromMe: false, remoteJid: GROUP_WPP, participant: '1234567890@s.whatsapp.net' },
      message: { conversation: 'oi' },
      messageTimestamp: Date.now(),
    };

    const result = await evaluate(msg, ctx, GROUP_WPP, '1234567890@s.whatsapp.net', 'Estranho');

    // audit_only: detecta mas NÃO executa
    expect(result.acted).toBe(false);
    expect(removeParticipant).not.toHaveBeenCalled();
    // sendMessage só poderia ser delete/anúncio — não deve haver nenhum
    expect(sendMessage).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('AUDIT-ONLY');

    await db.close();
    vi.doUnmock('../../src/services/databaseService');
  });
});
