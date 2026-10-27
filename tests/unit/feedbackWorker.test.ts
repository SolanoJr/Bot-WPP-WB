/**
 * INC-016 B — worker de envio de feedback.
 *
 * Prova o ciclo que antes não existia: pending → PV → contacted →
 * responded|refused|expired, com os limites anti-spam:
 * máx 10 PVs/execução, cooldown 30d/usuário, expiração de pendings velhos
 * e sweep de contacted sem resposta.
 *
 * Usa SQLite REAL (arquivo temporário) — o serviço é o de produção.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-fbworker-'));
process.env.BOT_DATA_DIR = TMP_DIR;

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

let fb: typeof import('../../src/services/feedbackService');
let wk: typeof import('../../src/services/feedbackWorker');
let db: typeof import('../../src/services/databaseService');

const GEEK = '120363419033272638@g.us';
const USER = '6285822480546@s.whatsapp.net';
const USER2 = '6285822480547@s.whatsapp.net';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

let now = 0;

beforeAll(async () => {
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
  fb = await import('../../src/services/feedbackService');
  wk = await import('../../src/services/feedbackWorker');
});

beforeEach(async () => {
  const conn: any = await (db as any).getDb();
  await conn.run(`DELETE FROM feedback_events`);
  now = Date.now();
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** Cria um pending "pronto para envio" (saiu há 1h — fora da janela de agrupamento). */
async function seedPending(userId: string, groupId = GEEK, leftAt = now - HOUR) {
  // O worker respeita o toggle do grupo também no ENVIO (INC-016 B):
  await db.setGroupModField(groupId, 'feedback', true);
  return fb.recordExitEvent({
    platform: 'whatsapp', userId, phoneNumber: userId,
    displayName: 'Fulano', groupId, groupName: 'Geek',
    eventType: 'group_leave', leftAt,
  });
}

