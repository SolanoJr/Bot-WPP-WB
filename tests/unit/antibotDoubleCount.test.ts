/**
 * REGRESSÃO — dupla contagem de sinais estruturais (CORRIGIDO).
 *
 * BUG (existia em 8371149 e d35547c):
 *   Uma ÚNICA mensagem estrutural (ex.: buttonsMessage) gerava DOIS sinais:
 *     - 'mensagem-interativa'  (msgType.buttonsMessage || ...)
 *     - 'buttonsMessage'       (structuralSignals)
 *   → botSignals.length === 2 → threshold (>=2) atingido → BAN
 *   com UMA só característica estrutural, de remetente brasileiro, nome humano,
 *   sem foreign / sem link / sem spam.
 *
 * CORREÇÃO:
 *   Estrutura de bot = UMA categoria = NO MÁXIMO UM sinal, nomeado
 *   'estrutura-bot(<tipos>)'. Sinais INDEPENDENTES (foreign, link, nome, spam)
 *   continuam somando separadamente. Rede de segurança deduplica por Set.
 *
 * Roda pelo caminho REAL de produção: evaluate().
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluate } from '../../src/services/autoModEngine';

vi.mock('../../src/services/databaseService', () => ({
  getGroupMod: vi.fn(async () => ({
    antiestrangeiro: false,   // isolando o anti-bot (foreign contaria como sinal)
    remover: true,
    autolink: false,
    antispam: false,
    detectar: true,
    audit_only: false,
  })),
  banUser: vi.fn(async () => {}),
  recordMemberJoin: vi.fn(async () => {}),
  recordMemberRemove: vi.fn(async () => {}),
  recordMessageFingerprint: vi.fn(async () => {}),
  getRecentFingerprintCount: vi.fn(async () => 0),
  cleanupOldFingerprintEntries: vi.fn(async () => {}),
  cleanupOldJoinEntries: vi.fn(async () => {}),
}));

vi.mock('../../src/services/infractions', () => ({
  recordInfraction: vi.fn(async () => 1),
}));

const GROUP_JID = '120363419033272638@g.us';
// Remetente BRASILEIRO (não-foreign) com nome humano (não-suspeito)
const BR_JID = '5585988887777@s.whatsapp.net';

function makeCtx() {
  return {
    sock: {},
    userId: '558581344211@s.whatsapp.net',
    groupName: 'Figurinhas/Stickers',
    getChat: vi.fn(async () => ({ participants: [], id: GROUP_JID, subject: 'Figurinhas/Stickers' })),
    sendMessage: vi.fn(async () => ({ id: 'sent-1' })),
    removeParticipant: vi.fn(async () => {}),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function msg(messageObj: any, participant = BR_JID) {
  return {
    key: { id: 'm-1', fromMe: false, remoteJid: GROUP_JID, participant },
    message: messageObj,
    messageTimestamp: Date.now(),
  } as any;
}

const BUTTONS = { buttonsMessage: { contentText: 'Clique', buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }] } };
const LIST = { listMessage: { title: 'L', description: 'D', buttonText: 'V', sections: [] } };
const TEMPLATE = { templateMessage: { hydratedTemplate: { hydratedContentText: 'T', hydratedButtons: [] } } };
const INTERACTIVE = { interactiveMessage: { body: { text: 'I' }, nativeFlowMessage: { buttons: [] } } };
const PRODUCT = { productMessage: { product: { productId: '1' }, businessOwnerJid: BR_JID } };

describe('AntiBot — 1 categoria estrutural = 1 sinal (NÃO bane sozinha)', () => {
  it('buttonsMessage isolado → NÃO bane (era o bug)', async () => {
    const ctx = makeCtx();
    const r = await evaluate(msg(BUTTONS), ctx as any, GROUP_JID, BR_JID, 'João Silva');
    expect(r.acted).toBe(false);
    expect(r.reason).not.toContain('antibot');
  });

  it('listMessage isolado → NÃO bane', async () => {
    const ctx = makeCtx();
    const r = await evaluate(msg(LIST), ctx as any, GROUP_JID, BR_JID, 'João Silva');
    expect(r.acted).toBe(false);
  });

  it('templateMessage isolado → NÃO bane', async () => {
    const ctx = makeCtx();
    const r = await evaluate(msg(TEMPLATE), ctx as any, GROUP_JID, BR_JID, 'João Silva');
    expect(r.acted).toBe(false);
  });

  it('interactiveMessage isolado → NÃO bane', async () => {
    const ctx = makeCtx();
    const r = await evaluate(msg(INTERACTIVE), ctx as any, GROUP_JID, BR_JID, 'João Silva');
    expect(r.acted).toBe(false);
  });

  it('productMessage isolado → NÃO bane (agora consistente com os demais)', async () => {
    const ctx = makeCtx();
    const r = await evaluate(msg(PRODUCT), ctx as any, GROUP_JID, BR_JID, 'João Silva');
    expect(r.acted).toBe(false);
  });

  it('estrutura + nome suspeito = 2 sinais INDEPENDENTES → BANE', async () => {
    const ctx = makeCtx();
    // Nome só com emojis → isSuspiciousDisplayName = true
    const r = await evaluate(msg(BUTTONS), ctx as any, GROUP_JID, BR_JID, '🤖');
    expect(r.acted).toBe(true);
    expect(r.reason).toContain('antibot');
    expect(r.reason).toContain('estrutura-bot');
    expect(r.reason).toContain('nome-suspeito');
  });

  it('estrutura + palavra-chave de spam = 2 sinais independentes → BANE', async () => {
    const ctx = makeCtx();
    const m = {
      buttonsMessage: {
        contentText: 'ganhe dinheiro fácil, recolha contínua de bônus',
        buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }],
      },
    };
    const r = await evaluate(msg(m), ctx as any, GROUP_JID, BR_JID, 'João Silva');
    expect(r.acted).toBe(true);
    expect(r.reason).toContain('spam-keyword');
  });
});

describe('AntiBot — o sinal estrutural aparece UMA vez', () => {
  it('botSignals não repete a categoria estrutural', async () => {
    const ctx = makeCtx();
    await evaluate(msg(BUTTONS), ctx as any, GROUP_JID, BR_JID, '🤖');
    const logs = ctx.log.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    // O motivo lista os sinais — 'estrutura-bot' deve aparecer exatamente 1x
    const ocorrencias = (logs.match(/estrutura-bot/g) || []).length;
    expect(ocorrencias).toBe(1);
    // E NÃO deve existir o rótulo antigo duplicado
    expect(logs).not.toContain('mensagem-interativa');
  });

  it('o nome do sinal expõe os tipos estruturais (auditoria)', async () => {
    const ctx = makeCtx();
    const r = await evaluate(msg(BUTTONS), ctx as any, GROUP_JID, BR_JID, '🤖');
    expect(r.reason).toContain('buttonsMessage');
  });
});

describe('AntiBot — testes negativos (nada disso é bot)', () => {
  const negativos: Array<[string, any]> = [
    ['texto humano normal', { conversation: 'Olá pessoal, tudo bem?' }],
    ['$ping', { conversation: '$ping' }],
    ['$menu', { conversation: '$menu' }],
    ['$help', { conversation: '$help' }],
    ['imagem normal', { imageMessage: { caption: 'Olha a praia' } }],
    ['vídeo normal', { videoMessage: { caption: 'Vídeo legal' } }],
    ['documento normal', { documentMessage: { title: 'doc.pdf' } }],
    ['sticker', { stickerMessage: { url: 'https://x/sticker.webp' } }],
    ['extendedText normal', { extendedTextMessage: { text: 'mensagem longa' } }],
  ];

  for (const [nome, payload] of negativos) {
    it(`${nome} → NÃO bane`, async () => {
      const ctx = makeCtx();
      const r = await evaluate(msg(payload), ctx as any, GROUP_JID, BR_JID, 'João Silva');
      expect(r.acted).toBe(false);
    });
  }

  it('sticker NUNCA gera sinal estrutural', async () => {
    const ctx = makeCtx();
    await evaluate(msg({ stickerMessage: { url: 'x' } }), ctx as any, GROUP_JID, BR_JID, 'João Silva');
    const logs = ctx.log.mock.calls.map((c: any[]) => c.join(' ')).join('\n');
    expect(logs).not.toContain('estrutura-bot');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Chave de DELETE — preserva participantAlt/addressingMode (grupos @lid)
// ═══════════════════════════════════════════════════════════════════════════

describe('AntiBot — chave de delete usa a key ORIGINAL (não reconstrói)', () => {
  it('preserva participantAlt e addressingMode da mensagem real', async () => {
    const ctx = makeCtx();
    // Payload como o Baileys entrega em grupo @lid (dados reais do log PM2)
    const m: any = {
      key: {
        id: '3EB0REALMSG',
        remoteJid: GROUP_JID,
        fromMe: false,
        participant: '33471368028338@lid',
        participantAlt: '6285822480546@s.whatsapp.net',
        addressingMode: 'lid',
      },
      message: { buttonsMessage: { contentText: 'spam kl7.games', buttons: [] } },
      messageTimestamp: Date.now(),
    };
    // Nome suspeito → 2 sinais → dispara a ação (com delete)
    const r = await evaluate(m, ctx as any, GROUP_JID, '33471368028338@lid', '🤖');
    expect(r.acted).toBe(true);

    const delCall = ctx.sendMessage.mock.calls.find((c: any[]) => c[2]?.delete);
    expect(delCall).toBeDefined();
    const key = delCall![2].delete;
    expect(key.id).toBe('3EB0REALMSG');
    expect(key.remoteJid).toBe(GROUP_JID);
    expect(key.participant).toBe('33471368028338@lid');
    // ⚠️ o que a versão antiga PERDIA:
    expect(key.participantAlt).toBe('6285822480546@s.whatsapp.net');
    expect(key.addressingMode).toBe('lid');
    expect(key.fromMe).toBe(false);
  });

  it('omite participantAlt quando a mensagem não o tem (sem campos undefined)', async () => {
    const ctx = makeCtx();
    const m: any = {
      key: { id: 'X1', remoteJid: GROUP_JID, fromMe: false, participant: BR_JID },
      message: { buttonsMessage: { contentText: 'spam', buttons: [] } },
      messageTimestamp: Date.now(),
    };
    await evaluate(m, ctx as any, GROUP_JID, BR_JID, '🤖');
    const delCall = ctx.sendMessage.mock.calls.find((c: any[]) => c[2]?.delete);
    const key = delCall![2].delete;
    expect('participantAlt' in key).toBe(false);
    expect('addressingMode' in key).toBe(false);
  });
});
