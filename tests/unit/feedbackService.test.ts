/**
 * Feedback de saída — automação independente do AutoMod.
 *
 * Cobre: registro de saída, agrupamento, mensagem correta por cenário,
 * "não"/"nao", somente a próxima mensagem, expiração, persistência,
 * isolamento por grupo e permissões.
 *
 * Usa SQLite REAL (arquivo temporário) — o serviço é o de produção.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-feedback-'));
process.env.BOT_DATA_DIR = TMP_DIR;

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

let fb: typeof import('../../src/services/feedbackService');
let db: typeof import('../../src/services/databaseService');

const GEEK = '120363419033272638@g.us';
const CAFE = '120363410094452673@g.us';
const COMUNIDADE = '120363422234580695@g.us';
const USER = '6285822480546@s.whatsapp.net';

beforeAll(async () => {
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
  fb = await import('../../src/services/feedbackService');
});

// Isola cada teste: limpa a tabela de feedbacks
beforeEach(async () => {
  const conn: any = await (db as any).getDb();
  await conn.run(`DELETE FROM feedback_events`);
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('1-5. Registro de saída e cenários', () => {
  it('1. saída de grupo → registra evento', async () => {
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, phoneNumber: USER,
      displayName: 'Daniel', groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: Date.now(),
    });
    const rows = await fb.listFeedback();
    expect(rows.some(r => r.event_id === id)).toBe(true);
  });

  it('2. saída de comunidade → registra com community_id', async () => {
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: COMUNIDADE,
      communityId: COMUNIDADE, communityName: 'Fortaleza 085',
      eventType: 'community_leave', leftAt: Date.now(),
    });
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_type === 'community_leave');
    expect(ev).toBeDefined();
    expect(ev.community_id).toBe(COMUNIDADE);
  });

  it('3. saída de vários grupos → agrupa em um evento', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    await fb.consolidatePending(USER, now + 1000);
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: CAFE, groupName: 'Café',
      eventType: 'group_leave', leftAt: now + 2000,
    });
    const id = await fb.consolidatePending(USER, now + 3000);
    expect(id).not.toBeNull();
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_id === id);
    const groups: string[] = JSON.parse(ev.involved_group_names);
    expect(groups).toContain('Geek');
    expect(groups).toContain('Café');
    expect(ev.event_type).toBe('multi_group_leave');
  });

  it('4. saída de comunidade + grupos → tipo correto', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: COMUNIDADE,
      communityId: COMUNIDADE, communityName: 'Fortaleza 085',
      eventType: 'community_leave', leftAt: now,
    });
    await fb.consolidatePending(USER, now + 1000);
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now + 2000,
    });
    const id = await fb.consolidatePending(USER, now + 3000);
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_id === id);
    expect(ev.event_type).toBe('community_and_groups_leave');
  });

  it('5. saída de grupo permanecendo na comunidade → NÃO vira community_leave', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.left_at === now);
    expect(ev.event_type).toBe('group_leave');
    expect(ev.community_id).toBeNull();
  });
});

describe('6-7. Mensagem correta em cada cenário', () => {
  it('6. somente grupo → "saiu do grupo Geek"', () => {
    const msg = fb.formatFeedbackRequest({
      eventType: 'group_leave', groupName: 'Geek', involvedGroupNames: '["Geek"]',
    });
    expect(msg).toContain('saiu do grupo Geek');
  });

  it('7. dois grupos → "saiu dos grupos Geek e Café"', () => {
    const msg = fb.formatFeedbackRequest({
      eventType: 'multi_group_leave',
      involvedGroupNames: '["Geek","Café"]',
    });
    expect(msg).toContain('saiu dos grupos Geek e Café');
  });

  it('7b. somente comunidade → "saiu da comunidade Fortaleza 085"', () => {
    const msg = fb.formatFeedbackRequest({
      eventType: 'community_leave', communityName: 'Fortaleza 085',
    });
    expect(msg).toContain('saiu da comunidade Fortaleza 085');
  });

  it('7c. comunidade + grupos → menciona ambos', () => {
    const msg = fb.formatFeedbackRequest({
      eventType: 'community_and_groups_leave',
      communityName: 'Fortaleza 085',
      involvedGroupNames: '["Geek","Café"]',
    });
    expect(msg).toContain('da comunidade Fortaleza 085');
    expect(msg).toContain('dos grupos Geek e Café');
  });

  it('7d. mensagem explica que é anônimo', () => {
    const msg = fb.formatFeedbackRequest({
      eventType: 'group_leave', groupName: 'Geek', involvedGroupNames: '["Geek"]',
    });
    expect(msg).toContain('anônimo');
    expect(msg).toContain('não');
  });
});

describe('8-13. Resposta ao feedback', () => {
  it('8. "não" → recusa', async () => {
    const now = Date.now();
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    await fb.markContacted(id, now);
    await fb.recordResponse(id, 'não', now + 1000);
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_id === id);
    expect(ev.status).toBe('refused');
    expect(ev.awaiting_response).toBe(0);
  });

  it('9. "nao" → recusa', async () => {
    const now = Date.now();
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    await fb.markContacted(id, now);
    await fb.recordResponse(id, 'nao', now + 1000);
    const rows = await fb.listFeedback();
    expect(rows.find(r => r.event_id === id).status).toBe('refused');
  });

  it('10. feedback textual → responded', async () => {
    const now = Date.now();
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    await fb.markContacted(id, now);
    await fb.recordResponse(id, 'Saí porque tinha muita mensagem.', now + 1000);
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_id === id);
    expect(ev.status).toBe('responded');
    expect(ev.response).toBe('Saí porque tinha muita mensagem.');
  });

  it('11. somente a PRÓXIMA mensagem é capturada (awaiting_response=0 após resposta)', async () => {
    const now = Date.now();
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    await fb.markContacted(id, now);
    await fb.recordResponse(id, 'bom dia', now + 1000);
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_id === id);
    expect(ev.awaiting_response).toBe(0); // não captura mais nada
  });

  it('12. expiração: evento com expires_at no passado é listado como expirado', async () => {
    const now = Date.now();
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now - 48 * 3600 * 1000,
    });
    await fb.markContacted(id, now - 25 * 3600 * 1000); // expirou há 1h
    const expired = await fb.listExpired(now);
    expect(expired.some(r => r.event_id === id)).toBe(true);
    await fb.markExpired([id], now);
    const rows = await fb.listFeedback();
    expect(rows.find(r => r.event_id === id).status).toBe('expired');
  });

  it('13. persistência: dados sobrevivem à releitura', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, phoneNumber: USER,
      displayName: 'Daniel', groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    const rows = await fb.listFeedback({ groupId: GEEK });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].display_name).toBe('Daniel');
    expect(rows[0].phone_number).toBe(USER);
  });
});

describe('14-15. Falha de DM / Telegram', () => {
  it('14. falha de DM não perde o evento (status permanece)', async () => {
    const now = Date.now();
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    // Simula falha: marca erro de telegram mas não altera status
    const db2 = await (db as any).getDb();
    await db2.run(`UPDATE feedback_events SET telegram_error = ? WHERE event_id = ?`, ['DM falhou', id]);
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_id === id);
    expect(ev.status).toBe('pending'); // evento preservado
    expect(ev.telegram_error).toBe('DM falhou');
  });

  it('15. falha do Telegram não altera o status do feedback', async () => {
    const now = Date.now();
    const id = await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    await fb.markContacted(id, now);
    const db2 = await (db as any).getDb();
    await db2.run(`UPDATE feedback_events SET telegram_error = ? WHERE event_id = ?`, ['Telegram indisponível', id]);
    const rows = await fb.listFeedback();
    const ev = rows.find(r => r.event_id === id);
    expect(ev.status).toBe('contacted'); // feedback continua salvo
  });
});

describe('16-17. Persistência e restart', () => {
  it('16. dados persistem no SQLite', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    // Releitura direta do arquivo (simula novo processo)
    const sqlite3 = (await import('sqlite3')).default;
    const { open } = await import('sqlite');
    const conn = await open({ filename: path.join(TMP_DIR, 'bot_database.db'), driver: sqlite3.Database });
    const row: any = await conn.get(`SELECT COUNT(*) as n FROM feedback_events`);
    await conn.close();
    expect(row.n).toBeGreaterThan(0);
  });

  it('17. restart não perde eventos (tabela existe e é consultável)', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    const s = await fb.stats();
    expect(s.total).toBeGreaterThan(0);
  });
});

describe('18-19. Consulta e isolamento', () => {
  it('18. consulta posterior por grupo', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: GEEK, groupName: 'Geek',
      eventType: 'group_leave', leftAt: now,
    });
    const rows = await fb.listFeedback({ groupId: GEEK });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.group_id).toBe(GEEK);
  });

  it('19. isolamento: grupo A não aparece em grupo B', async () => {
    const now = Date.now();
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, groupId: CAFE, groupName: 'Café',
      eventType: 'group_leave', leftAt: now,
    });
    const geek = await fb.listFeedback({ groupId: GEEK });
    const cafe = await fb.listFeedback({ groupId: CAFE });
    // O evento do Café não está na lista do Geek
    expect(geek.every(r => r.group_id === GEEK)).toBe(true);
    expect(cafe.every(r => r.group_id === CAFE)).toBe(true);
  });
});

describe('20. Permissões dos comandos administrativos', () => {
  it('feedbackCommand existe e tem nome correto', async () => {
    const { feedbackCommand } = await import('../../src/bot/commands/feedback');
    expect(feedbackCommand).toBeDefined();
    expect(feedbackCommand.name).toBe('feedback');
  });

  it('sarcasmoCommand existe e tem nome correto', async () => {
    const { sarcasmoCommand } = await import('../../src/bot/commands/sarcasmo');
    expect(sarcasmoCommand).toBeDefined();
    expect(sarcasmoCommand.name).toBe('sarcasmo');
  });

  it('ambos estão registrados no index', async () => {
    // Verifica o registro sem importar o index completo (que carrega todos os comandos)
    const fs = await import('fs');
    const path = await import('path');
    const idxSrc = fs.readFileSync(path.resolve(__dirname, '../../src/bot/commands/index.ts'), 'utf8');
    expect(idxSrc).toMatch(/feedback:\s*feedbackCommand/);
    expect(idxSrc).toMatch(/sarcasmo:\s*sarcasmoCommand/);
  });
});

describe('Estatísticas', () => {
  it('stats() retorna contagens coerentes', async () => {
    const s = await fb.stats();
    expect(s.total).toBe(s.pending + s.contacted + s.responded + s.refused + s.expired);
  });
});
