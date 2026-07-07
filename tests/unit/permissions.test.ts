/**
 * Testes de permissões — cobre os casos reais de falha reportados:
 * - "não é admin do grupo" sendo que o usuário É admin
 * - IDs com formatos diferentes (LID, @c.us, só números)
 * - MASTER sempre tem permissão
 */
import { describe, it, expect } from 'vitest';
import { isMaster, isAdmin, cleanId, getUserPermission, PERMISSIONS, hasPermission } from '../../src/services/permissions';

describe('cleanId', () => {
  it('remove @c.us e retorna só números', () => {
    expect(cleanId('558581344211@c.us')).toBe('558581344211');
    expect(cleanId('5588998314322@c.us')).toBe('5588998314322');
  });

  it('mantém ID que já é só número', () => {
    expect(cleanId('558581344211')).toBe('558581344211');
  });

  it('retorna string vazia para input inválido', () => {
    expect(cleanId('')).toBe('');
    expect(cleanId(null as any)).toBe('');
    expect(cleanId(undefined as any)).toBe('');
  });

  it('lida com LID (formato @lid)', () => {
    expect(cleanId('202658048684056@lid')).toBe('202658048684056');
  });
});

describe('isMaster', () => {
  it('reconhece MASTER pelo número completo com @c.us', () => {
    expect(isMaster('5588998314322@c.us')).toBe(true);
  });

  it('reconhece MASTER pelo número sem @c.us', () => {
    expect(isMaster('88998314322')).toBe(true);
  });

  it('reconhece MASTER pelo LID', () => {
    expect(isMaster('202658048684056@lid')).toBe(true);
  });

  it('rejeita número que não é MASTER', () => {
    expect(isMaster('558581344211@c.us')).toBe(false);
    expect(isMaster('5511999999999@c.us')).toBe(false);
  });

  it('retorna false para input inválido', () => {
    expect(isMaster('')).toBe(false);
    expect(isMaster(null as any)).toBe(false);
  });
});

describe('getUserPermission', () => {
  it('MASTER recebe nível MASTER', () => {
    expect(getUserPermission('5588998314322@c.us')).toBe(PERMISSIONS.MASTER);
    expect(getUserPermission('88998314322')).toBe(PERMISSIONS.MASTER);
  });

  it('usuário comum recebe nível USER', () => {
    expect(getUserPermission('5511999999999@c.us')).toBe(PERMISSIONS.USER);
  });
});

describe('hasPermission', () => {
  it('MASTER tem permissão para tudo', () => {
    expect(hasPermission('5588998314322@c.us', PERMISSIONS.MASTER)).toBe(true);
    expect(hasPermission('5588998314322@c.us', PERMISSIONS.ADMIN)).toBe(true);
    expect(hasPermission('5588998314322@c.us', PERMISSIONS.USER)).toBe(true);
  });

  it('USER não tem permissão de ADMIN ou MASTER', () => {
    expect(hasPermission('5511999999999@c.us', PERMISSIONS.ADMIN)).toBe(false);
    expect(hasPermission('5511999999999@c.us', PERMISSIONS.MASTER)).toBe(false);
  });

  it('USER tem permissão de USER', () => {
    expect(hasPermission('5511999999999@c.us', PERMISSIONS.USER)).toBe(true);
  });
});

describe('Caso real: admin do grupo sendo rejeitado', () => {
  /**
   * O bug reportado: usuário é admin do grupo mas recebe "não é admin".
   * Causa: cleanId() falhava com IDs em formatos inesperados.
   * Estes testes garantem que cleanId() é robusto.
   */
  it('cleanId lida com ID que vem como objeto serializado', () => {
    // Alguns contextos do whatsapp-web.js retornam o ID como string com prefixo
    expect(cleanId('wpp:5588998314322')).toBe('5588998314322');
  });

  it('cleanId lida com variação de número do MASTER (8 vs 9 dígitos)', () => {
    // Fallback para variação de número
    expect(cleanId('558898314322')).toBe('558898314322');
    expect(cleanId('5588998314322')).toBe('5588998314322');
  });

  it('isMaster aceita variação de dígito do número', () => {
    // O permissions.ts tem fallback para '8898314322'
    expect(isMaster('558898314322')).toBe(true);
  });
});
