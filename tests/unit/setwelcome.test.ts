/**
 * $setwelcome — design ADITIVO (INC-012b).
 *
 * Contrato novo (correção do dono): o default 'Boas-vindas @novato 👋'
 * SEMPRE abre a mensagem; o texto do admin entra ABAIXO, não substitui.
 *   $setwelcome <texto>   → default + "\n\n" + texto (idempotente)
 *   $setwelcome --full <> → template completo cru
 *   $setwelcome reset|default → NULL (padrão puro)
 *
 * Lógica REAL (composeWelcome/renderWelcome do welcomeService real via
 * importOriginal); mocks isolam só banco, permissões e logger.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const MASTER = '558898314322@c.us';
const GRUPO = '120363410094452673@g.us';
const DEFAULT_TXT = 'Boas-vindas @novato 👋';

const welcomeStore = new Map<string, string | null>();

vi.mock('../../src/services/welcomeService', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual, // composeWelcome / DEFAULT_WELCOME / WELCOME_PLACEHOLDERS reais
    getWelcomeMessage: vi.fn(async (g: string) => welcomeStore.get(g) ?? null),
    setWelcomeMessage: vi.fn(async (g: string, t: string | null) => {
      welcomeStore.set(g, t);
    }),
  };
});

vi.mock('../../src/services/permissions', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, isMaster: vi.fn((id: string) => id === MASTER) };
});

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {},
  logWarning: () => {},
  logError: () => {},
}));

const { setwelcomeCommand } = await import('../../src/bot/commands/setwelcome');

/** Participante no formato REAL do groupMetadata do Baileys. */
const participants = [
  { id: '202658048684056@lid', phoneNumber: MASTER, admin: 'superadmin' },
  { id: '27445294006297@lid', phoneNumber: '558781303081@s.whatsapp.net', admin: 'admin' },
  { id: '60382962012254@lid', phoneNumber: '558899855554@s.whatsapp.net', admin: null },
];

function makeCtx(args: string[], userId = MASTER, isGroup = true) {
  return {
    userId,
    args,
    groupName: 'Teste',
    getChat: async () => ({ isGroup, id: GRUPO, participants }),
    reply: vi.fn(async (_t: string) => {}),
  } as any;
}

beforeEach(() => {
  welcomeStore.clear();
  vi.clearAllMocks();
});

describe('$setwelcome — aditivo', () => {
  it('$setwelcome <texto> salva default + \\n\\n + texto', async () => {
    const ctx = makeCtx(['Bem-vindo', 'ao', 'grupo!']);
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.get(GRUPO)).toBe(`${DEFAULT_TXT}\n\nBem-vindo ao grupo!`);
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(String(ctx.reply.mock.calls[0][0])).toContain('✅ Welcome configurado');
  });

  it('$setwelcome reset limpa para NULL e confirma', async () => {
    welcomeStore.set(GRUPO, 'custom antigo');
    const ctx = makeCtx(['reset']);
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.get(GRUPO)).toBeNull();
    expect(String(ctx.reply.mock.calls[0][0])).toContain('resetado para o padrão');
  });

  it('$setwelcome default também reseta (alias)', async () => {
    welcomeStore.set(GRUPO, 'custom antigo');
    const ctx = makeCtx(['DEFAULT']);
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.get(GRUPO)).toBeNull();
  });

  it('$setwelcome --full <texto> salva o template cru, sem prepender', async () => {
    const ctx = makeCtx(['--full', 'Bem-vindo', 'ao', 'grupo!']);
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.get(GRUPO)).toBe('Bem-vindo ao grupo!');
    expect(String(ctx.reply.mock.calls[0][0])).toContain('template completo');
  });

  it('idempotente: texto que já contém o default não ganha prepend', async () => {
    const ctx = makeCtx(['Boas-vindas', 'pessoal', 'do', '085!']);
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.get(GRUPO)).toBe('Boas-vindas pessoal do 085!');
  });

  it('--full sem texto avisa erro e não grava', async () => {
    const ctx = makeCtx(['--full']);
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.has(GRUPO)).toBe(false);
    expect(String(ctx.reply.mock.calls[0][0])).toContain('Texto vazio');
  });
});

describe('$setwelcome — autorização', () => {
  it('admin comum do grupo (não-master) pode configurar', async () => {
    const ctx = makeCtx(['Regras', 'no', 'pin'], '558781303081@s.whatsapp.net');
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.get(GRUPO)).toBe(`${DEFAULT_TXT}\n\nRegras no pin`);
  });

  it('membro comum é negado', async () => {
    const ctx = makeCtx(['oi'], '558899855554@s.whatsapp.net');
    await setwelcomeCommand.execute(ctx);
    expect(welcomeStore.has(GRUPO)).toBe(false);
    expect(String(ctx.reply.mock.calls[0][0])).toContain('Apenas administradores');
  });

  it('fora de grupo é negado', async () => {
    const ctx = makeCtx(['oi'], MASTER, false);
    await setwelcomeCommand.execute(ctx);
    expect(ctx.reply).toHaveBeenCalledWith('❌ Este comando só pode ser usado em grupos.');
  });
});

describe('$setwelcome — consulta', () => {
  it('sem args mostra o padrão quando não há custom', async () => {
    const ctx = makeCtx([]);
    await setwelcomeCommand.execute(ctx);
    const msg = String(ctx.reply.mock.calls[0][0]);
    expect(msg).toContain('_(padrão do sistema)_');
    expect(msg).toContain(DEFAULT_TXT);
    expect(msg).toContain('$setwelcome --full');
  });

  it('sem args mostra o custom quando existe', async () => {
    welcomeStore.set(GRUPO, `${DEFAULT_TXT}\n\nTexto do admin`);
    const ctx = makeCtx([]);
    await setwelcomeCommand.execute(ctx);
    expect(String(ctx.reply.mock.calls[0][0])).toContain('_(personalizada)_');
  });
});
