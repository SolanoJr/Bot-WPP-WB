/**
 * INTEGRAÇÃO — pipeline real do AutoMod.
 *
 * Exercita o engine REAL (`evaluate`) contra um SQLite REAL (arquivo temporário),
 * com a fronteira externa (socket/banco de infrações) mockada.
 *
 * Cobre os 19 cenários exigidos: texto, link, mídia, sticker, comando,
 * buttons/list/template/interactive/product, cassino, estrangeiro,
 * admin/MASTER/WarriorBlack/SolanoJr, audit_only ON/OFF.
 *
 * IMPORTANTE: nada aqui toca produção. O SQLite é temporário e o ctx é um
 * coletor de chamadas.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-pipeline-'));
process.env.BOT_DATA_DIR = TMP_DIR;

// ─── Mocks de fronteira externa ────────────────────────────────────────────
vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

const infractions: any[] = [];
vi.mock('../../src/services/infractions', () => ({
  recordInfraction: vi.fn(async (groupId: string, userId: string) => {
    infractions.push({ groupId, userId });
    return infractions.length;
  }),
}));

vi.mock('../../src/services/permissions', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual };
});

let db: typeof import('../../src/services/databaseService');
let engine: typeof import('../../src/services/autoModEngine');
let perms: typeof import('../../src/services/permissions');

const GRUPO = '120363410094452673@g.us';
const FIGURINHAS = '120363419033272638@g.us';

// Ids protegidos (lidos do ambiente do projeto)
const BOT_JID = '558581344211@s.whatsapp.net';
const MASTER_JID = '5588998314322@s.whatsapp.net';
const ADMIN_JID = '5599999999999@s.whatsapp.net';
const NORMAL_JID = '5511888888888@s.whatsapp.net';
const FOREIGN_JID = '6285822480546@s.whatsapp.net';   // +62
const FOREIGN_LID = '33471368028338@lid';

beforeAll(async () => {
  db = await import('../../src/services/databaseService');
  await db.initDatabase();
  engine = await import('../../src/services/autoModEngine');
  perms = await import('../../src/services/permissions');
});

afterAll(() => {
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** Constrói o ctx coletor — a ÚNICA parte mockada do pipeline. */
function makeCtx(opts: { admins?: string[]; superAdmins?: string[]; deleteThrows?: boolean } = {}) {
  const calls: Array<{ step: string; payload: any }> = [];
  const logs: string[] = [];
  const participants = [
    ...(opts.admins || []).map(id => ({ id, isAdmin: true, isSuperAdmin: false })),
    ...(opts.superAdmins || []).map(id => ({ id, isAdmin: true, isSuperAdmin: true })),
  ];
  const ctx = {
    log: (m: string) => logs.push(m),
    warn: (m: string, e?: any) => logs.push(`[WARN] ${m}`),
    getChat: async (gid: string) => ({
      id: gid, isGroup: true, name: 'Grupo Teste',
      participants, raw: { participants },
    }),
    removeParticipant: async (gid: string, uid: string) => {
      calls.push({ step: 'remove', payload: { groupId: gid, userId: uid } });
    },
    sendMessage: async (gid: string, text: string, options?: any) => {
      if (options?.delete) {
        if (opts.deleteThrows) throw new Error('delete falhou (simulado)');
        calls.push({ step: 'delete', payload: { groupId: gid, key: options.delete } });
        return;
      }
      calls.push({ step: 'announce', payload: { groupId: gid, text } });
    },
  };
  return { ctx, calls, logs };
}

function waMessage(opts: {
  message: any; participant?: string; participantAlt?: string;
  addressingMode?: string; fromMe?: boolean; pushName?: string; id?: string;
}) {
  return {
    key: {
      id: opts.id || 'MSG-' + Math.random().toString(36).slice(2, 10),
      remoteJid: GRUPO,
      fromMe: opts.fromMe ?? false,
      participant: opts.participant,
      participantAlt: opts.participantAlt,
      addressingMode: opts.addressingMode,
    },
    pushName: opts.pushName || '',
    message: opts.message,
    messageTimestamp: Math.floor(Date.now() / 1000),
  };
}

