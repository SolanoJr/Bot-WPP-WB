import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Guard LAZY de MASTER_USER.
 *
 * O throw saiu do load do módulo e foi para o ponto de USO. O teste 1 é a
 * regressão que isto trava: antes, importar permissions.ts sem MASTER_USER no
 * env explodia — foi a causa do crash loop de 14/out (PM2 sem ecosystem não
 * carrega .env, e o guard disparava antes do dotenv ter chance de rodar).
 *
 * `vitest.config.ts` seta MASTER_USER no `test.env`, então os casos negativos
 * precisam deletar a var explicitamente. `tests/setup.ts` não reinjeta nada —
 * setupFiles rodam uma vez por arquivo, antes dos testes, não entre eles.
 */

const ORIGINAL = process.env.MASTER_USER;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MASTER_USER;
  else process.env.MASTER_USER = ORIGINAL;
});

describe('guard lazy de MASTER_USER', () => {
  it('importar permissions.ts SEM MASTER_USER não lança', async () => {
    delete process.env.MASTER_USER;

    await expect(import('../../src/services/permissions')).resolves.toBeDefined();
  });

  it('getMasterUser() SEM MASTER_USER lança', async () => {
    delete process.env.MASTER_USER;
    const perms = await import('../../src/services/permissions');

    expect(() => perms.getMasterUser())
      .toThrow('MASTER_USER environment variable is required');
  });

  it('isMaster() SEM MASTER_USER lança na AUTORIZAÇÃO, não no boot', async () => {
    delete process.env.MASTER_USER;
    const perms = await import('../../src/services/permissions');

    // Alvo NEUTRO: não pode ser o próprio bot, senão isBotTarget() dá early
    // return false antes de chegar no getMasterUser() e o throw não acontece.
    expect(() => perms.isMaster('5511999999999@c.us'))
      .toThrow('MASTER_USER environment variable is required');
  });

  it('getMasterUser() COM MASTER_USER devolve o valor configurado', async () => {
    process.env.MASTER_USER = '5588998314322@c.us';
    const perms = await import('../../src/services/permissions');

    expect(perms.getMasterUser()).toBe('5588998314322@c.us');
  });

  it('isMaster() reconhece o MASTER_USER configurado', async () => {
    process.env.MASTER_USER = '5588998314322@c.us';
    const perms = await import('../../src/services/permissions');

    expect(perms.isMaster('5588998314322@c.us')).toBe(true);
  });
});
