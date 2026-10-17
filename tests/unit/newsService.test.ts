import { describe, expect, it, vi } from 'vitest';
import { resolveAdapterKey } from '../../src/services/newsService';

/**
 * newsService — resolveAdapterKey.
 *
 * A função é pura (não toca em PlatformManager nem em IA), mas o módulo importa
 * ambos. Os mocks abaixo só isolam esses imports — a lógica testada é a real.
 */

vi.mock('../../src/services/aiService', () => ({
  askAI: vi.fn(async () => 'ok'),
  askAINews: vi.fn(async () => 'ok'),
}));

vi.mock('../../src/platforms/PlatformManager', () => ({
  PlatformManager: {
    getInstance: vi.fn(() => ({ sendMessage: vi.fn(), getActivePlatforms: () => [] })),
  },
}));

const ACTIVE_WHATSAPP_MULTI = ['whatsapp', 'whatsapp:558581344211'];

describe('resolveAdapterKey', () => {
  it('wpp + chave com sufixo → prefere a mais específica', () => {
    expect(resolveAdapterKey(ACTIVE_WHATSAPP_MULTI, 'wpp:123@g.us')).toBe('whatsapp:558581344211');
  });

  it('wpp + só chave simples → chave simples', () => {
    expect(resolveAdapterKey(['whatsapp'], 'wpp:123@g.us')).toBe('whatsapp');
  });

  it('tg → telegram', () => {
    expect(resolveAdapterKey(['telegram'], 'tg:123')).toBe('telegram');
  });

  it('dc → discord', () => {
    expect(resolveAdapterKey(['discord'], 'dc:123')).toBe('discord');
  });

  it('sem adapter da plataforma → null', () => {
    expect(resolveAdapterKey(['telegram'], 'wpp:123')).toBeNull();
  });

  it('prefixo sem mapeamento → fallback direto', () => {
    expect(resolveAdapterKey(['foo'], 'foo:123')).toBe('foo');
  });

  it('prefixo maiúsculo → case-insensitive', () => {
    expect(resolveAdapterKey(['whatsapp'], 'WPP:123')).toBe('whatsapp');
  });

  it('sem adapters ativos → null', () => {
    expect(resolveAdapterKey([], 'wpp:123')).toBeNull();
  });
});