/** Configura o grupo no SQLite REAL. */
async function configurar(cfg: Record<string, boolean>, grupo = GRUPO) {
  await db.setGroupModAll(grupo, cfg as any);
}

/** Reseta as infrações registradas. */
function resetInfractions() { infractions.length = 0; }

describe('PIPELINE — 1-5. Mensagens legítimas NÃO são punidas', () => {
  it('1. texto normal → nada acontece', async () => {
    await configurar({ antibot: true, casino: true, remover: true, detectar: true });
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(waMessage({ message: { conversation: 'Bom dia pessoal!' } }), ctx as any, GRUPO, NORMAL_JID, 'João');
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove' || c.step === 'delete')).toEqual([]);
  });

  it('2. texto com link normal → nada acontece', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(waMessage({ message: { conversation: 'Olha o vídeo: https://youtube.com/watch?v=abc' } }), ctx as any, GRUPO, NORMAL_JID, 'João');
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });

  it('3. mídia normal → nada acontece', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(waMessage({ message: { imageMessage: { caption: 'Minha foto de viagem' } } }), ctx as any, GRUPO, NORMAL_JID, 'João');
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });

  it('4. STICKER normal → NÃO é tratado como bot', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(waMessage({ message: { stickerMessage: { mimetype: 'image/webp' } } }), ctx as any, GRUPO, NORMAL_JID, 'João');
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });

  it('5. comando normal ($ping) → nada acontece', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(waMessage({ message: { conversation: '$ping' } }), ctx as any, GRUPO, NORMAL_JID, 'João');
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });
});

describe('PIPELINE — 6-10. Estruturas de bot', () => {
  it('6. buttonsMessage SOZINHO → não bane (1 sinal estrutural)', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { buttonsMessage: { contentText: 'Escolha', buttons: [] } } }),
      ctx as any, GRUPO, NORMAL_JID, 'João',
    );
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });

  it('7-10. list/template/interactive/product SOZINHOS → não banem', async () => {
    const tipos = [
      { listMessage: { title: 'Menu', sections: [] } },
      { templateMessage: { hydratedTemplate: { hydratedContentText: 'T' } } },
      { interactiveMessage: { body: { text: 'I' } } },
      { productMessage: { product: { title: 'P' } } },
    ];
    for (const message of tipos) {
      resetInfractions();
      const { ctx, calls } = makeCtx();
      const r = await engine.evaluate(waMessage({ message }), ctx as any, GRUPO, NORMAL_JID, 'João');
      expect(r.acted).toBe(false);
      expect(calls.filter(c => c.step === 'remove')).toEqual([]);
    }
  });

  it('6b. buttonsMessage + DDI estrangeiro (participantAlt) → BANE (2 sinais)', async () => {
    await configurar({ antibot: true, casino: false, remover: true, detectar: true });
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({
        message: { buttonsMessage: { contentText: 'Promoção', buttons: [] } },
        participant: FOREIGN_LID,
        participantAlt: FOREIGN_JID,
        addressingMode: 'lid',
      }),
      ctx as any, GRUPO, FOREIGN_LID, 'Daniel',
    );
    expect(r.acted).toBe(true);
    expect(calls.some(c => c.step === 'remove')).toBe(true);
    expect(calls.some(c => c.step === 'delete')).toBe(true);
    expect(infractions.length).toBeGreaterThan(0);
  });
});

