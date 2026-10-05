/**
 * Sarcasmo — automação independente do AutoMod.
 *
 * Cobre: detecção por palavra (não substring), camada determinística de
 * referência ao WarriorBlack, proteções (fromMe, anti-loop, cooldown),
 * e o pipeline normalizer → regra → resposta.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/services/loggerService', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {} },
  logInfo: () => {}, logWarning: () => {}, logError: () => {},
}));

let s: typeof import('../../src/services/sarcasmoService');

beforeAll(async () => {
  s = await import('../../src/services/sarcasmoService');
});

beforeEach(() => {
  s.resetCooldowns();
});

describe('containsBotWord — detecção por PALAVRA', () => {
  it('"bot" → true', () => expect(s.containsBotWord('bot')).toBe(true));
  it('"BOT" → true (case-insensitive)', () => expect(s.containsBotWord('BOT')).toBe(true));
  it('"o bot respondeu" → true', () => expect(s.containsBotWord('o bot respondeu')).toBe(true));
  it('"robotização" → FALSE (substring, não palavra)', () => expect(s.containsBotWord('robotização')).toBe(false));
  it('"robótica" → FALSE', () => expect(s.containsBotWord('robótica')).toBe(false));
  it('"bots" → FALSE (plural não é a palavra exata)', () => expect(s.containsBotWord('bots')).toBe(false));
  it('"" → false', () => expect(s.containsBotWord('')).toBe(false));
});

describe('referencesWarriorBlack — camada determinística', () => {
  it('"warriorblack" → true', () => {
    expect(s.referencesWarriorBlack({ text: 'warriorblack' })).toBe(true);
  });
  it('"warrior black" → true', () => {
    expect(s.referencesWarriorBlack({ text: 'warrior black' })).toBe(true);
  });
  it('reply ao bot (quotedFromMe) → true', () => {
    expect(s.referencesWarriorBlack({ text: 'oi', quotedFromMe: true })).toBe(true);
  });
  it('menção real ao bot → true', () => {
    expect(s.referencesWarriorBlack({ text: 'oi', mentionsBot: true })).toBe(true);
  });
  it('"bot responde" → true (chamada direta)', () => {
    expect(s.referencesWarriorBlack({ text: 'bot responde' })).toBe(true);
  });
  it('"bot ajuda" → true', () => {
    expect(s.referencesWarriorBlack({ text: 'bot ajuda' })).toBe(true);
  });
  it('"bot, ..." → true', () => {
    expect(s.referencesWarriorBlack({ text: 'bot, me ajuda' })).toBe(true);
  });
  it('"esse bot" → true', () => {
    expect(s.referencesWarriorBlack({ text: 'esse bot' })).toBe(true);
  });
  it('"chama o bot" → true', () => {
    expect(s.referencesWarriorBlack({ text: 'chama o bot' })).toBe(true);
  });
  it('"o bot respondeu" → true', () => {
    expect(s.referencesWarriorBlack({ text: 'o bot respondeu' })).toBe(true);
  });
  it('"robotização" → FALSE', () => {
    expect(s.referencesWarriorBlack({ text: 'robotização' })).toBe(false);
  });
  it('texto sem "bot" → false', () => {
    expect(s.referencesWarriorBlack({ text: 'bom dia pessoal' })).toBe(false);
  });
});

describe('shouldRespond — proteções', () => {
  it('fromMe=true → false (nunca à própria mensagem)', () => {
    expect(s.shouldRespond({ text: 'bot', fromMe: true, isGroup: true })).toBe(false);
  });
  it('fora de grupo → false', () => {
    expect(s.shouldRespond({ text: 'bot', fromMe: false, isGroup: false })).toBe(false);
  });
  it('texto vazio → false', () => {
    expect(s.shouldRespond({ text: '', fromMe: false, isGroup: true })).toBe(false);
  });
  it('"bot" em grupo, fromMe=false → true', () => {
    expect(s.shouldRespond({ text: 'bot', fromMe: false, isGroup: true })).toBe(true);
  });
  it('"robotização" em grupo → false', () => {
    expect(s.shouldRespond({ text: 'robotização', fromMe: false, isGroup: true })).toBe(false);
  });
});

describe('cooldown', () => {
  const G = '120363410094452673@g.us';
  const U = '5511888888888@s.whatsapp.net';
  const BASE = 100000; // > SARCASMO_GLOBAL_COOLDOWN_MS para evitar cooldown global inicial

  it('primeira resposta permitida', () => {
    expect(s.canRespond(G, U, BASE)).toBe(true);
  });

  it('segunda resposta dentro do cooldown → bloqueada', () => {
    s.markResponded(G, U, BASE);
    expect(s.canRespond(G, U, BASE + 1000)).toBe(false);
  });

  it('após o cooldown → permitida novamente', () => {
    s.markResponded(G, U, BASE);
    expect(s.canRespond(G, U, BASE + s.SARCASMO_COOLDOWN_MS + 1)).toBe(true);
  });

  it('cooldown é por grupo+usuário (outro grupo não é afetado APÓS cooldown global)', () => {
    s.markResponded(G, U, BASE);
    // Dentro do cooldown global (5s), outro grupo TAMBÉM é bloqueado
    expect(s.canRespond('120363419033272638@g.us', U, BASE + 1000)).toBe(false);
    // APÓS o cooldown global, outro grupo é permitido
    expect(s.canRespond('120363419033272638@g.us', U, BASE + s.SARCASMO_GLOBAL_COOLDOWN_MS + 1)).toBe(true);
  });

  it('cooldown é por usuário (outro usuário no mesmo grupo não é afetado APÓS cooldown global)', () => {
    s.markResponded(G, U, BASE);
    // Dentro do cooldown global, outro usuário TAMBÉM é bloqueado
    expect(s.canRespond(G, '5511999999999@s.whatsapp.net', BASE + 1000)).toBe(false);
    // APÓS o cooldown global, outro usuário é permitido
    expect(s.canRespond(G, '5511999999999@s.whatsapp.net', BASE + s.SARCASMO_GLOBAL_COOLDOWN_MS + 1)).toBe(true);
  });

  it('cooldown global: resposta recente bloqueia qualquer grupo', () => {
    s.markResponded(G, U, BASE);
    expect(s.canRespond('120363419033272638@g.us', '5511999999999@s.whatsapp.net', BASE + 1000)).toBe(false);
  });
});

describe('SARCASMO_TEXT', () => {
  it('é a frase esperada', () => {
    expect(s.SARCASMO_TEXT).toBe('tenho nada ver com isso sinhô');
  });
});

describe('comando $sarcasmo', () => {
  it('existe e está registrado', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const idxSrc = fs.readFileSync(path.resolve(__dirname, '../../src/bot/commands/index.ts'), 'utf8');
    expect(idxSrc).toMatch(/sarcasmo:\s*sarcasmoCommand/);
  });
});
