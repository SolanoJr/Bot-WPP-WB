/**
 * Testes do Fix 2 — identificação de admin, LID↔PN e autorização de $kick/$ban.
 *
 * Dados REAIS de produção (grupo Teste 120363410094452673@g.us):
 *   bot: { id: "2592935567439@lid", phoneNumber: "558581344211@s.whatsapp.net", admin: "admin" }
 *   ctx.client.userId: "558581344211:81@s.whatsapp.net"
 *
 * Antes do fix, getChat() devolvia participants: string[] e a comparação era
 * cleanId("2592935567439@lid") === cleanId("558581344211:81@s.whatsapp.net")
 * → "2592935567439" === "558581344211" → false → "não é administrador".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeParticipant,
  isSelfParticipant,
  isBotGroupAdmin,
  isSenderGroupAdmin,
  findParticipant,
} from '../../src/services/groupAdmin';

// ─── Dados reais (extraídos de /lab/groups em produção) ──────────────────────
const BOT_LID = '2592935567439@lid';
const BOT_PN = '558581344211@s.whatsapp.net';
const BOT_USER_ID = '558581344211:81@s.whatsapp.net'; // ctx.client.userId real
const OWNER_LID = '202658048684056@lid';
const OWNER_PN = '558898314322@s.whatsapp.net';
const OUTRO_ADMIN_LID = '27445294006297@lid';
const OUTRO_ADMIN_PN = '558781303081@s.whatsapp.net';
const MEMBRO_LID = '60382962012254@lid';
const MEMBRO_PN = '558899855554@s.whatsapp.net';

/** Participante no formato REAL do groupMetadata do Baileys. */
function raw(p: { id: string; phoneNumber?: string; admin?: string | null }) {
  return { id: p.id, phoneNumber: p.phoneNumber, admin: p.admin ?? null };
}

const CHAT_COMPLETO = {
  participants: [
    raw({ id: OWNER_LID, phoneNumber: OWNER_PN, admin: 'superadmin' }),
    raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: 'admin' }),          // ← o bot
    raw({ id: OUTRO_ADMIN_LID, phoneNumber: OUTRO_ADMIN_PN, admin: 'admin' }),
    raw({ id: MEMBRO_LID, phoneNumber: MEMBRO_PN, admin: null }),
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// A/B) participants como string (legado) vs objeto (novo contrato)
// ═══════════════════════════════════════════════════════════════════════════