describe('PIPELINE — 11-13. Cassino e independência de nacionalidade', () => {
  it('11. cassino (domínio + keywords) → detecta e pune', async () => {
    await configurar({ casino: true, antibot: false, remover: true, detectar: true });
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { extendedTextMessage: { text: 'Taxa de vitórias 98%! Recolha contínua 777-7777 bônus https://kl7.games/?c=10103' } } }),
      ctx as any, GRUPO, NORMAL_JID, 'Promoter',
    );
    expect(r.acted).toBe(true);
    expect(calls.some(c => c.step === 'delete')).toBe(true);
    expect(calls.some(c => c.step === 'remove')).toBe(true);
    expect(infractions.length).toBeGreaterThan(0);
    expect(calls.some(c => c.step === 'announce')).toBe(true);
  });

  it('12. cassino com remetente BRASILEIRO → também detecta (não depende de nacionalidade)', async () => {
    await configurar({ casino: true, antibot: false, remover: true, detectar: true });
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { extendedTextMessage: { text: 'Taxa de vitórias 98%! Recolha contínua 777-7777 bônus https://kl7.games/?c=10103' } } }),
      ctx as any, GRUPO, NORMAL_JID, 'Promoter BR',
    );
    expect(r.acted).toBe(true);
    expect(calls.some(c => c.step === 'remove')).toBe(true);
  });

  it('13. ESTRANGEIRO sem conteúdo de cassino → NÃO é punido (independência)', async () => {
    await configurar({ casino: true, antibot: false, antiestrangeiro: false, remover: true, detectar: true });
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({
        message: { conversation: 'Oi pessoal, tudo bem? Sou de Portugal.' },
        participant: FOREIGN_LID, participantAlt: FOREIGN_JID, addressingMode: 'lid',
      }),
      ctx as any, GRUPO, FOREIGN_LID, 'Estrangeiro',
    );
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });
});

describe('PIPELINE — 14-17. Proteções (admin/MASTER/bot/dono)', () => {
  const estrutural = () => ({ buttonsMessage: { contentText: 'Promo', buttons: [] } });

  it('14. ADMIN do grupo com estrutura + estrangeiro → NÃO é punido', async () => {
    await configurar({ antibot: true, casino: true, remover: true, detectar: true });
    resetInfractions();
    const { ctx, calls } = makeCtx({ admins: [ADMIN_JID] });
    const r = await engine.evaluate(
      waMessage({ message: estrutural(), participant: ADMIN_JID, participantAlt: FOREIGN_JID, addressingMode: 'lid' }),
      ctx as any, GRUPO, ADMIN_JID, 'Admin',
    );
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });

  it('15. SUPERADMIN com estrutura → NÃO é punido', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx({ superAdmins: [ADMIN_JID] });
    const r = await engine.evaluate(
      waMessage({ message: estrutural(), participant: ADMIN_JID, participantAlt: FOREIGN_JID, addressingMode: 'lid' }),
      ctx as any, GRUPO, ADMIN_JID, 'SuperAdmin',
    );
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });

  it('16. WarriorBlack (bot) → NÃO é punido', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: estrutural(), participant: BOT_JID, participantAlt: FOREIGN_JID, addressingMode: 'lid' }),
      ctx as any, GRUPO, BOT_JID, 'WarriorBlack',
    );
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });

  it('17. SolanoJr (MASTER) → NÃO é punido', async () => {
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: estrutural(), participant: MASTER_JID, participantAlt: FOREIGN_JID, addressingMode: 'lid' }),
      ctx as any, GRUPO, MASTER_JID, 'SolanoJr',
    );
    expect(r.acted).toBe(false);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
  });
});

describe('PIPELINE — 18-19. audit_only ON / OFF', () => {
  it('18. audit_only=1 → detecta e loga, mas NÃO apaga/banir/remover', async () => {
    await configurar({ casino: true, antibot: false, remover: true, detectar: true, audit_only: true });
    resetInfractions();
    const { ctx, calls, logs } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { extendedTextMessage: { text: 'Taxa de vitórias 98%! Recolha contínua 777-7777 https://kl7.games/?c=10103' } } }),
      ctx as any, GRUPO, NORMAL_JID, 'Promoter',
    );
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('audit-only');
    expect(calls.filter(c => c.step === 'delete')).toEqual([]);
    expect(calls.filter(c => c.step === 'remove')).toEqual([]);
    expect(calls.filter(c => c.step === 'announce')).toEqual([]);
    expect(infractions.length).toBe(0);           // NÃO registra punição efetivada
    expect(logs.some(l => l.includes('AUDIT-ONLY'))).toBe(true);  // MAS registra a detecção
  });

  it('19. audit_only=0 → mesma mensagem executa TODAS as ações', async () => {
    await configurar({ casino: true, antibot: false, remover: true, detectar: true, audit_only: false });
    resetInfractions();
    const { ctx, calls } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { extendedTextMessage: { text: 'Taxa de vitórias 98%! Recolha contínua 777-7777 https://kl7.games/?c=10103' } } }),
      ctx as any, GRUPO, NORMAL_JID, 'Promoter',
    );
    expect(r.acted).toBe(true);
    expect(calls.some(c => c.step === 'delete')).toBe(true);
    expect(calls.some(c => c.step === 'remove')).toBe(true);
    expect(calls.some(c => c.step === 'announce')).toBe(true);
    expect(infractions.length).toBeGreaterThan(0);
  });
});

