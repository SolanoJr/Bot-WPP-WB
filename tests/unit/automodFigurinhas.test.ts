/**
 * AUDITORIA FINAL — AutoMod no grupo Figurinhas.
 *
 * Prova, pelo caminho REAL (evaluate()), que:
 *   - um bot de cassino com mensagem estruturalmente estranha É detectado
 *   - pessoas normais (inclusive estrangeiras) NÃO são punidas
 *   - botão/mídia/figurinha legítimos NÃO são punidos só pela estrutura
 *   - o próprio bot e admins são protegidos
 *
 * Contexto Figurinhas: antiestrangeiro DESATIVADO — DDI nunca é evidência.
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluate } from '../../src/services/autoModEngine';

// Config REAL do grupo Figurinhas após a auditoria:
// antiestrangeiro=0, antispam/autolink/remover=1, detectar=1, audit_only=1
const FIGURINHAS_CONFIG = {
  antispam: true,
  antiestrangeiro: false,   // ← desativado neste grupo
  autolink: true,
  bemvindo: true,
  detectar: true,
  remover: true,
  audit_only: false,        // para provar a DECISÃO (não o audit-only)
};

vi.mock('../../src/services/databaseService', () => ({
  getGroupMod: vi.fn(async () => ({
    antispam: true, antiestrangeiro: false, autolink: true,
    bemvindo: true, detectar: true, remover: true, audit_only: false,
    antibot: true, casino: true,
  })),
  banUser: vi.fn(async () => {}),
  recordMemberJoin: vi.fn(async () => {}),
  recordMemberRemove: vi.fn(async () => {}),
  recordMessageFingerprint: vi.fn(async () => {}),
  getRecentFingerprintCount: vi.fn(async () => 0),
  cleanupOldFingerprintEntries: vi.fn(async () => {}),
  cleanupOldJoinEntries: vi.fn(async () => {}),
}));
vi.mock('../../src/services/infractions', () => ({ recordInfraction: vi.fn(async () => 1) }));

const FIG = '120363419033272638@g.us';
const LID_ESTRANGEIRO = '33471368028338@lid';          // +62 real do Figurinhas
const PN_ESTRANGEIRO = '6285822480546@s.whatsapp.net';
const LID_BR = '60382962012254@lid';                   // brasileiro
const PN_BR = '558899855554@s.whatsapp.net';

function makeCtx() {
  return {
    sock: {}, userId: '558581344211@s.whatsapp.net', fromMe: false, groupName: 'Figurinhas/Stickers',
    getChat: vi.fn(async () => ({ participants: [], id: FIG, subject: 'Figurinhas/Stickers' })),
    sendMessage: vi.fn(async () => ({ id: 'sent' })),
    removeParticipant: vi.fn(async () => {}),
    log: vi.fn(), warn: vi.fn(), error: vi.fn(),
  };
}

/** WAMessage com key REALISTA de grupo @lid. */
function wa(messageObj: any, participant = LID_ESTRANGEIRO, participantAlt?: string) {
  return {
    key: { id: `T-${Date.now()}`, remoteJid: FIG, fromMe: false,
           participant, participantAlt, addressingMode: 'lid' },
    message: messageObj,
    messageTimestamp: Math.floor(Date.now() / 1000),
  } as any;
}

async function run(msg: any, senderName: string, participant = LID_ESTRANGEIRO) {
  const ctx = makeCtx();
  const r = await evaluate(msg, ctx as any, FIG, participant, senderName);
  return { r, ctx };
}

const TEXTO_CASSINO = 'Alta taxa de vitórias, recolha contínua de bónus, kl7.games 777';

// ═══════════════════════════════════════════════════════════════════════════
// POSITIVOS — o bot de cassino DEVE ser detectado
// ═══════════════════════════════════════════════════════════════════════════