describe('INC-016 B — worker de envio', () => {
  it('pending pronto → envia PV e marca contacted', async () => {
    const id = await seedPending(USER);
    const sent: Array<{ userId: string; text: string }> = [];
    const stats = await wk.runFeedbackWorker(async (userId, text) => {
      sent.push({ userId, text });
      return true;
    }, now);
    expect(stats.sent).toBe(1);
    expect(sent[0].userId).toBe(USER);
    expect(sent[0].text).toContain('Geek');
    expect(sent[0].text).toContain('anônimo');
    const ev = (await fb.listFeedback()).find((r: any) => r.event_id === id);
    expect(ev?.status).toBe('contacted');
  });

  it('envio falha → permanece pending (retentativa)', async () => {
    const id = await seedPending(USER);
    const stats = await wk.runFeedbackWorker(async () => false, now);
    expect(stats.failed).toBe(1);
    const ev = (await fb.listFeedback()).find((r: any) => r.event_id === id);
    expect(ev?.status).toBe('pending');
  });

  it('saída recente (dentro da janela de agrupamento) → adia', async () => {
    await seedPending(USER, GEEK, now - 2 * MIN);
    const stats = await wk.runFeedbackWorker(async () => true, now);
    expect(stats.young).toBe(1);
    expect(stats.sent).toBe(0);
  });

  it('cooldown de 30 dias: usuário contatado há pouco → NÃO re-PV', async () => {
    await seedPending(USER, GEEK, now - 1 * DAY);
    // já foi contatado há 5 dias (respondido)
    const idOld = await seedPending(USER, GEEK, now - 6 * DAY);
    await fb.markContacted(idOld, now - 5 * DAY);
    await fb.recordResponse(idOld, 'grupo bom', now - 4 * DAY);
    const stats = await wk.runFeedbackWorker(async () => true, now);
    expect(stats.cooldown).toBe(1);
    expect(stats.sent).toBe(0);
  });

  it('pending mais velho que 7 dias → expira sem contato', async () => {
    await seedPending(USER, GEEK, now - 8 * DAY);
    const stats = await wk.runFeedbackWorker(async () => true, now);
    expect(stats.tooOld).toBe(1);
    expect(stats.sent).toBe(0);
    const rows = await fb.listFeedback();
    expect(rows[0]?.status).toBe('expired');
  });

  it('contacted sem resposta além do prazo → sweep marca expired', async () => {
    const id = await seedPending(USER, GEEK, now - 9 * DAY);
    await fb.markContacted(id, now - 8 * DAY); // expires_at = -8d + EXPIRY_MS (7d) = -1d < now
    const stats = await wk.runFeedbackWorker(async () => true, now);
    expect(stats.expiredSweep).toBe(1);
    const ev = (await fb.listFeedback()).find((r: any) => r.event_id === id);
    expect(ev?.status).toBe('expired');
  });

  it('cap anti-spam: 12 pendings → máx 10 PVs, resto adiado', async () => {
    const users = Array.from({ length: 12 }, (_, i) => `555${i}@s.whatsapp.net`);
    for (const u of users) await seedPending(u);
    const stats = await wk.runFeedbackWorker(async () => true, now);
    expect(stats.sent).toBe(10);
    expect(stats.deferred).toBe(2);
  });

  it('fluxo completo: pending → PV → resposta do usuário → responded', async () => {
    const id = await seedPending(USER);
    await wk.runFeedbackWorker(async () => true, now);
    // o listener do normalizer usa getAwaitingFeedback + recordResponse:
    const awaiting = await fb.getAwaitingFeedback(USER, now);
    expect(awaiting).not.toBeNull();
    expect(awaiting.event_id).toBe(id);
    await fb.recordResponse(id, 'Saí porque o horário não batia', now);
    const ev = (await fb.listFeedback()).find((r: any) => r.event_id === id);
    expect(ev?.status).toBe('responded');
    // depois de respondido, não há mais pedido em aberto
    expect(await fb.getAwaitingFeedback(USER, now)).toBeNull();
  });

  it('recusa: resposta "não" → refused (não contatado de novo)', async () => {
    const id = await seedPending(USER);
    await fb.markContacted(id, now);
    await fb.recordResponse(id, 'não', now);
    const ev = (await fb.listFeedback()).find((r: any) => r.event_id === id);
    expect(ev?.status).toBe('refused');
  });

  it('usuários independentes: PV de um não bloqueia o outro', async () => {
    await seedPending(USER);
    await seedPending(USER2);
    const targets: string[] = [];
    const stats = await wk.runFeedbackWorker(async (userId) => {
      targets.push(userId);
      return true;
    }, now);
    expect(stats.sent).toBe(2);
    expect(targets).toContain(USER);
    expect(targets).toContain(USER2);
  });

  it('política do grupo: evento de grupo SEM $feedback on → expira (sem PV retroativo)', async () => {
    const OTHER = '120363499999999999@g.us';
    await db.setGroupModField(OTHER, 'feedback', false);
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: USER, phoneNumber: USER,
      groupId: OTHER, groupName: 'Outro', eventType: 'group_leave', leftAt: now - HOUR,
    });
    const stats = await wk.runFeedbackWorker(async () => true, now);
    expect(stats.policy).toBe(1);
    expect(stats.sent).toBe(0);
    const rows = await fb.listFeedback();
    expect(rows[0]?.status).toBe('expired');
  });

  it('inacessível: usuário só com @lid (sem PN) → expira sem tentar PV', async () => {
    await fb.recordExitEvent({
      platform: 'whatsapp', userId: '1234567890@lid', phoneNumber: undefined,
      groupId: GEEK, groupName: 'Geek', eventType: 'group_leave', leftAt: now - HOUR,
    });
    const stats = await wk.runFeedbackWorker(async () => {
      throw new Error('não deveria chamar send para @lid');
    }, now);
    expect(stats.unreachable).toBe(1);
    expect(stats.sent).toBe(0);
    const rows = await fb.listFeedback();
    expect(rows[0]?.status).toBe('expired');
  });

  it('cap de tentativas: 3 falhas de envio → expira (não retenta para sempre)', async () => {
    await seedPending(USER);
    let attempts = 0;
    // execução 1 e 2: falham (attempts 1, 2)
    await wk.runFeedbackWorker(async () => false, now);
    await wk.runFeedbackWorker(async () => false, now + HOUR);
    // execução 3: falha de novo → attempts 3 → expired na hora
    const stats = await wk.runFeedbackWorker(async () => false, now + 2 * HOUR);
    expect(stats.failed).toBe(1);
    expect(stats.attemptsCap).toBe(1);
    const ev = (await fb.listFeedback())[0];
    expect(ev?.status).toBe('expired');
    expect(ev?.attempts).toBe(3);
  });
});

