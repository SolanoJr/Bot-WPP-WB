/**
 * INTEGRAÇÃO — canonicalização do group_id.
 *
 * O banco de produção gravava `wpp:120363…@g.us` e o engine consultava
 * `120363…@g.us` (BUG-E). Este teste prova, contra SQLite REAL:
 *   - gravação canônica (sem prefixo);
 *   - leitura aceita raw, wpp:, tg:, dc:;
 *   - grupos de plataformas diferentes não colidem;
 *   - banco legado com prefixo continua sendo encontrado.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-gid-'));
process.env.BOT_DATA_DIR = TMP_DIR;

let db: typeof import('../../src/services/databaseService');

beforeAll(async () => {
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('canonicalGroupId', () => {
  it('remove prefixo wpp: de um JID do WhatsApp', () => {
    expect(db.canonicalGroupId('wpp:120363419033272638@g.us')).toBe('120363419033272638@g.us');
  });
  it('PRESERVA prefixo tg: em ID numérico (evita colisão entre plataformas)', () => {
    expect(db.canonicalGroupId('tg:-1003470059875')).toBe('tg:-1003470059875');
  });
  it('PRESERVA prefixo dc: em ID numérico (evita colisão entre plataformas)', () => {
    expect(db.canonicalGroupId('dc:387787838013571072')).toBe('dc:387787838013571072');
  });
  it('JID cru permanece igual', () => {
    expect(db.canonicalGroupId('120363419033272638@g.us')).toBe('120363419033272638@g.us');
  });
  it('não confunde um id que já contenha "wpp" no meio', () => {
    expect(db.canonicalGroupId('120363wpp9@g.us')).toBe('120363wpp9@g.us');
  });
});

describe('gravação é CANÔNICA (sem prefixo)', () => {
  it('setGroupModField grava sem prefixo mesmo recebendo wpp:', async () => {
    await db.setGroupModField('wpp:120363411111111111@g.us', 'antibot', true);
    const conn: any = await (db as any).getDb();
    const row: any = await conn.get(`SELECT group_id FROM group_mod WHERE antibot = 1`);
    expect(row.group_id).toBe('120363411111111111@g.us');
    expect(row.group_id.startsWith('wpp:')).toBe(false);
  });
});

describe('leitura aceita todas as variantes', () => {
  it('raw e wpp: retornam a MESMA configuração', async () => {
    const G = '120363422222222222@g.us';
    await db.setGroupModField(G, 'casino', true);
    const a = await db.getGroupMod(G);
    const b = await db.getGroupMod('wpp:' + G);
    expect(a.casino).toBe(true);
    expect(b.casino).toBe(true);
  });

  it('banco LEGADO com prefixo wpp: ainda é encontrado pelo JID cru', async () => {
    const conn: any = await (await (db as any).getDb());
    // Simula registro antigo, gravado COM prefixo
    await conn.run(
      `INSERT INTO group_mod (group_id, antispam, antiestrangeiro, autolink, bemvindo, detectar, remover, audit_only, antibot, casino, presentation_enabled)
       VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0)`,
      ['wpp:120363433333333333@g.us']
    );
    const cfg = await db.getGroupMod('120363433333333333@g.us');
    expect(cfg.casino).toBe(true);   // encontrado apesar do prefixo legado
  });
});

describe('plataformas diferentes NÃO colidem', () => {
  it('wpp:X, tg:X e dc:X são registros distintos', async () => {
    const base = '146078742';
    await db.setGroupModField(`wpp:${base}`, 'antibot', true);
    await db.setGroupModField(`tg:${base}`, 'casino', true);
    await db.setGroupModField(`dc:${base}`, 'antispam', true);

    const wpp = await db.getGroupMod(`wpp:${base}`);
    const tg = await db.getGroupMod(`tg:${base}`);
    const dc = await db.getGroupMod(`dc:${base}`);

    // Cada um tem só a sua flag ligada — sem vazamento entre plataformas
    expect(wpp.antibot).toBe(true);
    expect(wpp.casino).toBe(false);
    expect(tg.casino).toBe(true);
    expect(tg.antibot).toBe(false);
    expect(dc.antispam).toBe(true);
    expect(dc.antibot).toBe(false);
  });
});

describe('ensureGroupModRow', () => {
  it('cria linha com TODAS as flags em 0', async () => {
    const G = '120363444444444444@g.us';
    await db.ensureGroupModRow(G);
    const cfg = await db.getGroupMod(G);
    const ligadas = Object.values(cfg).filter(v => v === true);
    expect(ligadas).toEqual([]);
  });

  it('não altera linha existente', async () => {
    const G = '120363455555555555@g.us';
    await db.setGroupModField(G, 'antibot', true);
    await db.ensureGroupModRow(G);
    const cfg = await db.getGroupMod(G);
    expect(cfg.antibot).toBe(true);
  });
});