describe('POSITIVOS — bot de cassino é detectado', () => {
  it('1. estrutura interativa + sinais fortes de cassino', async () => {
    const { r } = await run(wa({
      buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [{ buttonId: '1', buttonText: { displayText: 'go' } }] },
    }, LID_ESTRANGEIRO, PN_ESTRANGEIRO), 'X');
    expect(r.acted).toBe(true);
    expect(r.reason).toContain('cassino');
    expect(r.action).toBe('ban+remove+delete+announce');
  });

  it('2. link de cassino + palavras-chave (texto puro, remetente BR)', async () => {
    const { r } = await run(wa({
      conversation: 'Ganhe dinheiro no cassino! Acesse betano.com e recolha seu bonus 777',
    }, LID_BR, PN_BR), 'João Silva', LID_BR);
    // casino-domain + casino-keywords = 2 sinais / 50% → não atinge >=60/3
    // (documentado como lacuna; ver relatório)
    expect(r.reason).toBeDefined();
  });

  it('3. interactiveMessage + múltiplos sinais', async () => {
    const { r } = await run(wa({
      interactiveMessage: {
        body: { text: 'Bônus de boas-vindas! Depósito e saque rápido ck7bet.com' },
        nativeFlowMessage: { buttons: [{ name: 'cta_url' }] },
      },
    }, LID_ESTRANGEIRO, PN_ESTRANGEIRO), 'X');
    expect(r.acted).toBe(true);
    expect(r.reason).toContain('cassino');
  });

  it('4. listMessage + cassino', async () => {
    const { r } = await run(wa({
      listMessage: { title: 'L', description: 'Rodadas grátis! Aposte em blaze.com ganhe prêmio', buttonText: 'go', sections: [] },
    }, LID_ESTRANGEIRO, PN_ESTRANGEIRO), 'X');
    expect(r.acted).toBe(true);
    expect(r.reason).toContain('cassino');
  });

  it('5. templateMessage + cassino', async () => {
    const { r } = await run(wa({
      templateMessage: { hydratedTemplate: { hydratedContentText: 'Jackpot! Aposte agora em sportingbet', hydratedButtons: [] } },
    }, LID_ESTRANGEIRO, PN_ESTRANGEIRO), 'X');
    expect(r.acted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NEGATIVOS — pessoas normais NÃO podem ser punidas
// ═══════════════════════════════════════════════════════════════════════════

describe('NEGATIVOS — usuário normal não é punido', () => {
  it('5. ESTRANGEIRO normal no Figurinhas → NÃO punido (requisito central)', async () => {
    const { r } = await run(wa({ conversation: 'Olá pessoal, tudo bem? Vim do Japão, gosto de figurinhas' }),
      'Daniel', LID_ESTRANGEIRO);
    expect(r.acted).toBe(false);
    expect(r.reason).not.toContain('antiestrangeiro');
  });

  it('5b. estrangeiro + DDI +62 sozinho NUNCA é suficiente', async () => {
    const { r } = await run(wa({ conversation: 'bom dia galera' }), 'Daniel', LID_ESTRANGEIRO);
    expect(r.acted).toBe(false);
  });

  it('6. texto normal → NÃO punido', async () => {
    const { r } = await run(wa({ conversation: 'alguém tem figurinha do gato?' }), 'Maria');
    expect(r.acted).toBe(false);
  });

  it('7. imagem normal → NÃO punida', async () => {
    const { r } = await run(wa({ imageMessage: { caption: 'olha essa foto' } }), 'Maria');
    expect(r.acted).toBe(false);
  });

  it('8. vídeo normal → NÃO punido', async () => {
    const { r } = await run(wa({ videoMessage: { caption: 'vídeo legal' } }), 'Maria');
    expect(r.acted).toBe(false);
  });

  it('9. documento normal → NÃO punido', async () => {
    const { r } = await run(wa({ documentMessage: { title: 'doc.pdf' } }), 'Maria');
    expect(r.acted).toBe(false);
  });

  it('10. figurinha normal → NÃO punida (grupo se chama Figurinhas, mas sticker ≠ bot)', async () => {
    const { r } = await run(wa({ stickerMessage: { url: 'https://x/s.webp', mimetype: 'image/webp' } }), 'Maria');
    expect(r.acted).toBe(false);
  });

  it('11. botão LEGÍTIMO → NÃO punido só pela estrutura', async () => {
    const { r } = await run(wa({
      buttonsMessage: { contentText: 'Você confirma presença no evento?', buttons: [{ buttonId: '1', buttonText: { displayText: 'Sim' } }] },
    }), 'Maria');
    expect(r.acted).toBe(false);
  });

  it('11b. listMessage legítimo → NÃO punido', async () => {
    const { r } = await run(wa({
      listMessage: { title: 'Cardápio', description: 'Escolha seu lanche', buttonText: 'Ver', sections: [] },
    }), 'Maria');
    expect(r.acted).toBe(false);
  });

  it('12. mensagem do próprio WarriorBlack → NUNCA avaliada', async () => {
    const ctx = makeCtx();
    const r = await evaluate(wa({ buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] } }),
      ctx as any, FIG, '558581344211@s.whatsapp.net', 'WarriorBlack');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('próprio bot');
  });

  it('13. admin legítimo não é banido por engano', async () => {
    const ctx = makeCtx();
    // admin do grupo (dados reais do metadata)
    ctx.getChat = vi.fn(async () => ({
      participants: [{ id: '27445294006297@lid', phoneNumber: '558781303081@s.whatsapp.net', isAdmin: true, isSuperAdmin: false }],
      id: FIG, subject: 'Figurinhas',
    }));
    const msg = wa({ buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] } }, '27445294006297@lid', '558781303081@s.whatsapp.net');
    const r = await evaluate(msg, ctx as any, FIG, '27445294006297@lid', 'X');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('admin');
  });

  it('13b. SolanoJr (MASTER) protegido', async () => {
    const ctx = makeCtx();
    const r = await evaluate(wa({ buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] } }),
      ctx as any, FIG, '202658048684056@lid', 'SolanoJr');
    expect(r.acted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E — payload estrutural chega ao detector
// ═══════════════════════════════════════════════════════════════════════════

describe('E — payload estrutural é lido corretamente', () => {
  it('extrai texto de buttonsMessage, interactiveMessage, listMessage e templateMessage', async () => {
    const { extractTextFromWAMessage } = await import('../../src/services/autoModEngine');
    const casos = [
      { buttonsMessage: { contentText: 'AAA', footerText: 'BBB', buttons: [{ buttonText: { displayText: 'CCC' } }] } },
      { interactiveMessage: { body: { text: 'DDD' }, footer: { text: 'EEE' } } },
      { listMessage: { title: 'FFF', description: 'GGG' } },
      { templateMessage: { hydratedTemplate: { hydratedContentText: 'HHH' } } },
    ];
    const esperado = ['AAA', 'DDD', 'FFF', 'HHH'];
    for (let i = 0; i < casos.length; i++) {
      const t = extractTextFromWAMessage(wa(casos[i]) as any);
      expect(t).toContain(esperado[i]);
    }
  });

  it('o tipo estrutural real é identificado', async () => {
    const { extractAntiBotSignals } = await import('../../src/services/autoModEngine');
    expect(extractAntiBotSignals(wa({ buttonsMessage: { contentText: 'x' } }) as any)).toEqual(['buttonsMessage']);
    expect(extractAntiBotSignals(wa({ interactiveMessage: { body: { text: 'x' } } }) as any)).toEqual(['interactiveMessage']);
    expect(extractAntiBotSignals(wa({ listMessage: { title: 'x' } }) as any)).toEqual(['listMessage']);
    expect(extractAntiBotSignals(wa({ templateMessage: {} }) as any)).toEqual(['templateMessage']);
    expect(extractAntiBotSignals(wa({ productMessage: {} }) as any)).toEqual(['productMessage']);
    // mídia e sticker NÃO são estrutura de bot
    expect(extractAntiBotSignals(wa({ stickerMessage: {} }) as any)).toEqual([]);
    expect(extractAntiBotSignals(wa({ imageMessage: {} }) as any)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G — delete usa a chave correta (LID/PN) em grupo @lid
// ═══════════════════════════════════════════════════════════════════════════

describe('G — delete preserva a WAMessageKey completa (grupo @lid)', () => {
  it('a chave enviada ao delete contém participant + participantAlt + addressingMode', async () => {
    const { ctx } = await run(wa({
      buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] },
    }, LID_ESTRANGEIRO, PN_ESTRANGEIRO), 'X');

    const delCall = ctx.sendMessage.mock.calls.find((c: any[]) => c[2]?.delete);
    expect(delCall).toBeDefined();
    const key = delCall![2].delete;
    expect(key.id).toBeTruthy();
    expect(key.remoteJid).toBe(FIG);
    expect(key.participant).toBe(LID_ESTRANGEIRO);          // LID
    expect(key.participantAlt).toBe(PN_ESTRANGEIRO);        // PN
    expect(key.addressingMode).toBe('lid');
    expect(key.fromMe).toBe(false);
  });

  it('removeParticipant recebe o LID (formato que o Baileys aceita em @lid)', async () => {
    const { ctx } = await run(wa({
      buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] },
    }, LID_ESTRANGEIRO, PN_ESTRANGEIRO), 'X');
    expect(ctx.removeParticipant).toHaveBeenCalledWith(FIG, LID_ESTRANGEIRO);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H — anti-loop e proteções
// ═══════════════════════════════════════════════════════════════════════════

describe('H — anti-loop e proteções', () => {
  it('o próprio bot é ignorado antes de qualquer análise', async () => {
    const ctx = makeCtx();
    const r = await evaluate(wa({ conversation: TEXTO_CASSINO }), ctx as any, FIG, '558581344211@s.whatsapp.net', 'WarriorBlack');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('próprio bot');
    // e nenhuma ação foi disparada
    expect(ctx.sendMessage).not.toHaveBeenCalled();
    expect(ctx.removeParticipant).not.toHaveBeenCalled();
  });

  it('senderJid igual ao groupId é ignorado (protocol message)', async () => {
    const ctx = makeCtx();
    const r = await evaluate(wa({ conversation: 'x' }), ctx as any, FIG, FIG, '');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('groupId');
  });

  it('senderJid sem @ é ignorado', async () => {
    const ctx = makeCtx();
    const r = await evaluate(wa({ conversation: 'x' }), ctx as any, FIG, 'semarroba', '');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('inválido');
  });

  it('announce só é enviado quando houve ação real', async () => {
    const { ctx } = await run(wa({
      buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] },
    }, LID_ESTRANGEIRO, PN_ESTRANGEIRO), 'X');
    const anuncios = ctx.sendMessage.mock.calls.filter((c: any[]) =>
      String(c[1] || '').includes('AUTOMOD'));
    expect(anuncios.length).toBeGreaterThan(0);
    // o anúncio explica o motivo
    expect(String(anuncios[0][1])).toMatch(/cassino|sinais/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LACUNA 1 (corrigida) — texto puro de cassino com remetente BRASILEIRO
// ═══════════════════════════════════════════════════════════════════════════

describe('LACUNA 1 — combinação forte cobre remetente brasileiro em @lid', () => {
  const TEXTO = 'Ganhe dinheiro no cassino! Acesse betano.com e recolha seu bonus 777';

  it('domínio + keywords, remetente BR, nome normal → AGORA detecta', async () => {
    const { r } = await run(wa({ conversation: TEXTO }, LID_BR, PN_BR), 'João Silva', LID_BR);
    expect(r.acted).toBe(true);
    expect(r.reason).toContain('cassino');
  });

  it('o classifier marca strongCombo nesse caso', async () => {
    const { classifyCasino } = await import('../../src/services/casinoClassifier');
    const c = classifyCasino({ message: { conversation: TEXTO } }, LID_BR, 'João Silva');
    expect(c.strongCombo).toBe(true);
    expect(c.signals).toContain('casino-domain');
    expect(c.signals).toContain('casino-keywords');
  });

  it('domínio + estrutura interativa (sem keywords) → strongCombo', async () => {
    const { classifyCasino } = await import('../../src/services/casinoClassifier');
    const c = classifyCasino(
      { message: { buttonsMessage: { contentText: 'acesse kl7.games', buttons: [] } } },
      LID_BR, 'João Silva',
    );
    expect(c.strongCombo).toBe(true);
  });

  it('CONTROLE: só keywords (sem domínio) NÃO vira combinação forte', async () => {
    const { classifyCasino } = await import('../../src/services/casinoClassifier');
    const c = classifyCasino(
      { message: { conversation: 'ganhei no jogo ontem, que sorte' } },
      LID_BR, 'João Silva',
    );
    expect(c.strongCombo).toBe(false);
  });

  it('CONTROLE: só domínio (sem keywords/estrutura) NÃO vira combinação forte', async () => {
    const { classifyCasino } = await import('../../src/services/casinoClassifier');
    const c = classifyCasino({ message: { conversation: 'veja betano.com' } }, LID_BR, 'João Silva');
    expect(c.strongCombo).toBe(false);
  });

  it('não regride: conversa normal continua sem detecção', async () => {
    const { r } = await run(wa({ conversation: 'bom dia, alguém viu o jogo ontem?' }, LID_BR, PN_BR), 'João Silva', LID_BR);
    expect(r.acted).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LACUNA 2 (corrigida) — AntiBot (regra 2c) agora protege admin
// ═══════════════════════════════════════════════════════════════════════════

describe('LACUNA 2 — AntiBot não bane admin do grupo', () => {
  it('admin + estrutura + nome suspeito (2 sinais do AntiBot) → NÃO bane', async () => {
    const ctx = makeCtx();
    // admin real do grupo Figurinhas
    ctx.getChat = vi.fn(async () => ({
      participants: [{ id: '27445294006297@lid', phoneNumber: '558781303081@s.whatsapp.net', isAdmin: true, isSuperAdmin: false }],
      id: FIG, subject: 'Figurinhas',
    }));
    // estrutura + nome suspeito = 2 sinais do AntiBot (sem cassino, para cair na 2c)
    const msg = wa({ buttonsMessage: { contentText: 'Clique aqui', buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }] } },
      '27445294006297@lid', '558781303081@s.whatsapp.net');
    const r = await evaluate(msg, ctx as any, FIG, '27445294006297@lid', '');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('admin');
  });

  it('não-admin com os MESMOS sinais → continua banindo', async () => {
    const ctx = makeCtx();
    ctx.getChat = vi.fn(async () => ({
      participants: [{ id: '27445294006297@lid', phoneNumber: '558781303081@s.whatsapp.net', isAdmin: true, isSuperAdmin: false }],
      id: FIG, subject: 'Figurinhas',
    }));
    // remetente diferente do admin → não é admin
    const msg = wa({ buttonsMessage: { contentText: 'Clique aqui', buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }] } },
      LID_BR, PN_BR);
    const r = await evaluate(msg, ctx as any, FIG, LID_BR, '');
    expect(r.acted).toBe(true);
    expect(r.reason).toContain('antibot');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDEM DOS GUARDS — admin protegido ANTES do audit_only
// ═══════════════════════════════════════════════════════════════════════════

describe('ordem dos guards — admin é reconhecido mesmo em audit_only', () => {
  async function comAuditOnly(auditOnly: boolean, cfg: any) {
    vi.resetModules();
    vi.doMock('../../src/services/databaseService', () => ({
      getGroupMod: vi.fn(async () => ({ ...cfg, audit_only: auditOnly })),
      banUser: vi.fn(async () => {}), recordMemberJoin: vi.fn(async () => {}),
      recordMemberRemove: vi.fn(async () => {}), recordMessageFingerprint: vi.fn(async () => {}),
      getRecentFingerprintCount: vi.fn(async () => 0),
      cleanupOldFingerprintEntries: vi.fn(async () => {}), cleanupOldJoinEntries: vi.fn(async () => {}),
    }));
    vi.doMock('../../src/services/infractions', () => ({ recordInfraction: vi.fn(async () => 1) }));
    return await import('../../src/services/autoModEngine');
  }

  const CFG_CASSINO = { antispam: true, antiestrangeiro: false, autolink: true, bemvindo: true, detectar: true, remover: true, casino: true, antibot: true };

  it('CASSINO: admin com audit_only=1 → reason "remetente é admin" (não "audit-only")', async () => {
    const { evaluate: ev } = await comAuditOnly(true, CFG_CASSINO);
    const ctx = makeCtx();
    ctx.getChat = vi.fn(async () => ({
      participants: [{ id: '27445294006297@lid', phoneNumber: '558781303081@s.whatsapp.net', isAdmin: true, isSuperAdmin: false }],
      id: FIG, subject: 'Figurinhas',
    }));
    const r = await ev(wa({ buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] } }, '27445294006297@lid', '558781303081@s.whatsapp.net'),
      ctx as any, FIG, '27445294006297@lid', 'X');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('admin');
    expect(r.reason).not.toContain('audit-only');
  });

  it('CASSINO: não-admin com audit_only=1 → reason "audit-only"', async () => {
    const { evaluate: ev } = await comAuditOnly(true, CFG_CASSINO);
    const ctx = makeCtx();
    const r = await ev(wa({ buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] } }, LID_BR, PN_BR),
      ctx as any, FIG, LID_BR, 'X');
    expect(r.reason).toContain('audit-only');
  });

  it('ANTIBOT: admin com audit_only=1 → reason "remetente é admin"', async () => {
    const { evaluate: ev } = await comAuditOnly(true, CFG_CASSINO);
    const ctx = makeCtx();
    ctx.getChat = vi.fn(async () => ({
      participants: [{ id: '27445294006297@lid', phoneNumber: '558781303081@s.whatsapp.net', isAdmin: true, isSuperAdmin: false }],
      id: FIG, subject: 'Figurinhas',
    }));
    // estrutura + nome suspeito = 2 sinais do AntiBot (sem cassino)
    const r = await ev(wa({ buttonsMessage: { contentText: 'Clique aqui', buttons: [{ buttonId: '1', buttonText: { displayText: 'OK' } }] } },
      '27445294006297@lid', '558781303081@s.whatsapp.net'),
      ctx as any, FIG, '27445294006297@lid', '');
    expect(r.acted).toBe(false);
    expect(r.reason).toContain('admin');
  });

  it('não regride: não-admin continua sendo tratado normalmente', async () => {
    const { evaluate: ev } = await comAuditOnly(false, CFG_CASSINO);
    const ctx = makeCtx();
    const r = await ev(wa({ buttonsMessage: { contentText: TEXTO_CASSINO, buttons: [] } }, LID_BR, PN_BR),
      ctx as any, FIG, LID_BR, 'X');
    expect(r.acted).toBe(true);
  });
});
