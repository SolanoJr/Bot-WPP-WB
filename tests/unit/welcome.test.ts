/**
 * Testes do welcome configurável por grupo + listener de entrada de membros.
 *
 * Cobre o Problema 1: o evento `group-participants.update` não existia e o
 * `memberJoinService` era código morto. Agora o fluxo é:
 *   Baileys → BaileysConnection → BaileysAdapter → memberJoinService → welcome
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock do databaseService (config do grupo + ban) ───
const store = {
  mod: new Map<string, any>(),
  bans: new Set<string>(),
  joins: [] as any[],
};

vi.mock('../../src/services/databaseService', () => ({
  getGroupMod: vi.fn(async (groupId: string) => store.mod.get(groupId) || {}),
  isUserBanned: vi.fn(async (g: string, u: string) => store.bans.has(`${g}|${u}`)),
  banUser: vi.fn(async () => {}),
  recordMemberJoin: vi.fn(async (g: string, u: string) => { store.joins.push({ g, u }); }),
  recordMemberRemove: vi.fn(async () => {}),
}));

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

// welcomeService usa getDb() — mockamos só as duas funções usadas pelo fluxo
const welcomeStore = new Map<string, string | null>();
vi.mock('../../src/services/welcomeService', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getWelcomeMessage: vi.fn(async (g: string) => welcomeStore.get(g) ?? null),
    setWelcomeMessage: vi.fn(async (g: string, t: string | null) => { welcomeStore.set(g, t); }),
    resolveWelcome: vi.fn(async (g: string, ctx: any) => {
      const custom = welcomeStore.get(g) ?? null;
      const template = custom ?? actual.DEFAULT_WELCOME;
      return { text: actual.renderWelcome(template, ctx), isDefault: custom === null };
    }),
  };
});

const GRUPO_A = '120363419033272638@g.us';
const GRUPO_B = '120363410094452673@g.us';

async function loadService() {
  vi.resetModules();
  return await import('../../src/services/memberJoinService');
}

function makeCtx() {
  const sent: Array<{ groupId: string; text: string; mentions?: string[] }> = [];
  const removed: string[] = [];
  return {
    sent, removed,
    removeParticipant: vi.fn(async (g: string, u: string) => { removed.push(u); }),
    sendMessage: vi.fn(async (g: string, t: string, m?: string[]) => { sent.push({ groupId: g, text: t, mentions: m }); }),
    resolveGroupName: vi.fn(async () => 'Figurinhas/Stickers'),
  };
}

beforeEach(() => {
  store.mod.clear();
  store.bans.clear();
  store.joins.length = 0;
  welcomeStore.clear();
});

describe('welcome — padrão do sistema', () => {
  it('3. o welcome padrão é EXATAMENTE "Bem-vindo @novato 👋"', async () => {
    const { DEFAULT_WELCOME } = await import('../../src/services/welcomeService');
    expect(DEFAULT_WELCOME).toBe('Bem-vindo @novato 👋');
  });

  it('2. novo membro com bemvindo=1 recebe o welcome padrão', async () => {
    const { handleMemberJoin } = await loadService();
    store.mod.set(GRUPO_A, { bemvindo: true });
    const ctx = makeCtx();

    await handleMemberJoin(ctx as any, { groupId: GRUPO_A, members: [{ id: '6285822480546@s.whatsapp.net', name: 'Daniel' }] });

    expect(ctx.sent.length).toBe(1);
    expect(ctx.sent[0].text).toBe('Bem-vindo @novato 👋');
  });

  it('4. welcome OFF (bemvindo=0) NÃO envia nada', async () => {
    const { handleMemberJoin } = await loadService();
    store.mod.set(GRUPO_A, { bemvindo: false });
    const ctx = makeCtx();

    await handleMemberJoin(ctx as any, { groupId: GRUPO_A, members: [{ id: '6285822480546@s.whatsapp.net' }] });

    expect(ctx.sent.length).toBe(0);
  });

  it('1. o membro é registrado na entrada (recordMemberJoin)', async () => {
    const { handleMemberJoin } = await loadService();
    store.mod.set(GRUPO_A, { bemvindo: true });
    const ctx = makeCtx();

    await handleMemberJoin(ctx as any, { groupId: GRUPO_A, members: [{ id: '6285822480546@s.whatsapp.net' }] });

    expect(store.joins.length).toBe(1);
    expect(store.joins[0].u).toBe('6285822480546@s.whatsapp.net');
  });

  it('evento sem membros não faz nada', async () => {
    const { handleMemberJoin } = await loadService();
    const ctx = makeCtx();
    await handleMemberJoin(ctx as any, { groupId: GRUPO_A, members: [] });
    expect(ctx.sent.length).toBe(0);
  });
});

describe('welcome — configurável por grupo', () => {
  it('8. config de um grupo NÃO afeta outro', async () => {
    const { handleMemberJoin } = await loadService();
    store.mod.set(GRUPO_A, { bemvindo: true });
    store.mod.set(GRUPO_B, { bemvindo: true });
    welcomeStore.set(GRUPO_A, 'Bem-vindo ao A!');

    const ctxA = makeCtx();
    await handleMemberJoin(ctxA as any, { groupId: GRUPO_A, members: [{ id: 'x@s.whatsapp.net' }] });
    const ctxB = makeCtx();
    await handleMemberJoin(ctxB as any, { groupId: GRUPO_B, members: [{ id: 'x@s.whatsapp.net' }] });

    expect(ctxA.sent[0].text).toBe('Bem-vindo ao A!');            // personalizado
    expect(ctxB.sent[0].text).toBe('Bem-vindo @novato 👋');        // padrão
  });

  it('placeholders {nome}, {numero}, {grupo} são aplicados', async () => {
    const { handleMemberJoin } = await loadService();
    store.mod.set(GRUPO_A, { bemvindo: true });
    welcomeStore.set(GRUPO_A, 'Olá {nome} ({numero}) — bem-vindo ao {grupo}!');
    const ctx = makeCtx();

    await handleMemberJoin(ctx as any, {
      groupId: GRUPO_A,
      members: [{ id: '6285822480546@s.whatsapp.net', name: 'Daniel', phoneNumber: '6285822480546@s.whatsapp.net' }],
    });

    expect(ctx.sent[0].text).toBe('Olá Daniel (6285822480546) — bem-vindo ao Figurinhas/Stickers!');
  });
});

describe('welcome — ban-on-rejoin continua funcionando', () => {
  it('membro banido é removido e NÃO recebe welcome', async () => {
    const { handleMemberJoin } = await loadService();
    store.mod.set(GRUPO_A, { bemvindo: true });
    store.bans.add(`${GRUPO_A}|6285822480546@s.whatsapp.net`);
    const ctx = makeCtx();

    await handleMemberJoin(ctx as any, { groupId: GRUPO_A, members: [{ id: '6285822480546@s.whatsapp.net' }] });

    expect(ctx.removed).toContain('6285822480546@s.whatsapp.net');
    // Banido NÃO recebe welcome — só o aviso de banimento.
    const welcomes = ctx.sent.filter(s => s.text === 'Bem-vindo @novato 👋');
    expect(welcomes.length).toBe(0);
    expect(ctx.sent.some(s => s.text.includes('banido'))).toBe(true);
  });
});

describe('renderWelcome — helper puro', () => {
  it('placeholder sem valor vira string vazia (nunca "undefined")', async () => {
    const { renderWelcome } = await import('../../src/services/welcomeService');
    const out = renderWelcome('Olá {nome}!', {});
    expect(out).not.toContain('undefined');
    expect(out).toBe('Olá !');
  });

  it('é case-insensitive nos placeholders', async () => {
    const { renderWelcome } = await import('../../src/services/welcomeService');
    expect(renderWelcome('{NOME} {Numero}', { nome: 'A', numero: '1' })).toBe('A 1');
  });

  it('normaliza espaços em branco', async () => {
    const { renderWelcome } = await import('../../src/services/welcomeService');
    expect(renderWelcome('  Olá   {nome}  ', { nome: 'A' })).toBe('Olá A');
  });
});
