import { describe, expect, it } from 'vitest';
import { isMaster, getUserPermission, PERMISSIONS, cleanId } from '../../src/services/permissions';

describe('permissions service', () => {
  it('verifica se usuário é MASTER corretamente', () => {
    // A função isMaster usa hardcoded checks específicos
    expect(isMaster('88998314322')).toBe(true);
    expect(isMaster('5588998314322@c.us')).toBe(true);
    expect(isMaster('202658048684056@lid')).toBe(true);
    expect(isMaster('558581344211@c.us')).toBe(false);
  });

  it('verifica permissões por nível', () => {
    expect(getUserPermission('88998314322')).toBe(PERMISSIONS.MASTER);
    expect(getUserPermission('5588998314322@c.us')).toBe(PERMISSIONS.MASTER);
    expect(getUserPermission('558581344211@c.us')).toBe(PERMISSIONS.USER);
  });

  it('retorna níveis de permissão corretos', () => {
    expect(PERMISSIONS.MASTER).toBe('MASTER');
    expect(PERMISSIONS.ADMIN).toBe('ADMIN');
    expect(PERMISSIONS.USER).toBe('USER');
  });

  it('limpa ID corretamente', () => {
    expect(cleanId('558581344211@c.us')).toBe('558581344211');
    expect(cleanId('558581344211')).toBe('558581344211');
    expect(cleanId('')).toBe('');
  });
});
