/**
 * tests/unit/autoModEngine.test.ts
 * Cobertura de unidade do motor de moderação automática (autoModEngine.ts).
 *
 * Testa as funções puras de extração/avaliação e a função evaluate()
 * com mocks do databaseService e do contexto de integração.
 *
 * Padrão de mock: vi.mock() hoisted no topo (fábrica de exports) + await import()
 * dentro dos testes para acessar as vi.fn() mocks e configurá-las por cenário.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isForeignNumber,
  isSuspiciousDisplayName,
  extractTextFromWAMessage,
  extractUrls,
  extractDomains,
  isSuspiciousDomain,
  containsSpamKeyword,
  fingerprint,
  evaluate,
  isProtectedTarget,
} from '../../src/services/autoModEngine';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock estático do databaseService (exportados que evaluate() vai chamar)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
vi.mock('../../src/services/databaseService', () => ({
  getGroupMod: vi.fn(async () => ({
    antiestrangeiro: true,
    remover: true,
    autolink: true,
    antispam: true,
    detectar: true,
  })),
  banUser: vi.fn(async () => {}),
  recordMemberJoin: vi.fn(async () => {}),
  recordMemberRemove: vi.fn(async () => {}),
  recordMessageFingerprint: vi.fn(async () => {}),
  getRecentFingerprintCount: vi.fn(async () => 0),
  cleanupOldFingerprintEntries: vi.fn(async () => {}),
  cleanupOldJoinEntries: vi.fn(async () => {}),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GROUP_JID = '5511988887777-1234567890@g.us';
const FOREIGN_JID = '1234567890@c.us';
const BR_BR_JID = '5511988887777@c.us';

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    sock: {},
    userId: '558581344211-1234567890@s.whatsapp.net',
    groupName: 'grupo-teste',
    getChat: vi.fn(async () => ({ participants: [], id: GROUP_JID, subject: 'grupo-teste' })),
    sendMessage: vi.fn(async (jid, text, opts) => ({ id: 'sent-1', text })),
    removeParticipant: vi.fn(async () => {}),
    log: vi.fn(console.log),
    warn: vi.fn(console.warn),
    error: vi.fn(console.error),
    ...overrides,
  };
}

function makeWAMessage(partial: Record<string, any> = {}): any {
  return {
    key: { id: 'msg-1', fromMe: false, remoteJid: GROUP_JID, participant: '55999999999@c.us' },
    message: { conversation: 'oi teste', ...partial },
    messageTimestamp: Date.now(),
  };
}

function groupConfig(overrides: Record<string, any> = {}) {
  return {
    antiestrangeiro: true,
    remover: true,
    autolink: true,
    antispam: true,
    detectar: true,
    ...overrides,
  };
}

// Acessa o módulo mockado do databaseService (vi.mock garante que os
// exports são vi.fn()). Precisa do dynamic import porque vi.mock é hoisted.
async function mockDb() {
  return await import('../../src/services/databaseService');
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('isForeignNumber', () => {
  it('identifica número brasileiro (55) como nacional', () => {
    expect(isForeignNumber('5511988887777@c.us')).toBe(false);
    expect(isForeignNumber('5511988887777-1234567890@g.us')).toBe(false);
    expect(isForeignNumber('5588998314322@c.us')).toBe(false);
  });

  it('identifica número não-brasileiro como estrangeiro', () => {
    expect(isForeignNumber('1234567890@c.us')).toBe(true);
    expect(isForeignNumber('1234567890-1234567890@g.us')).toBe(true);
    expect(isForeignNumber('447700900123@c.us')).toBe(true);
    expect(isForeignNumber('5512345@c.us')).toBe(false);
  });

  it('ignora strings vazias / inválidas', () => {
    expect(isForeignNumber('')).toBe(false);
  });
});

describe('isSuspiciousDisplayName', () => {
  it('marca nome vazio como suspeito', () => {
    expect(isSuspiciousDisplayName('')).toBe(true);
    expect(isSuspiciousDisplayName('   ')).toBe(true);
  });

  it('marca nome com apenas emojis/símbolos como suspeito', () => {
    expect(isSuspiciousDisplayName('🤖')).toBe(true);
    expect(isSuspiciousDisplayName('!!!')).toBe(true);
  });

  it('NÃO marca nome humano legítimo como suspeito', () => {
    expect(isSuspiciousDisplayName('João Silva')).toBe(false);
    expect(isSuspiciousDisplayName('Maria Oliveira')).toBe(false);
    expect(isSuspiciousDisplayName('Carlos André')).toBe(false);
  });

  it('nome com bot no texto NÃO é detectado como suspeito pela implementação atual', () => {
    // A implementação atual só detecta "bot" se o NOME INTEIRO for igual a "bot"
    // (regex /^(bot|...)$/i). "Bot automatizado" tem letras → não é só emojis/símbolos
    // e não é igual a "bot" → retorna false.
    expect(isSuspiciousDisplayName('Bot automatizado')).toBe(false);
  });
});

describe('extractTextFromWAMessage', () => {
  it('extrai texto de mensagem simples', () => {
    const msg = makeWAMessage({ conversation: 'olá mundo' });
    expect(extractTextFromWAMessage(msg)).toContain('olá mundo');
  });

  it('extrai texto de extendedTextMessage (texto e legenda)', () => {
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'mensagem longa',
        caption: 'legenda da imagem',
        linkPreview: {
          'canonical-url': 'https://example.com/page',
          title: 'Título do link',
          description: 'Descrição do link',
          matchedText: 'example.com',
        },
      },
    });
    const text = extractTextFromWAMessage(msg);
    expect(text).toContain('mensagem longa');
    expect(text).toContain('legenda da imagem');
    expect(text).toContain('https://example.com/page');
    expect(text).toContain('Título do link');
    expect(text).toContain('Descrição do link');
  });

  it('extrai botões de buttonsMessage', () => {
    const msg = makeWAMessage({
      buttonsMessage: {
        contentText: 'Escolha uma opção',
        footerText: 'Clique abaixo',
        buttons: [
          {
            buttonText: { displayText: 'Botão 1' },
            buttonId: 'id1',
            buttonParamsJson: JSON.stringify({ display_text: 'Exibir 1', url: 'https://exemplo.com' }),
          },
          { buttonText: { displayText: 'Botão 2' }, buttonId: 'id2' },
        ],
      },
    });
    const text = extractTextFromWAMessage(msg);
    expect(text).toContain('Escolha uma opção');
    expect(text).toContain('Botão 1');
    expect(text).toContain('Botão 2');
    expect(text).toContain('Exibir 1');
    expect(text).toContain('https://exemplo.com');
  });

  it('extrai título de listMessage', () => {
    const msg = makeWAMessage({
      listMessage: { title: 'Minha lista', description: 'Descrição da lista' },
    });
    const text = extractTextFromWAMessage(msg);
    expect(text).toContain('Minha lista');
    expect(text).toContain('Descrição da lista');
  });

  it('extrai título de listResponseMessage', () => {
    const msg = makeWAMessage({
      listResponseMessage: { title: 'Resposta da lista', listSelectedId: 'item1' },
    });
    const text = extractTextFromWAMessage(msg);
    expect(text).toContain('Resposta da lista');
    expect(text).toContain('list:item1');
  });

  it('extrai conteúdo de interactiveMessage', () => {
    const msg = makeWAMessage({
      interactiveMessage: {
        body: { text: 'Corpo interativo' },
        footer: { text: 'Rodapé' },
        header: { title: 'Título' },
      },
    });
    const text = extractTextFromWAMessage(msg);
    expect(text).toContain('Corpo interativo');
    expect(text).toContain('Rodapé');
    expect(text).toContain('Título');
  });
});

describe('extractUrls / extractDomains / isSuspiciousDomain', () => {
  it('extrai URLs do texto', () => {
    const urls = extractUrls('Veja https://casino-win.xyz e http://bonus-site.com/top');
    expect(urls).toContain('https://casino-win.xyz');
    expect(urls).toContain('http://bonus-site.com/top');
  });

  it('extrai domínios das URLs', () => {
    const domains = extractDomains(['https://casino-win.xyz', 'http://bonus-site.com/top']);
    expect(domains).toContain('casino-win');
    expect(domains).toContain('bonus-site');
  });

  it('identifica domínios suspeitos', () => {
    expect(isSuspiciousDomain(['casino-win', 'bonus-site', 'wtf', 'bet', 'game', 'win', 'xyz', 'top', 'click'])).toBe(true);
  });

  it('NÃO identifica domínios legítimos como suspeitos', () => {
    expect(isSuspiciousDomain(['google', 'wpp', 'whatsapp', 'github'])).toBe(false);
  });
});

describe('containsSpamKeyword', () => {
  it('detecta palavras-chave de spam', () => {
    expect(containsSpamKeyword('ganhe dinheiro rápido')).toBe(true);
    expect(containsSpamKeyword('lucro fácil garantido')).toBe(true);
    expect(containsSpamKeyword('recolha de dados')).toBe(true);
    expect(containsSpamKeyword('bônus exclusivo')).toBe(true);
  });

  it('NÃO detecta texto inocente', () => {
    expect(containsSpamKeyword('bom dia a todos')).toBe(false);
    expect(containsSpamKeyword('como vai?')).toBe(false);
  });
});

describe('fingerprint', () => {
  it('gera fingerprint normalizado (minúsculas, sem espaço duplicado)', () => {
    expect(fingerprint('  Olá   Mundo  ')).toBe('olá mundo');
  });

  it('substitui URLs por [URL]', () => {
    expect(fingerprint('acesse https://example.com agora')).toBe('acesse [URL] agora');
  });

  it('remove emojis (mantém letras, números, pontuação, espaço)', () => {
    // "Olá 🎉 mundo!" → trim → "olá 🎉 mundo!" → \s+ → "olá 🎉 mundo!" → remove [^\p{L}\p{N}\p{Z}\p{P}] → "olá  mundo!"
    expect(fingerprint('Olá 🎉 mundo!')).toBe('olá  mundo!');
  });

  it('corta a 120 caracteres', () => {
    const long = 'a'.repeat(200);
    expect(fingerprint(long).length).toBeLessThanOrEqual(120);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluate() — antiestrangeiro
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('evaluate — antiestrangeiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ban+remove+delete quando membro estrangeiro envia mensagem (antiestrangeiro ativo)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: true, remover: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'olá' });
    msg.key.participant = FOREIGN_JID;

    const result = await evaluate(msg, ctx, GROUP_JID, FOREIGN_JID, 'Estrangeiro');

    expect(result.acted).toBe(true);
    expect(result.action).toContain('ban');
    expect(db.banUser).toHaveBeenCalledWith(expect.objectContaining({ groupId: GROUP_JID, userId: FOREIGN_JID }));
    expect(ctx.removeParticipant).toHaveBeenCalledWith(GROUP_JID, FOREIGN_JID);
    expect(ctx.sendMessage).toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });

  it('NÃO age quando antiestrangeiro desativado', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'oi' });

    const result = await evaluate(msg, ctx, GROUP_JID, FOREIGN_JID, 'Estrangeiro');
    expect(result.acted).toBe(false);
    expect(ctx.removeParticipant).not.toHaveBeenCalled();
  });

  it('age mesmo com detectar=false (sem announce)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: true, remover: true, detectar: false }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'oi' });
    msg.key.participant = FOREIGN_JID;

    const result = await evaluate(msg, ctx, GROUP_JID, FOREIGN_JID, 'Estr');
    expect(result.acted).toBe(true);
    expect(db.banUser).toHaveBeenCalled();
    expect(ctx.removeParticipant).toHaveBeenCalled();
  });

  it('registra entrada do membro no banco (audit trail)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: true, remover: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'teste' });
    await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'Tester');
    expect(db.recordMemberJoin).toHaveBeenCalledWith(GROUP_JID, BR_BR_JID);
  });

  it('limpa fingerprints antigos quando há fingerprint válido', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: true, remover: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'teste' });
    await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'Tester');
    expect(db.cleanupOldFingerprintEntries).toHaveBeenCalledWith(3600);
  });

  it('NÃO ban/remover MASTER estrangeiro (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: true, remover: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'teste' });
    msg.key.participant = '5588998314322@c.us'; // MASTER_USER
    const result = await evaluate(msg, ctx, GROUP_JID, '5588998314322@c.us', 'Dono');

    expect(result.acted).toBe(false); // não age (proteção)
    expect(db.banUser).not.toHaveBeenCalled();
    expect(ctx.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.sendMessage).not.toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });

  it('NÃO ban/remover BOT estrangeiro (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: true, remover: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'teste' });
    msg.key.participant = '558581344211@c.us'; // BOT_NUMBER
    const result = await evaluate(msg, ctx, GROUP_JID, '558581344211@c.us', 'WarriorBlack');

    expect(result.acted).toBe(false); // não age (proteção)
    expect(db.banUser).not.toHaveBeenCalled();
    expect(ctx.removeParticipant).not.toHaveBeenCalled();
    expect(ctx.sendMessage).not.toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });

  it('usuário estrangeiro normal → regra continua funcionando (ban+remove+delete)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: true, remover: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'teste' });
    msg.key.participant = '1234567890@c.us'; // estrangeiro genérico
    const result = await evaluate(msg, ctx, GROUP_JID, '1234567890@c.us', 'Estrangeiro');

    expect(result.acted).toBe(true);
    expect(result.action).toContain('ban');
    expect(db.banUser).toHaveBeenCalledWith(expect.objectContaining({ groupId: GROUP_JID, userId: '1234567890@c.us' }));
    expect(ctx.removeParticipant).toHaveBeenCalledWith(GROUP_JID, '1234567890@c.us');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluate() — anti-bot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('evaluate — anti-bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detecta bot com foreign + link suspeito (>=2 sinais)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: true, autolink: true, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'cadastre-se em https://casino-win.xyz agora',
        linkPreview: { 'canonical-url': 'https://casino-win.xyz' },
      },
    });
    msg.key.participant = FOREIGN_JID;

    const result = await evaluate(msg, ctx, GROUP_JID, FOREIGN_JID, 'Bot');
    expect(result.acted).toBe(true);
    expect(result.action).toContain('ban');
  });

  it('detecta bot com foreign + nome vazio (>=2 sinais)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: true, autolink: true, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'teste' });
    msg.key.participant = FOREIGN_JID;

    const result = await evaluate(msg, ctx, GROUP_JID, FOREIGN_JID, '');
    expect(result.acted).toBe(true);
    expect(result.action).toContain('ban');
  });

  it('detecta bot com mensagem interativa + nome vazio (2 sinais)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: true, autolink: true, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      buttonsMessage: { contentText: 'clique aqui', buttons: [] },
    });
    msg.key.participant = BR_BR_JID;

    const result = await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, '');
    expect(result.acted).toBe(true);
  });

  it('NÃO age com apenas 1 sinal (ex: foreign sem outros sinais)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: true, autolink: true, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'teste' });
    msg.key.participant = FOREIGN_JID;

    const result = await evaluate(msg, ctx, GROUP_JID, FOREIGN_JID, 'João Silva');
    expect(result.acted).toBe(false);
  });

  it('NÃO ban/remover MASTER no anti-bot (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: true, autolink: true, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'cadastre-se em https://casino-win.xyz agora',
        linkPreview: { 'canonical-url': 'https://casino-win.xyz' },
      },
    });
    msg.key.participant = '5588998314322@c.us'; // MASTER_USER

    const result = await evaluate(msg, ctx, GROUP_JID, '5588998314322@c.us', 'Dono');
    expect(result.acted).toBe(false);
    expect(db.banUser).not.toHaveBeenCalled();
    expect(ctx.removeParticipant).not.toHaveBeenCalled();
  });

  it('NÃO ban/remover BOT no anti-bot (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: true, autolink: true, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'cadastre-se em https://casino-win.xyz agora',
        linkPreview: { 'canonical-url': 'https://casino-win.xyz' },
      },
    });
    msg.key.participant = '558581344211@c.us'; // BOT_NUMBER

    const result = await evaluate(msg, ctx, GROUP_JID, '558581344211@c.us', 'WarriorBlack');
    expect(result.acted).toBe(false);
    expect(db.banUser).not.toHaveBeenCalled();
    expect(ctx.removeParticipant).not.toHaveBeenCalled();
  });

  it('usuário estrangeiro normal com 2+ sinais → anti-bot continua funcionando', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: true, autolink: true, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'cadastre-se em https://casino-win.xyz agora',
        linkPreview: { 'canonical-url': 'https://casino-win.xyz' },
      },
    });
    msg.key.participant = '1234567890@c.us'; // estrangeiro genérico

    const result = await evaluate(msg, ctx, GROUP_JID, '1234567890@c.us', 'Bot');
    expect(result.acted).toBe(true);
    expect(result.action).toContain('ban');
    expect(db.banUser).toHaveBeenCalledWith(expect.objectContaining({ groupId: GROUP_JID, userId: '1234567890@c.us' }));
    expect(ctx.removeParticipant).toHaveBeenCalledWith(GROUP_JID, '1234567890@c.us');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluate() — anti-link
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('evaluate — anti-link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('remove mensagem com link de domínio suspeito (sem ban)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: true, antispam: false, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: { text: ' Acesse https://casino-win.xyz ' },
    });

    const result = await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'João');
    expect(result.acted).toBe(true);
    expect(result.action).toContain('delete');
    expect(result.action).not.toContain('ban');
    expect(ctx.sendMessage).toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });

  it('NÃO age com link legítimo', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: true, antispam: false, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: { text: ' Acesse https://google.com ' },
    });

    const result = await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'João');
    expect(result.acted).toBe(false);
  });

  it('NÃO deleta mensagem do MASTER (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: true, antispam: false, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: { text: ' Acesse https://casino-win.xyz ' },
    });
    msg.key.participant = '5588998314322@c.us'; // MASTER_USER

    const result = await evaluate(msg, ctx, GROUP_JID, '5588998314322@c.us', 'Dono');
    expect(result.acted).toBe(false);
    expect(ctx.sendMessage).not.toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });

  it('NÃO deleta mensagem do BOT (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: true, antispam: false, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: { text: ' Acesse https://casino-win.xyz ' },
    });
    msg.key.participant = '558581344211@c.us'; // BOT_NUMBER

    const result = await evaluate(msg, ctx, GROUP_JID, '558581344211@c.us', 'WarriorBlack');
    expect(result.acted).toBe(false);
    expect(ctx.sendMessage).not.toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluate() — anti-spam
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('evaluate — anti-spam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('NÃO age quando palavra-chave sozinha (sem contexto)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: false, antispam: true, detectar: true }));
    db.getRecentFingerprintCount.mockResolvedValue(0);

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'ganhe dinheiro fácil sem sair de casa' });

    const result = await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'João');
    expect(result.acted).toBe(false);
  });

  it('age quando palavra-chave + contexto (link suspeito)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: false, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'ganhe dinheiro rápido em https://casino-win.xyz',
        linkPreview: { 'canonical-url': 'https://casino-win.xyz' },
      },
    });

    const result = await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'Spammer');
    expect(result.acted).toBe(true);
    expect(result.action).toContain('delete');
  });

  it('age quando palavra-chave + contexto (foreign)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: false, antispam: true, detectar: true }));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'ganhe dinheiro fácil' });
    msg.key.participant = FOREIGN_JID;

    const result = await evaluate(msg, ctx, GROUP_JID, FOREIGN_JID, 'Spammer');
    expect(result.acted).toBe(true);
  });

  it('NÃO deleta mensagem do MASTER (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: false, antispam: true, detectar: true }));
    db.getRecentFingerprintCount.mockResolvedValue(5); // contexto

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'ganhe dinheiro rápido em https://casino-win.xyz',
        linkPreview: { 'canonical-url': 'https://casino-win.xyz' },
      },
    });
    msg.key.participant = '5588998314322@c.us'; // MASTER_USER

    const result = await evaluate(msg, ctx, GROUP_JID, '5588998314322@c.us', 'Dono');
    expect(result.acted).toBe(false);
    expect(ctx.sendMessage).not.toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });

  it('NÃO deleta mensagem do BOT (isProtectedTarget)', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue(groupConfig({ antiestrangeiro: false, remover: false, autolink: false, antispam: true, detectar: true }));
    db.getRecentFingerprintCount.mockResolvedValue(5);

    const ctx = makeCtx();
    const msg = makeWAMessage({
      extendedTextMessage: {
        text: 'ganhe dinheiro rápido em https://casino-win.xyz',
        linkPreview: { 'canonical-url': 'https://casino-win.xyz' },
      },
    });
    msg.key.participant = '558581344211@c.us'; // BOT_NUMBER

    const result = await evaluate(msg, ctx, GROUP_JID, '558581344211@c.us', 'WarriorBlack');
    expect(result.acted).toBe(false);
    expect(ctx.sendMessage).not.toHaveBeenCalledWith(GROUP_JID, '', expect.objectContaining({ delete: expect.any(Object) }));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluate() — integração
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('evaluate — integração', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignora quando nada está ligado', async () => {
    const db = await mockDb();
    db.getGroupMod.mockResolvedValue({});

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'oi' });

    const result = await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'Tester');
    expect(result.acted).toBe(false);
    expect(result.reason).toBe('nada ligado');
  });

  it('trata erro do banco sem crashar', async () => {
    const db = await mockDb();
    db.getGroupMod.mockRejectedValue(new Error('banco indisponível'));

    const ctx = makeCtx();
    const msg = makeWAMessage({ conversation: 'oi' });

    const result = await evaluate(msg, ctx, GROUP_JID, BR_BR_JID, 'Tester');
    expect(result.acted).toBe(false);
    expect(result.reason).toBe('erro ao carregar config');
  });
});