describe('PIPELINE — AntiBot/Casino independentes de AntiEstrangeiro', () => {
  it('antibot funciona com antiestrangeiro=0', async () => {
    await configurar({ antibot: true, casino: false, antiestrangeiro: false, remover: true, detectar: true });
    resetInfractions();
    const { ctx } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { buttonsMessage: { contentText: 'X', buttons: [] } }, participant: FOREIGN_LID, participantAlt: FOREIGN_JID, addressingMode: 'lid' }),
      ctx as any, GRUPO, FOREIGN_LID, 'Bot',
    );
    expect(r.acted).toBe(true);
  });

  it('casino funciona com antiestrangeiro=0', async () => {
    await configurar({ casino: true, antibot: false, antiestrangeiro: false, remover: true, detectar: true });
    resetInfractions();
    const { ctx } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { extendedTextMessage: { text: 'Taxa de vitórias 98%! 777-7777 https://kl7.games/?c=10103' } } }),
      ctx as any, GRUPO, NORMAL_JID, 'X',
    );
    expect(r.acted).toBe(true);
  });

  it('nada ligado → engine ignora (nada ligado)', async () => {
    await db.setGroupModAll('120363477777777777@g.us', {
      antibot: false, casino: false, antispam: false, antiestrangeiro: false,
      autolink: false, remover: false, detectar: false,
    } as any);
    const { ctx } = makeCtx();
    const r = await engine.evaluate(
      waMessage({ message: { extendedTextMessage: { text: 'Taxa de vitórias 98% 777-7777 https://kl7.games/' } } }),
      ctx as any, '120363477777777777@g.us', NORMAL_JID, 'X',
    );
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('nada ligado');
  });
});

describe('PIPELINE — delete usa a WAMessageKey COMPLETA', () => {
  it('a key enviada ao delete contém participant + participantAlt + addressingMode', async () => {
    await configurar({ casino: true, remover: true, detectar: true, audit_only: false });
    resetInfractions();
    const { ctx, calls } = makeCtx();
    await engine.evaluate(
      waMessage({
        message: { extendedTextMessage: { text: 'Taxa de vitórias 98%! 777-7777 https://kl7.games/?c=10103' } },
        participant: FOREIGN_LID, participantAlt: FOREIGN_JID, addressingMode: 'lid',
      }),
      ctx as any, GRUPO, FOREIGN_LID, 'Promoter',
    );
    const del = calls.find(c => c.step === 'delete');
    expect(del).toBeDefined();
    expect(del!.payload.key.participant).toBe(FOREIGN_LID);
    expect(del!.payload.key.participantAlt).toBe(FOREIGN_JID);
    expect(del!.payload.key.addressingMode).toBe('lid');
    expect(del!.payload.key.remoteJid).toBe(GRUPO);
  });

  it('falha no delete não impede o ban/remove (e é logada)', async () => {
    await configurar({ casino: true, remover: true, detectar: true, audit_only: false });
    resetInfractions();
    const { ctx, calls } = makeCtx({ deleteThrows: true });
    const r = await engine.evaluate(
      waMessage({ message: { extendedTextMessage: { text: 'Taxa de vitórias 98%! 777-7777 https://kl7.games/?c=10103' } } }),
      ctx as any, GRUPO, NORMAL_JID, 'Promoter',
    );
    expect(r.acted).toBe(true);
    expect(calls.some(c => c.step === 'remove')).toBe(true);  // remove aconteceu
  });
});