// ─── P3/P4 (23/10): o send registrado fica exposto p/ /lab/run-feedback-worker
describe('probe registrado p/ /lab/run-feedback-worker', () => {
  it('startFeedbackWorker registra o send; getRegisteredFeedbackSend devolve a MESMA fn', async () => {
    const { startFeedbackWorker, getRegisteredFeedbackSend } = await import('../../src/services/feedbackWorker');
    const fn = async (_u: string, _t: string) => true;
    const timer = startFeedbackWorker(fn, 60 * 60 * 1000);
    expect(getRegisteredFeedbackSend()).toBe(fn);
    if (timer) clearTimeout(timer as any);
  });

  it('worker nunca iniciado (módulo fresh) → null', async () => {
    vi.resetModules();
    const { getRegisteredFeedbackSend } = await import('../../src/services/feedbackWorker');
    expect(getRegisteredFeedbackSend()).toBeNull();
  });
});

// ─── INC-024: worker multi-plataforma (Telegram/Discord) ───────────────────
describe('INC-024 — worker multi-plataforma', () => {
  const TG_GROUP = 'tg:-100123456';
  const DC_GROUP = 'dc:999888777666';

  /** Seed de leave não-WhatsApp: user_id sem sufixo @s.whatsapp.net. */
  async function seedLeave(platform: string, userId: string, groupId: string, groupName: string) {
    await db.setGroupModField(groupId, 'feedback', true);
    return fb.recordExitEvent({
      platform, userId, phoneNumber: undefined,
      displayName: 'Usuário ' + platform, groupId, groupName,
      eventType: 'group_leave', leftAt: now - HOUR,
    });
  }

  it('evento telegram: user_id numérico NÃO expira unreachable e usa o send da plataforma', async () => {
    await seedLeave('telegram', '111222333', TG_GROUP, 'Grupo TG');
    const tgSent: string[] = [];
    wk.registerFeedbackSend('telegram', async (userId) => { tgSent.push(userId); return true; });
    const fallback = vi.fn(async () => { throw new Error('fallback não deveria ser chamado'); });
    const stats = await wk.runFeedbackWorker(fallback as any, now);
    expect(stats.unreachable).toBe(0);
    expect(stats.sent).toBe(1);
    expect(tgSent).toEqual(['111222333']);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('evento discord: snowflake sem PN usa o send da plataforma', async () => {
    await seedLeave('discord', '444555666777888', DC_GROUP, 'Guild DC');
    const dcSent: string[] = [];
    wk.registerFeedbackSend('discord', async (userId) => { dcSent.push(userId); return true; });
    const stats = await wk.runFeedbackWorker(async () => false, now);
    expect(stats.unreachable).toBe(0);
    expect(stats.sent).toBe(1);
    expect(dcSent).toEqual(['444555666777888']);
  });

  it('DM da plataforma falha (403/DMs fechadas) → failed + attempts, evento permanece', async () => {
    await seedLeave('telegram', '777888999', 'tg:-100999', 'Grupo TG 2');
    wk.registerFeedbackSend('telegram', async () => { throw new Error('403 Forbidden'); });
    const stats = await wk.runFeedbackWorker(async () => false, now);
    expect(stats.failed).toBe(1);
    expect(stats.sent).toBe(0);
  });

  it('plataforma SEM send registrado → cai no send injetado (fallback /lab)', async () => {
    await seedLeave('slack', 'U123ABC', 'slack:C1', 'Canal Slack');
    const injected: string[] = [];
    const stats = await wk.runFeedbackWorker(async (userId) => { injected.push(userId); return true; }, now);
    expect(stats.sent).toBe(1);
    expect(injected).toEqual(['U123ABC']);
  });

  it('registry: getRegisteredFeedbackSend por plataforma e default retrocompat', () => {
    const fn = async () => true;
    wk.registerFeedbackSend('whatsapp', fn);
    expect(wk.getRegisteredFeedbackSend('whatsapp')).toBe(fn);
    expect(wk.getRegisteredFeedbackSend()).toBe(fn);
    expect(wk.getRegisteredFeedbackSend('plataforma-que-nao-existe')).toBeNull();
  });
});
