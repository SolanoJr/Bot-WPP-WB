import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Comando $noticias — roteamento de on/off/status, permissão e on-demand.
 *
 * `newsService` e `databaseService` são mockados: nenhum teste toca em rede
 * (IA) ou banco. O foco é o parsing dos argumentos e as guardas.
 */

const mocks = vi.hoisted(() => ({
  fetchNews: vi.fn(async () => '1. Notícia A — resumo\n2. Notícia B — resumo'),
  formatNewsMessage: vi.fn((topic: string, count: number, body: string) => `MSG:${topic}:${count}:${body}`),
  upsertGroupNews: vi.fn(async () => undefined),
  getGroupNews: vi.fn(async () => null as any),
}));

vi.mock('../../src/services/newsService', () => ({
  fetchNews: mocks.fetchNews,
  formatNewsMessage: mocks.formatNewsMessage,
  titleCase: (s: string) => s,
  MAX_TOPIC_LEN: 80,
  MIN_ITEMS: 1,
  MAX_ITEMS: 10,
}));

vi.mock('../../src/services/databaseService', () => ({
  upsertGroupNews: mocks.upsertGroupNews,
  getGroupNews: mocks.getGroupNews,
}));

const CHAT = 'wpp:120363410094452673@g.us';

function makeCtx(over: Record<string, any> = {}) {
  return {
    args: [] as string[],
    chatId: CHAT,
    groupName: 'Grupo Teste',
    isGroup: true,
    isMaster: false,
    isAdmin: false,
    reply: vi.fn(async () => undefined),
    ...over,
  };
}

async function cmd() {
  const { noticiasCommand } = await import('../../src/bot/commands/noticias');
  return noticiasCommand;
}

beforeEach(() => {
  mocks.fetchNews.mockClear();
  mocks.formatNewsMessage.mockClear();
  mocks.upsertGroupNews.mockClear();
  mocks.getGroupNews.mockReset();
  mocks.getGroupNews.mockResolvedValue(null);
});

describe('$noticias — permissão', () => {
  it('off sem admin → rejeita e não escreve', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['off'] });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('restritos'));
  });

  it('off com admin → upsert enabled:false', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['off'], isAdmin: true });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).toHaveBeenCalledWith(CHAT, { enabled: false });
  });

  it('status sem admin → rejeita e não lê o banco', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['status'] });
    await c.execute(ctx as any);

    expect(mocks.getGroupNews).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('restritos'));
  });
});

describe('$noticias — status', () => {
  it('com admin → mostra a config atual', async () => {
    mocks.getGroupNews.mockResolvedValue({
      enabled: true,
      scheduleTime: '07:30',
      topic: 'tecnologia',
      itemCount: 4,
      lastSentAt: '2026-10-15T07:30:00',
    });
    const c = await cmd();
    const ctx = makeCtx({ args: ['status'], isAdmin: true });
    await c.execute(ctx as any);

    const msg = ctx.reply.mock.calls[0][0];
    expect(msg).toContain('Grupo Teste');
    expect(msg).toContain('✅ Ativo');
    expect(msg).toContain('07:30');
    expect(msg).toContain('tecnologia');
    expect(msg).toContain('4');
    expect(msg).toContain('2026-10-15T07:30:00');
  });

  it('sem config → mostra defaults', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['status'], isAdmin: true });
    await c.execute(ctx as any);

    const msg = ctx.reply.mock.calls[0][0];
    expect(msg).toContain('⛔ Desativado');
    expect(msg).toContain('08:00');
    expect(msg).toContain('(todos os temas)');
    expect(msg).toContain('nunca');
  });
});

describe('$noticias — on', () => {
  it('on sem hora → 08:00 e sem tema', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['on'], isAdmin: true });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).toHaveBeenCalledWith(CHAT, {
      enabled: true, scheduleTime: '08:00', topic: '',
    });
  });

  it('on 09:30 tecnologia → hora e tema', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['on', '09:30', 'tecnologia'], isAdmin: true });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).toHaveBeenCalledWith(CHAT, {
      enabled: true, scheduleTime: '09:30', topic: 'tecnologia',
    });
  });

  it('on mundo geek (sem hora) → tema com horário default', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['on', 'mundo', 'geek'], isAdmin: true });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).toHaveBeenCalledWith(CHAT, {
      enabled: true, scheduleTime: '08:00', topic: 'mundo geek',
    });
  });

  it('on 8:00 → normaliza para 08:00', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['on', '8:00'], isAdmin: true });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).toHaveBeenCalledWith(CHAT, {
      enabled: true, scheduleTime: '08:00', topic: '',
    });
  });

  it('on 25:99 → rejeita, NÃO escreve', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['on', '25:99'], isAdmin: true });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('inválido'));
  });

  it('on sem admin → rejeita', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['on', '08:00'] });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('restritos'));
  });

  it('tema com mais de 80 chars → rejeita', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['on', 'x'.repeat(81)], isAdmin: true });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('longo'));
  });
});

describe('$noticias — on-demand', () => {
  it('tecnologia → fetchNews("tecnologia", 5)', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['tecnologia'] });
    await c.execute(ctx as any);

    expect(mocks.fetchNews).toHaveBeenCalledWith('tecnologia', 5);
  });

  it('tecnologia 3 → fetchNews("tecnologia", 3)', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['tecnologia', '3'] });
    await c.execute(ctx as any);

    expect(mocks.fetchNews).toHaveBeenCalledWith('tecnologia', 3);
  });

  it('tecnologia 99 → capa em 10', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['tecnologia', '99'] });
    await c.execute(ctx as any);

    expect(mocks.fetchNews).toHaveBeenCalledWith('tecnologia', 10);
  });

  it('sem args → mostra ajuda e NÃO chama fetchNews', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: [] });
    await c.execute(ctx as any);

    expect(mocks.fetchNews).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('$noticias <tema>'));
  });

  it('"ondas gravitacionais" é tema, NÃO o `on` reservado', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['ondas', 'gravitacionais'] });
    await c.execute(ctx as any);

    expect(mocks.upsertGroupNews).not.toHaveBeenCalled();
    expect(mocks.fetchNews).toHaveBeenCalledWith('ondas gravitacionais', 5);
  });

  it('é livre — sem admin também busca', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['esportes'] });
    await c.execute(ctx as any);

    expect(mocks.fetchNews).toHaveBeenCalledWith('esportes', 5);
  });

  it('tema com mais de 80 chars → rejeita', async () => {
    const c = await cmd();
    const ctx = makeCtx({ args: ['x'.repeat(81)] });
    await c.execute(ctx as any);

    expect(mocks.fetchNews).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('longo'));
  });
});
