/**
 * INC-015/016 F3 — fluxo completo de apresentação, sem efeito real no
 * Telegram (a publicação é acoplada ao timer do boot; aqui provamos só o
 * que o service promete: coleta → sessão → consolidação → presentations).
 *
 * O E2E real (com publicação no tópico 2 do Telegram) fica aguardando
 * autorização explícita do dono — o design casa persistência e envio no
 * mesmo tick, então não existe dry-run de ponta a ponta no processo real.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-apres-'));
process.env.BOT_DATA_DIR = TMP_DIR;

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

let db: typeof import('../../src/services/databaseService');
let ps: typeof import('../../src/services/presentationService');
let wl: typeof import('../../src/services/welcomeService');

const LAB = '120363410094452673@g.us';
const USER = '5585999999999@s.whatsapp.net';
const USER2 = '5585888888888@s.whatsapp.net';

beforeAll(async () => {
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
  ps = await import('../../src/services/presentationService');
  wl = await import('../../src/services/welcomeService');
});

beforeEach(async () => {
  const conn: any = await (db as any).getDb();
  await conn.run(`DELETE FROM presentations`);
  await conn.run(`DELETE FROM community_groups`);
  await conn.run(`DELETE FROM group_mod WHERE group_id = ?`, [LAB]);
  // limpa sessões em memória entre testes (o Map vive no módulo)
  ps.closeSession(LAB, USER);
  ps.closeSession(LAB, USER2);
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('$apresentacao — coleta → sessão → consolidação → SQLite', () => {
  it('mensagem com ≥2 sinais em grupo da comunidade com toggle on → registra em presentations', async () => {
    await wl.upsertCommunityGroup(LAB, ps.COMMUNITY_085_ID, 'Lab');
    await db.setGroupModField(LAB, 'presentation_enabled', 1);

    await ps.handlePresentationCollect({
      chatId: LAB, senderId: USER, messageId: 'm1',
      text: 'Oi gente! Tenho 30 anos e trabalho com TI',
      isFromMe: false,
    });

    // A coleta criou a sessão em memória:
    expect(ps.stats().activeSessions).toBe(1);

    // Consolida com idle 0 → persiste no SQLite (é aqui que o registro nasce):
    const consolidated = await ps.consolidateStale(0);
    expect(consolidated.length).toBe(1);
    expect(consolidated[0].record.group_id).toBe(LAB);
    expect(consolidated[0].record.user_id).toBe(USER);

    const conn: any = await (db as any).getDb();
    const rows: any[] = await conn.all(`SELECT * FROM presentations WHERE group_id = ?`, [LAB]);
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(USER);
    expect(rows[0].original_text).toContain('30 anos');
    expect(rows[0].status).toBe('consolidated');
    // sessão fechada após consolidar:
    expect(ps.stats().activeSessions).toBe(0);
  });

  it('toggle off → NÃO coleta (gate respeitado)', async () => {
    await wl.upsertCommunityGroup(LAB, ps.COMMUNITY_085_ID, 'Lab');
    await db.setGroupModField(LAB, 'presentation_enabled', 0);

    await ps.handlePresentationCollect({
      chatId: LAB, senderId: USER, messageId: 'm2',
      text: 'Tenho 30 anos e trabalho com TI',
      isFromMe: false,
    });

    expect(ps.stats().activeSessions).toBe(0);
    const consolidated = await ps.consolidateStale(0);
    expect(consolidated.length).toBe(0);
  });

  it('grupo fora da comunidade 085 → NÃO coleta', async () => {
    // (sem upsertCommunityGroup → não está na comunidade)
    await db.setGroupModField(LAB, 'presentation_enabled', 1);

    await ps.handlePresentationCollect({
      chatId: LAB, senderId: USER, messageId: 'm3',
      text: 'Tenho 30 anos e trabalho com TI',
      isFromMe: false,
    });

    expect(ps.stats().activeSessions).toBe(0);
  });

  it('mensagem sem sinais suficientes → NÃO abre sessão por sinal', async () => {
    await wl.upsertCommunityGroup(LAB, ps.COMMUNITY_085_ID, 'Lab');
    await db.setGroupModField(LAB, 'presentation_enabled', 1);

    await ps.handlePresentationCollect({
      chatId: LAB, senderId: USER, messageId: 'm4',
      text: 'bom dia galera', isFromMe: false,
    });

    expect(ps.stats().activeSessions).toBe(0);
  });

  it('reply ao welcome → abre sessão welcome_reply mesmo sem 2 sinais', async () => {
    await wl.upsertCommunityGroup(LAB, ps.COMMUNITY_085_ID, 'Lab');
    await db.setGroupModField(LAB, 'presentation_enabled', 1);

    // O gatilho casa pelo prefixo fixo do template (lição do welcome custom):
    const prefix = wl.DEFAULT_WELCOME.split(/[{@]/)[0].trim();
    await ps.handlePresentationCollect({
      chatId: LAB, senderId: USER, messageId: 'm5',
      text: 'Sou o João!', isFromMe: false,
      quotedText: prefix,
    });

    expect(ps.stats().activeSessions).toBe(1);
  });

  it('sinais insuficientes: 1 sinal só não abre sessão', async () => {
    await wl.upsertCommunityGroup(LAB, ps.COMMUNITY_085_ID, 'Lab');
    await db.setGroupModField(LAB, 'presentation_enabled', 1);

    await ps.handlePresentationCollect({
      chatId: LAB, senderId: USER, messageId: 'm6',
      text: 'tenho 25 anos', isFromMe: false,
    });

    expect(ps.stats().activeSessions).toBe(0);
  });

  it('shape REAL do BaileysNormalizer (userId/id, sem senderId/messageId) também abre a sessão', async () => {
    // O contrato do normalizador é `userId`/`id` — o coletor histórico lia
    // `senderId`/`messageId` e o gate `!senderId` engolia a mensagem em
    // silêncio total. Este caso prende o contrato real (regressão do E2E).
    await wl.upsertCommunityGroup(LAB, ps.COMMUNITY_085_ID, 'Lab');
    await db.setGroupModField(LAB, 'presentation_enabled', 1);

    // Nome na 1ª linha (heurística oficial: "primeira linha curta sem
    // cumprimento"); idade e trabalho na mesma mensagem → 2 sinais.
    await ps.handlePresentationCollect({
      id: 'whatsapp:558581344211:real-1',
      platform: 'whatsapp',
      chatId: LAB,
      userId: USER,
      text: 'João Silva\nTenho 30 anos e trabalho com informática',
      isFromMe: false,
    });

    const active = ps.getActiveSession(LAB, USER);
    expect(active).toBeTruthy();
    expect(active?.trigger).toBe('signals');

    const [entry] = await ps.consolidateStale(0);
    expect(entry?.record?.nome).toBe('João Silva');
    expect(entry?.record?.idade).toBe(30);
    expect(entry?.record?.trabalho).toBe('informática');
  });
});

// ─── P2 (23/10): abertura de sessão retorna contexto + persiste 'collecting' ─

describe('handlePresentationCollect — confirmação imediata (P2)', () => {
  beforeEach(async () => {
    await wl.upsertCommunityGroup(LAB, ps.COMMUNITY_085_ID, 'Lab');
    await db.setGroupModField(LAB, 'presentation_enabled', 1);
  });

  it('≥2 sinais → retorna opened(trigger=signals) + row collecting no SQLite NA HORA', async () => {
    const r = await ps.handlePresentationCollect({
      chatId: LAB, userId: USER, messageId: 'lab-c1', id: 'lab-c1',
      text: 'João Silva\nTenho 30 anos e trabalho com informática',
    });
    expect(r?.opened).toBe(true);
    expect(r?.trigger).toBe('signals');
    expect(r?.messageId).toBe('lab-c1');
    expect(r?.text).toContain('João Silva');

    // A row existe JÁ na abertura (sem esperar os 10min de consolidação)
    const conn: any = await (db as any).getDb();
    const row = await conn.get(
      `SELECT status, original_text, source_message_ids FROM presentations WHERE presentation_id = ?`,
      [`${LAB}|${USER}`],
    );
    expect(row.status).toBe('collecting');
    expect(row.original_text).toContain('João Silva');
    expect(row.source_message_ids).toContain('lab-c1');
  });

  it('reply ao AVISO do bot → abre com trigger=notice_reply', async () => {
    const aviso = wl.composePresentationMessage('');
    const r = await ps.handlePresentationCollect({
      chatId: LAB, userId: USER2, messageId: 'lab-c2', id: 'lab-c2',
      text: 'Maria Souza, 25 anos, trabalho com saúde',
      quotedText: aviso,
    });
    expect(r?.opened).toBe(true);
    expect(r?.trigger).toBe('notice_reply');
  });

  it('mensagem subsequente na sessão aberta → null (sem re-confirmar) e coleta', async () => {
    await ps.handlePresentationCollect({
      chatId: LAB, userId: USER, messageId: 'lab-c3', id: 'lab-c3',
      text: 'Tenho 30 anos e trabalho com informática',
    });
    const r2 = await ps.handlePresentationCollect({
      chatId: LAB, userId: USER, messageId: 'lab-c4', id: 'lab-c4',
      text: 'E moro no bairro Aldeota',
    });
    expect(r2).toBeNull();
    const s = ps.getActiveSession(LAB, USER);
    expect(s?.collectedTexts.some(t => t.includes('Aldeota'))).toBe(true);
  });

  it('toggle off → null e SEM row', async () => {
    await db.setGroupModField(LAB, 'presentation_enabled', 0);
    const r = await ps.handlePresentationCollect({
      chatId: LAB, userId: USER, messageId: 'lab-c5', id: 'lab-c5',
      text: 'Tenho 30 anos e trabalho com informática',
    });
    expect(r).toBeNull();
    const conn: any = await (db as any).getDb();
    const rows = await conn.all(`SELECT * FROM presentations`);
    expect(rows.length).toBe(0);
  });

  it('consolidação re-upserta a row collecting → consolidated (sem duplicar)', async () => {
    await ps.handlePresentationCollect({
      chatId: LAB, userId: USER, messageId: 'lab-c6', id: 'lab-c6',
      text: 'João Silva\nTenho 30 anos e trabalho com informática',
    });
    const [entry] = await ps.consolidateStale(0);
    expect(entry?.record?.status).toBe('consolidated');
    const conn: any = await (db as any).getDb();
    const rows = await conn.all(`SELECT * FROM presentations WHERE presentation_id = ?`, [`${LAB}|${USER}`]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('consolidated');
  });
});
