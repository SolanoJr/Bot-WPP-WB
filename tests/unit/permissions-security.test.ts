import { describe, it, expect } from 'vitest';
import {
  isMaster,
  isProtectedTarget,
  cleanId,
  extractLid,
  getOwnerNotifyTarget,
  getBotIdentifiers,
} from '../../src/services/permissions';

// Identificadores reais em uso (26/08/2026), provados pelo log do Baileys:
//   myPN  = 558581344211  -> telefone do BOT
//   myLID = 2592935567439 -> LID do BOT  (NÃO é o dono!)
// Dono: 5588998314322 / 88998314322, LID documentado 202658048684056.
const DONO_PHONE = '5588998314322@c.us';
const DONO_PHONE_SEM_DDI = '88998314322@c.us';
const DONO_LID = '202658048684056@lid';
const BOT_PHONE = '558581344211@c.us';
const BOT_LID = '2592935567439@lid';

describe('permissions — escalada de privilégio por substring (regressão)', () => {
  it('NÃO aceita como MASTER um número que apenas CONTÉM os dígitos do dono', () => {
    // Antes da correção, isMaster usava userId.includes('88998314322') e estes
    // passavam como dono, dando controle total do bot a um terceiro.
    expect(isMaster('1188998314322@c.us')).toBe(false);
    expect(isMaster('5588998314322999@c.us')).toBe(false);
    expect(isMaster('088998314322@c.us')).toBe(false);
  });

  it('NÃO aceita como MASTER um LID que apenas contém o LID do dono', () => {
    expect(isMaster('9202658048684056@lid')).toBe(false);
    expect(isMaster('202658048684056999@lid')).toBe(false);
  });

  it('reconhece o dono pelo telefone (com e sem DDI)', () => {
    expect(isMaster(DONO_PHONE)).toBe(true);
    expect(isMaster('5588998314322')).toBe(true);
  });

  it('NUNCA trata o BOT como MASTER, mesmo com MASTER_LID mal configurado', () => {
    // O .env de produção tinha MASTER_LID=2592935567439@lid (LID do bot).
    // A blindagem remove o LID do bot do conjunto de LIDs do dono.
    expect(isMaster(BOT_LID)).toBe(false);
    expect(isMaster(BOT_PHONE)).toBe(false);
  });

  it('rejeita entradas inválidas sem lançar', () => {
    expect(isMaster('')).toBe(false);
    expect(isMaster(undefined as any)).toBe(false);
    expect(isMaster(null as any)).toBe(false);
    expect(isMaster({} as any)).toBe(false);
  });
});

describe('isProtectedTarget — imunidade do dono e do bot', () => {
  it('protege o dono em todos os formatos', () => {
    expect(isProtectedTarget(DONO_PHONE)).toBe(true);
    expect(isProtectedTarget(DONO_PHONE_SEM_DDI)).toBe(true);
    expect(isProtectedTarget(DONO_LID)).toBe(true);
    expect(isProtectedTarget('wpp:5588998314322@c.us')).toBe(true);
  });

  it('protege o próprio bot (telefone e LID, inclusive com sufixo de device)', () => {
    expect(isProtectedTarget(BOT_PHONE)).toBe(true);
    expect(isProtectedTarget('5585981344211@c.us')).toBe(true);
    expect(isProtectedTarget(BOT_LID)).toBe(true);
    expect(isProtectedTarget('2592935567439:60@lid')).toBe(true);
    expect(isProtectedTarget('wpp:558581344211@c.us')).toBe(true);
  });

  it('NÃO protege terceiros', () => {
    expect(isProtectedTarget('558899855554@c.us')).toBe(false);
    expect(isProtectedTarget('6289562706508@c.us')).toBe(false);
    expect(isProtectedTarget('123456789@lid')).toBe(false);
  });

  it('NÃO protege por sufixo acidental (endsWith era frouxo)', () => {
    // '99558581344211' termina com o número do bot; antes era protegido por engano.
    expect(isProtectedTarget('99558581344211@c.us')).toBe(false);
  });
});

describe('extractLid', () => {
  it('extrai apenas de identificadores @lid', () => {
    expect(extractLid('2592935567439@lid')).toBe('2592935567439');
    expect(extractLid('2592935567439:60@lid')).toBe('2592935567439');
    expect(extractLid('wpp:202658048684056@lid')).toBe('202658048684056');
  });

  it('devolve vazio para @c.us, grupos e lixo', () => {
    expect(extractLid('558581344211@c.us')).toBe('');
    expect(extractLid('120363410094452673@g.us')).toBe('');
    expect(extractLid('')).toBe('');
  });
});

describe('getOwnerNotifyTarget — alerta nunca vai para o próprio bot', () => {
  it('resolve um destino não-vazio', () => {
    expect(getOwnerNotifyTarget()).not.toBe('');
  });

  it('NUNCA devolve o identificador do bot', () => {
    const target = getOwnerNotifyTarget();
    const { number, lid } = getBotIdentifiers();
    expect(target).not.toContain(lid);
    expect(target).not.toContain(number);
  });

  it('o destino resolvido não é ele mesmo um alvo protegido-como-bot', () => {
    // Deve ser o dono (protegido) e não o bot.
    const target = getOwnerNotifyTarget();
    expect(isProtectedTarget(target)).toBe(true);
    expect(extractLid(target)).not.toBe(getBotIdentifiers().lid);
  });
});

describe('cleanId', () => {
  it('normaliza para dígitos', () => {
    expect(cleanId('558581344211@c.us')).toBe('558581344211');
    expect(cleanId('2592935567439:60@lid')).toBe('2592935567439');
    expect(cleanId('')).toBe('');
    expect(cleanId(undefined as any)).toBe('');
  });
});