describe('normalizeParticipant — compatibilidade string/objeto', () => {
  it('A) aceita participants como STRING (formato legado)', () => {
    const p = normalizeParticipant(BOT_LID);
    expect(p.id).toBe(BOT_LID);
    expect(p.isAdmin).toBe(false);      // string não carrega role
    expect(p.isSuperAdmin).toBe(false);
  });

  it('B) aceita participants como OBJETO (novo contrato)', () => {
    const p = normalizeParticipant(raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: 'admin' }));
    expect(p.id).toBe(BOT_LID);
    expect(p.phoneNumber).toBe(BOT_PN);
    expect(p.isAdmin).toBe(true);
    expect(p.isSuperAdmin).toBe(false);
  });

  it('normaliza admin:"superadmin"', () => {
    const p = normalizeParticipant(raw({ id: OWNER_LID, admin: 'superadmin' }));
    expect(p.isAdmin).toBe(true);
    expect(p.isSuperAdmin).toBe(true);
  });

  it('normaliza admin:null como não-admin', () => {
    const p = normalizeParticipant(raw({ id: MEMBRO_LID, admin: null }));
    expect(p.isAdmin).toBe(false);
    expect(p.isSuperAdmin).toBe(false);
  });

  it('aceita phone_number como alias de phoneNumber', () => {
    const p = normalizeParticipant({ id: BOT_LID, phone_number: BOT_PN, admin: 'admin' });
    expect(p.phoneNumber).toBe(BOT_PN);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C/D/E) Reconhecimento do próprio bot por LID, PN e PN com device suffix
// ═══════════════════════════════════════════════════════════════════════════

describe('isSelfParticipant — reconhece o WarriorBlack em qualquer representação', () => {
  it('C) reconhece o bot representado por LID', () => {
    const p = normalizeParticipant(raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: 'admin' }));
    expect(isSelfParticipant(p, BOT_USER_ID )).toBe(true);
  });

  it('D) reconhece o bot representado por PN', () => {
    const p = normalizeParticipant(raw({ id: BOT_PN, admin: 'admin' }));
    expect(isSelfParticipant(p, BOT_USER_ID )).toBe(true);
  });

  it('E) reconhece PN com device suffix (:81)', () => {
    const p = normalizeParticipant(raw({ id: BOT_USER_ID, admin: 'admin' }));
    expect(isSelfParticipant(p, BOT_USER_ID )).toBe(true);
  });

  it('reconhece o bot quando só o phoneNumber do metadata casa (LID opaco)', () => {
    // Cenário real: o id é um LID que não está no .env, mas o phoneNumber sim
    const p = normalizeParticipant(raw({ id: '99999999999999@lid', phoneNumber: BOT_PN, admin: 'admin' }));
    expect(isSelfParticipant(p, BOT_USER_ID )).toBe(true);
  });

  it('NÃO confunde outro membro com o bot', () => {
    const p = normalizeParticipant(raw({ id: MEMBRO_LID, phoneNumber: MEMBRO_PN, admin: null }));
    expect(isSelfParticipant(p, BOT_USER_ID )).toBe(false);
  });

  it('NÃO confunde outro admin com o bot', () => {
    const p = normalizeParticipant(raw({ id: OUTRO_ADMIN_LID, phoneNumber: OUTRO_ADMIN_PN, admin: 'admin' }));
    expect(isSelfParticipant(p, BOT_USER_ID )).toBe(false);
  });

  it('NÃO confunde o owner com o bot', () => {
    const p = normalizeParticipant(raw({ id: OWNER_LID, phoneNumber: OWNER_PN, admin: 'superadmin' }));
    expect(isSelfParticipant(p, BOT_USER_ID )).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isBotGroupAdmin — a autorização dos comandos
// ═══════════════════════════════════════════════════════════════════════════

describe('isBotGroupAdmin — autorização do bot', () => {
  it('G) bot reconhecido como admin (LID + phoneNumber reais)', () => {
    const r = isBotGroupAdmin(CHAT_COMPLETO, BOT_USER_ID );
    expect(r.verified).toBe(true);
    expect(r.isAdmin).toBe(true);
    expect(r.source).toBe('participants');
    expect(r.botParticipant?.id).toBe(BOT_LID);
  });

  it('bot admin reconhecido mesmo sem o phoneNumber no metadata (via )', () => {
    const chat = { participants: [raw({ id: BOT_LID, admin: 'admin' })] };
    const r = isBotGroupAdmin(chat, BOT_USER_ID );
    expect(r.verified).toBe(true);
    expect(r.isAdmin).toBe(true);
  });

  it('H) bot superadmin também autoriza', () => {
    const chat = { participants: [raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: 'superadmin' })] };
    const r = isBotGroupAdmin(chat, BOT_USER_ID );
    expect(r.isAdmin).toBe(true);
  });

  it('bot presente mas NÃO admin → verified:true, isAdmin:false', () => {
    const chat = { participants: [raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: null })] };
    const r = isBotGroupAdmin(chat, BOT_USER_ID );
    expect(r.verified).toBe(true);
    expect(r.isAdmin).toBe(false);
  });

  it('I) participantes VAZIOS → NÃO assume admin (nunca falha vira autorização)', () => {
    const r = isBotGroupAdmin({ participants: [] }, BOT_USER_ID );
    expect(r.verified).toBe(false);
    expect(r.isAdmin).toBe(false);
  });

  it('participants ausente/undefined → NÃO assume admin', () => {
    expect(isBotGroupAdmin({}, BOT_USER_ID ).isAdmin).toBe(false);
    expect(isBotGroupAdmin(null, BOT_USER_ID ).isAdmin).toBe(false);
    expect(isBotGroupAdmin(undefined, BOT_USER_ID ).isAdmin).toBe(false);
  });

  it('J) bot não localizado nos participantes → verified:false (NÃO assume)', () => {
    const chat = { participants: [raw({ id: MEMBRO_LID, phoneNumber: MEMBRO_PN, admin: null })] };
    const r = isBotGroupAdmin(chat, BOT_USER_ID );
    expect(r.verified).toBe(false);
    expect(r.isAdmin).toBe(false);
  });

  it('K) metadata inconsistente (participante sem id) não quebra nem autoriza', () => {
    const chat = { participants: [{ admin: 'admin' }, raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: 'admin' })] };
    const r = isBotGroupAdmin(chat, BOT_USER_ID );
    expect(r.verified).toBe(true);
    expect(r.isAdmin).toBe(true);
  });

  it('L) participantes como STRING (cache legado) → não autoriza por role', () => {
    const chat = { participants: [BOT_LID, MEMBRO_LID] };
    const r = isBotGroupAdmin(chat, BOT_USER_ID );
    // O bot é localizado (verified), mas string não traz role → não é admin
    expect(r.verified).toBe(true);
    expect(r.isAdmin).toBe(false);
  });

  it('regressão: a comparação ANTIGA falhava (cleanId LID ≠ cleanId PN)', () => {
    const clean = (s: string) => String(s).split('@')[0].replace(/^wpp:/, '').split(':')[0];
    // É exatamente isso que kick.ts fazia antes do fix:
    expect(clean(BOT_LID)).toBe('2592935567439');
    expect(clean(BOT_USER_ID)).toBe('558581344211');
    expect(clean(BOT_LID)).not.toBe(clean(BOT_USER_ID)); // ← a causa raiz
    // E o novo caminho reconhece corretamente:
    expect(isBotGroupAdmin(CHAT_COMPLETO, BOT_USER_ID ).isAdmin).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isSenderGroupAdmin — autorização do remetente
// ═══════════════════════════════════════════════════════════════════════════

describe('isSenderGroupAdmin — autorização do remetente', () => {
  it('F) outro membro NÃO-admin → false', () => {
    expect(isSenderGroupAdmin(CHAT_COMPLETO, MEMBRO_LID)).toBe(false);
  });

  it('G) outro administrador → true (por LID)', () => {
    expect(isSenderGroupAdmin(CHAT_COMPLETO, OUTRO_ADMIN_LID)).toBe(true);
  });

  it('outro administrador → true (por PN)', () => {
    expect(isSenderGroupAdmin(CHAT_COMPLETO, OUTRO_ADMIN_PN)).toBe(true);
  });

  it('H) superadmin → true', () => {
    expect(isSenderGroupAdmin(CHAT_COMPLETO, OWNER_LID)).toBe(true);
    expect(isSenderGroupAdmin(CHAT_COMPLETO, OWNER_PN)).toBe(true);
  });

  it('membro comum identificado pelo PN (não-admin) → false', () => {
    expect(isSenderGroupAdmin(CHAT_COMPLETO, MEMBRO_PN)).toBe(false);
  });

  it('I) participantes vazios → false', () => {
    expect(isSenderGroupAdmin({ participants: [] }, OUTRO_ADMIN_LID)).toBe(false);
  });

  it('ID desconhecido → false', () => {
    expect(isSenderGroupAdmin(CHAT_COMPLETO, '5511999999999@s.whatsapp.net')).toBe(false);
  });

  it('senderId vazio → false', () => {
    expect(isSenderGroupAdmin(CHAT_COMPLETO, '')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// findParticipant — localização de alvo
// ═══════════════════════════════════════════════════════════════════════════

describe('findParticipant — localização por LID ou PN', () => {
  it('localiza por LID', () => {
    expect(findParticipant(CHAT_COMPLETO, MEMBRO_LID)?.id).toBe(MEMBRO_LID);
  });
  it('localiza por PN', () => {
    expect(findParticipant(CHAT_COMPLETO, MEMBRO_PN)?.id).toBe(MEMBRO_LID);
  });
  it('retorna undefined para desconhecido', () => {
    expect(findParticipant(CHAT_COMPLETO, '5511000000000@s.whatsapp.net')).toBeUndefined();
  });
  it('não quebra com participants vazio/ausente', () => {
    expect(findParticipant({ participants: [] }, MEMBRO_LID)).toBeUndefined();
    expect(findParticipant(null, MEMBRO_LID)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Caminho de produção: $kick e $ban (autorização real)
// ═══════════════════════════════════════════════════════════════════════════

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    platform: 'whatsapp',
    chatId: 'wpp:120363410094452673@g.us',
    userId: OWNER_LID,
    userName: 'SolanoJr',
    isGroup: true,
    isMaster: false,
    isAdmin: false,
    client: {
      userId: BOT_USER_ID,                       // ← o bot, com device suffix
      removeParticipant: vi.fn(async () => {}),
      banParticipant: vi.fn(async () => {}),
      getUser: vi.fn(async () => ({ name: 'Alvo' })),
    },
    msg: {
      mentions: [{ id: MEMBRO_LID }],
      replyToMessageId: undefined,
      raw: {},
    },
    getChat: vi.fn(async () => ({
      ...CHAT_COMPLETO,
      id: '120363410094452673@g.us',
      isGroup: true,
      name: 'Teste',
      isPermissionsVerified: true,
    })),
    reply: vi.fn(async () => {}),
    replyPrivate: vi.fn(async () => {}),
    getUser: vi.fn(async () => ({ name: 'Alvo' })),
    ...overrides,
  };
}

describe('$kick — caminho real de autorização e execução', () => {
  it('autoriza quando o bot é admin e o remetente é admin → executa removeParticipant', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { kickCommand } = await import('../../src/bot/commands/kick');

    const ctx = makeCtx();
    await kickCommand.execute(ctx as any);

    // Autorização passou → a remoção real foi chamada com o alvo correto
    expect(ctx.client.removeParticipant).toHaveBeenCalledWith('wpp:120363410094452673@g.us', MEMBRO_LID);
    // Nenhuma mensagem de "precisa ser administrador"
    const replies = ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join('\n');
    expect(replies).not.toContain('precisa ser administrador');
    expect(replies).not.toContain('não tem permissão');
    expect(replies).not.toContain('Não foi possível verificar');

    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA quando o bot NÃO é admin', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { kickCommand } = await import('../../src/bot/commands/kick');

    const ctx = makeCtx({
      getChat: vi.fn(async () => ({
        participants: [raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: null })], // bot não-admin
        id: '120363410094452673@g.us', isGroup: true, name: 'Teste',
      })),
    });
    await kickCommand.execute(ctx as any);

    expect(ctx.client.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('bot precisa ser administrador');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA quando o metadata é indisponível (não assume admin)', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { kickCommand } = await import('../../src/bot/commands/kick');

    const ctx = makeCtx({
      getChat: vi.fn(async () => ({ participants: [], id: 'g@g.us', isGroup: true })),
    });
    await kickCommand.execute(ctx as any);

    expect(ctx.client.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('não está disponível nesta plataforma');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA quando o remetente não é admin nem master', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { kickCommand } = await import('../../src/bot/commands/kick');

    const ctx = makeCtx({ userId: MEMBRO_LID }); // membro comum
    await kickCommand.execute(ctx as any);

    expect(ctx.client.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('não tem permissão');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA remover um administrador', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { kickCommand } = await import('../../src/bot/commands/kick');

    const ctx = makeCtx({ msg: { mentions: [{ id: OUTRO_ADMIN_LID }], raw: {} } });
    await kickCommand.execute(ctx as any);

    expect(ctx.client.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('Não é possível remover um administrador');
    vi.doUnmock('../../src/services/loggerService');
  });
});

describe('$ban — caminho real de autorização e execução', () => {
  it('autoriza quando o bot é admin e o remetente é admin → executa banParticipant', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { banCommand } = await import('../../src/bot/commands/ban');

    const ctx = makeCtx();
    await banCommand.execute(ctx as any);

    expect(ctx.client.banParticipant).toHaveBeenCalledWith('wpp:120363410094452673@g.us', MEMBRO_LID);
    const replies = ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join('\n');
    expect(replies).not.toContain('precisa ser administrador');
    expect(replies).not.toContain('precisa ser administrador para usar este comando');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA quando o bot NÃO é admin', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { banCommand } = await import('../../src/bot/commands/ban');

    const ctx = makeCtx({
      getChat: vi.fn(async () => ({
        participants: [raw({ id: BOT_LID, phoneNumber: BOT_PN, admin: null })],
        id: 'g@g.us', isGroup: true,
      })),
    });
    await banCommand.execute(ctx as any);

    expect(ctx.client.banParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('bot precisa ser administrador');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA quando o metadata é indisponível (não assume admin)', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { banCommand } = await import('../../src/bot/commands/ban');

    const ctx = makeCtx({ getChat: vi.fn(async () => ({ participants: [], isGroup: true, id: 'g@g.us' })) });
    await banCommand.execute(ctx as any);

    expect(ctx.client.banParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('não está disponível nesta plataforma');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA quando o remetente não é admin', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { banCommand } = await import('../../src/bot/commands/ban');

    const ctx = makeCtx({ userId: MEMBRO_LID });
    await banCommand.execute(ctx as any);

    expect(ctx.client.banParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('precisa ser administrador');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('RECUSA banir um administrador', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { banCommand } = await import('../../src/bot/commands/ban');

    const ctx = makeCtx({ msg: { mentions: [{ id: OUTRO_ADMIN_LID }], raw: {} } });
    await banCommand.execute(ctx as any);

    expect(ctx.client.banParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('Não é possível banir administradores');
    vi.doUnmock('../../src/services/loggerService');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Telegram e Discord — participants: [] (auditoria de não-regressão)
// ═══════════════════════════════════════════════════════════════════════════

describe('Telegram/Discord — participants vazio (adapters não expõem membros)', () => {
  function makeOuterCtx(platform: string, chatId: string, userId: string) {
    return {
      platform,
      chatId,
      userId,
      userName: 'SolanoJr',
      isGroup: true, isMaster: false, isAdmin: false,
      client: {
        userId: `${platform}:558581344211`,
        removeParticipant: vi.fn(async () => {}),
        banParticipant: vi.fn(async () => {}),
        getUser: vi.fn(async () => ({ name: 'Alvo' })),
      },
      msg: { mentions: [{ id: `${platform}:999` }], raw: {} },
      // TelegramAdapter.getChat() / DiscordAdapter.getChat() SEMPRE retornam []
      getChat: vi.fn(async () => ({
        id: chatId, name: 'Grupo', isGroup: true, platform, participants: [], raw: {},
      })),
      reply: vi.fn(async () => {}),
      replyPrivate: vi.fn(async () => {}),
    };
  }

  it('adapterProvidesParticipants() reflete a realidade dos adapters', async () => {
    const { adapterProvidesParticipants } = await import('../../src/services/groupAdmin');
    expect(adapterProvidesParticipants({ participants: [] })).toBe(false);
    expect(adapterProvidesParticipants({})).toBe(false);
    expect(adapterProvidesParticipants(null)).toBe(false);
    expect(adapterProvidesParticipants({ participants: [raw({ id: BOT_LID })] })).toBe(true);
  });

  it('$kick no Telegram → recusa com mensagem precisa, sem executar', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { kickCommand } = await import('../../src/bot/commands/kick');
    const ctx = makeOuterCtx('telegram', 'tg:146078742', 'tg:146078742');
    await kickCommand.execute(ctx as any);

    expect(ctx.client.removeParticipant).not.toHaveBeenCalled();
    const r = ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(r).toContain('não está disponível nesta plataforma');
    // Não deve alegar falsamente que o bot não é admin
    expect(r).not.toContain('precisa ser administrador');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('$ban no Telegram → recusa com mensagem precisa, sem executar', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { banCommand } = await import('../../src/bot/commands/ban');
    const ctx = makeOuterCtx('telegram', 'tg:146078742', 'tg:146078742');
    await banCommand.execute(ctx as any);

    expect(ctx.client.banParticipant).not.toHaveBeenCalled();
    const r = ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join(' | ');
    expect(r).toContain('não está disponível nesta plataforma');
    expect(r).not.toContain('precisa ser administrador');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('$kick no Discord → recusa com mensagem precisa, sem executar', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { kickCommand } = await import('../../src/bot/commands/kick');
    const ctx = makeOuterCtx('discord', 'dc:1521942390082900190', 'dc:209849099178999808');
    await kickCommand.execute(ctx as any);

    expect(ctx.client.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('não está disponível nesta plataforma');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('$ban no Discord → recusa com mensagem precisa, sem executar', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/loggerService', () => ({
      logInfo: () => {}, logWarning: () => {}, logError: () => {},
    }));
    const { banCommand } = await import('../../src/bot/commands/ban');
    const ctx = makeOuterCtx('discord', 'dc:1521942390082900190', 'dc:209849099178999808');
    await banCommand.execute(ctx as any);

    expect(ctx.client.banParticipant).not.toHaveBeenCalled();
    expect(ctx.reply.mock.calls.map((c: any[]) => String(c[0])).join()).toContain('não está disponível nesta plataforma');
    vi.doUnmock('../../src/services/loggerService');
  });

  it('REGRESSÃO: TG/DC já recusavam ANTES do fix (participants=[] + isPermissionsVerified ausente)', () => {
    // Réplica da lógica antiga (git HEAD:src/bot/commands/kick.ts):
    // permsVerified = (chat.isPermissionsVerified !== false) → TG não seta → true
    // botPart = participants.find(...) → undefined (lista vazia)
    // → recusava. O fix NÃO introduziu a recusa; apenas tornou a mensagem precisa.
    const chat: any = { participants: [] };
    const permsVerified = (chat as any).isPermissionsVerified !== false;
    const botPart = (chat.participants || []).find((p: any) => String(p.id) === '558581344211');
    expect(permsVerified).toBe(true);
    expect(botPart).toBeUndefined();
    expect(permsVerified && !botPart?.isAdmin && !botPart?.isSuperAdmin).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PlatformManager.createCommandContext — verificação PARALELA de admin
// (trace: executeCommand → checkPermissions → createCommandContext → ctx.isAdmin)
// ═══════════════════════════════════════════════════════════════════════════

describe('PlatformManager — ctx.isAdmin usa a fonte única (não cleanId direto)', () => {
  /**
   * Réplica da lógica NOVA de createCommandContext (PlatformManager.ts).
   * A lógica ANTIGA fazia comparação direta de cleanId, que falhava quando o
   * remetente aparecia como @lid e o sistema usava @s.whatsapp.net.
   */
  async function computeIsAdmin(chat: any, userId: string) {
    const { isSenderGroupAdmin } = await import('../../src/services/groupAdmin');
    return isSenderGroupAdmin(chat, userId);
  }

  it('ANTES (cleanId direto + p.isAdmin) FALHAVA mesmo com ambos @lid', () => {
    // Réplica da lógica antiga de PlatformManager:
    const chat: any = CHAT_COMPLETO;
    const messageUserId = 'wpp:27445294006297@lid';
    const cleanUser = String(messageUserId).split('@')[0].replace(/^wpp:/, ''); // "27445294006297"
    const parts = chat.participants || [];
    const oldResult = parts.some((p: any) => {
      const pid = String(p.id?._serialized || p.id || '').split('@')[0].replace(/^wpp:/, '');
      return pid === cleanUser && (p.isAdmin || p.isSuperAdmin);
    });
    // O ID CASOU ("27445294006297"), mas o metadata cru traz `admin: 'admin'` —
    // NÃO `isAdmin`. Então a condição falhava mesmo com o ID correto.
    const idMatched = parts.some((p: any) => {
      const pid = String(p.id?._serialized || p.id || '').split('@')[0].replace(/^wpp:/, '');
      return pid === cleanUser;
    });
    expect(idMatched).toBe(true);   // o ID casava
    expect(oldResult).toBe(false);  // mas a checagem de admin lia o campo errado
  });

  it('ANTES (cleanId direto) FALHAVA: remetente por PN contra participants @lid', () => {
    const chat: any = CHAT_COMPLETO;
    const messageUserId = OUTRO_ADMIN_PN;  // "558781303081@s.whatsapp.net"
    const cleanUser = String(messageUserId).split('@')[0].replace(/^wpp:/, ''); // "558781303081"
    const parts = chat.participants || [];
    const oldResult = parts.some((p: any) => {
      const pid = String(p.id?._serialized || p.id || '').split('@')[0].replace(/^wpp:/, '');
      return pid === cleanUser && (p.isAdmin || p.isSuperAdmin);
    });
    // participant.id = "27445294006297@lid" → "27445294006297" ≠ "558781303081" → FALHA
    expect(oldResult).toBe(false);   // ← o bug real
  });

  it('DEPOIS (fonte única) ACERTA o mesmo caso via phoneNumber do metadata', async () => {
    const result = await computeIsAdmin(CHAT_COMPLETO, OUTRO_ADMIN_PN);
    expect(result).toBe(true);       // ← corrigido
  });

  it('DEPOIS: reconhece o bot como admin (por device-suffix userId e por LID)', async () => {
    // O bot É admin no grupo: userId "558581344211:81@..." casa via phoneNumber
    expect(await computeIsAdmin(CHAT_COMPLETO, BOT_USER_ID)).toBe(true);
    expect(await computeIsAdmin(CHAT_COMPLETO, BOT_LID)).toBe(true);
    expect(await computeIsAdmin(CHAT_COMPLETO, BOT_PN)).toBe(true);
  });

  it('DEPOIS: superadmin reconhecido por LID e por PN', async () => {
    expect(await computeIsAdmin(CHAT_COMPLETO, OWNER_LID)).toBe(true);
    expect(await computeIsAdmin(CHAT_COMPLETO, OWNER_PN)).toBe(true);
  });

  it('DEPOIS: membro comum continua NÃO sendo admin', async () => {
    expect(await computeIsAdmin(CHAT_COMPLETO, MEMBRO_LID)).toBe(false);
    expect(await computeIsAdmin(CHAT_COMPLETO, MEMBRO_PN)).toBe(false);
  });

  it('DEPOIS: participants vazio → false (não assume admin)', async () => {
    expect(await computeIsAdmin({ participants: [] }, OUTRO_ADMIN_LID)).toBe(false);
  });

  it('DEPOIS: com prefixo wpp: no userId também funciona', async () => {
    expect(await computeIsAdmin(CHAT_COMPLETO, `wpp:${OUTRO_ADMIN_PN}`)).toBe(true);
    expect(await computeIsAdmin(CHAT_COMPLETO, `wpp:${OWNER_LID}`)).toBe(true);
  });

  it('trace completo: nenhuma comparação cleanId direta sobrou em PlatformManager', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.join(process.cwd(), 'src/platforms/PlatformManager.ts'), 'utf-8'
    );
    // A lógica antiga tinha este padrão exato:
    expect(src).not.toContain("p.id?._serialized || p.id || ''");
    // E deve usar a fonte única:
    expect(src).toContain('isSenderGroupAdmin');
  });
});
